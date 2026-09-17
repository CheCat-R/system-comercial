/**
 * Única puerta de entrada de la UI de Logística. Nada en `modules/logistica/*.jsx` importa
 * `data/*.mock.js` directo — mismo criterio que los demás módulos.
 *
 * Logística pasa a ser dueña del ciclo físico posterior al pago (§4.8 del doc). Consume funciones
 * que **ya existían** en `inventoryApi.js` (`fulfillOrder`, `returnGoods`) y escribe de vuelta en
 * Pedidos sólo en 3 hitos (`markDispatched`/`markDelivered`/`markReturnRequested`, expuestas por
 * `pedidosApi.js` para este uso exclusivo) — Pedidos ya no despacha ni devuelve directo, ver
 * docs/MODULO-LOGISTICA-FULFILLMENT.md §5.1. El reembolso posterior a la devolución lo aprueba
 * Finanzas (docs/MODULO-FINANZAS-FACTURACION.md §5.3).
 *
 * Estado en memoria: se resetea con un reload completo de la página (igual que los otros módulos).
 */
import { carriers as seedCarriers } from "../data/carriers.mock";
import { shippingMethods as seedMethods } from "../data/shippingMethods.mock";
import { zones as seedZones } from "../data/zones.mock";
import { rates as seedRates } from "../data/rates.mock";
import { shipments as seedShipments } from "../data/shipments.mock";
import { incidents as seedIncidents } from "../data/incidents.mock";
import { nextTrackingStatus, TRACKING_STATUS_LABELS, getDeliveryPerformance } from "../lib/logistics";
import { atDaysAgo, addDays } from "../lib/time";
import { getSku, warehouseLabel, fulfillOrder, returnGoods } from "../../inventario/api/inventoryApi";
import { listOrders, getOrder, markDispatched, markDelivered, markReturnRequested } from "../../pedidos/api/pedidosApi";
// Logística es dueña del ciclo físico posterior al pago (§4.8): los eventos de
// despacho y entrega los emite ella, no Pedidos, aunque el campo lo guarde
// Pedidos. Si los emitieran los dos, toda regla se ejecutaría dos veces.
import { emit } from "../../automatizaciones/lib/bus";
import { port } from "../../integraciones/lib/ports";
// Hoja sin dependencias: registrar es del módulo dueño (MODULO-SEGURIDAD.md §2.7).
import { audit } from "../../seguridad/lib/audit";
import { change } from "../../seguridad/lib/diff";

/**
 * ⭐ El código de seguimiento, por el puerto `shipping.track`.
 *
 * El `fallback` es el de siempre: `{prefijo}-{8 dígitos}`, armado una sola vez
 * al despachar. Con un transportista conectado, el código y los eventos vendrían
 * de él — y los eventos de tracking, que hoy se cargan a mano, entrarían por
 * webhook traducidos a `envio.en_transito` / `envio.entregado`, que ya existen.
 */
const trackPort = port("shipping.track", {
  fallback: ({ carrierPrefix }) => ({
    trackingCode: `${carrierPrefix || "ENV"}-${Math.floor(10_000_000 + Math.random() * 90_000_000)}`,
    status: "despachado",
    events: [],
  }),
});

const clone = (x) => JSON.parse(JSON.stringify(x));

let _carriers = clone(seedCarriers);
let _methods = clone(seedMethods);
let _zones = clone(seedZones);
let _rates = clone(seedRates);
let _shipments = clone(seedShipments);
let _incidents = clone(seedIncidents);

const _seq = {
  carrier: _carriers.length, method: _methods.length, zone: _zones.length,
  rate: _rates.length, shipment: _shipments.length, incident: _incidents.length,
};

const nowStamp = () => {
  const d = new Date();
  return atDaysAgo(0, String(d.getHours()).padStart(2, "0"), String(d.getMinutes()).padStart(2, "0"), String(d.getSeconds()).padStart(2, "0"));
};

// ---------------------------------------------------------------------------
// Transportistas
// ---------------------------------------------------------------------------
export const listCarriers = () => _carriers;
export const getCarrier = (id) => _carriers.find((c) => c.id === id) || null;

export const createCarrier = (data) => {
  const carrier = { id: `CAR-${String(++_seq.carrier).padStart(2, "0")}`, isActive: true, ...data };
  _carriers = [..._carriers, carrier];
  return carrier;
};

export const updateCarrier = (id, data) => {
  _carriers = _carriers.map((c) => (c.id === id ? { ...c, ...data } : c));
  return getCarrier(id);
};

export const toggleCarrierActive = (id) => {
  _carriers = _carriers.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c));
  return getCarrier(id);
};

// ---------------------------------------------------------------------------
// Métodos de envío
// ---------------------------------------------------------------------------
export const listMethods = (carrierId) => (carrierId ? _methods.filter((m) => m.carrierId === carrierId) : _methods);
export const getMethod = (id) => _methods.find((m) => m.id === id) || null;

export const createMethod = ({ carrierId, name, etaDays }) => {
  const method = { id: `MET-${String(++_seq.method).padStart(2, "0")}`, carrierId, name, etaDays: Number(etaDays) || 1, isActive: true };
  _methods = [..._methods, method];
  return method;
};

export const updateMethod = (id, data) => {
  _methods = _methods.map((m) => (m.id === id ? { ...m, ...data } : m));
  return getMethod(id);
};

export const toggleMethodActive = (id) => {
  _methods = _methods.map((m) => (m.id === id ? { ...m, isActive: !m.isActive } : m));
  return getMethod(id);
};

// ---------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------
export const listZones = () => _zones;
export const getZone = (id) => _zones.find((z) => z.id === id) || null;

export const createZone = ({ name, keywords }) => {
  const zone = { id: `ZON-${String(++_seq.zone).padStart(2, "0")}`, name, keywords: keywords || [] };
  _zones = [..._zones, zone];
  return zone;
};

export const updateZone = (id, data) => {
  _zones = _zones.map((z) => (z.id === id ? { ...z, ...data } : z));
  return getZone(id);
};

/** Resuelve la Zona de una dirección por palabra clave (texto libre, sin validación geográfica
 * real en esta etapa — ver §3.5). La última zona configurada actúa como catch-all. */
export const resolveZoneId = (address) => {
  const lower = (address || "").toLowerCase();
  for (const z of _zones) {
    if (z.keywords.some((k) => lower.includes(k.toLowerCase()))) return z.id;
  }
  return _zones[_zones.length - 1]?.id || null;
};

// ---------------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------------
const enrichRate = (r) => ({
  ...r,
  carrierName: getCarrier(r.carrierId)?.name || "",
  methodName: getMethod(r.methodId)?.name || "",
  zoneName: getZone(r.zoneId)?.name || "",
});

export const listRates = ({ carrierId, zoneId } = {}) =>
  _rates
    .filter((r) => (!carrierId || r.carrierId === carrierId) && (!zoneId || r.zoneId === zoneId))
    .map(enrichRate);

export const getRate = (id) => {
  const r = _rates.find((x) => x.id === id);
  return r ? enrichRate(r) : null;
};

export const findApplicableRate = ({ carrierId, methodId, zoneId, weightKg }) => {
  const r = _rates.find(
    (x) => x.carrierId === carrierId && x.methodId === methodId && x.zoneId === zoneId
      && weightKg >= x.weightFrom && weightKg <= x.weightTo
  );
  return r ? enrichRate(r) : null;
};

export const createRate = (data) => {
  const rate = {
    id: `RATE-${String(++_seq.rate).padStart(3, "0")}`,
    carrierId: data.carrierId, methodId: data.methodId, zoneId: data.zoneId,
    weightFrom: Number(data.weightFrom), weightTo: Number(data.weightTo), cost: Number(data.cost),
  };
  _rates = [..._rates, rate];
  return enrichRate(rate);
};

export const updateRate = (id, data) => {
  _rates = _rates.map((r) => (r.id === id ? { ...r, ...data } : r));
  return getRate(id);
};

export const deleteRate = (id) => {
  _rates = _rates.filter((r) => r.id !== id);
};

// ---------------------------------------------------------------------------
// Envíos — el núcleo del módulo
// ---------------------------------------------------------------------------
const computeWeight = (order) => {
  const raw = order.items.reduce((sum, it) => sum + (getSku(it.skuId)?.weightKg || 0) * it.qty, 0);
  return Math.round(raw * 100) / 100; // evita arrastrar errores de punto flotante (0.8 + 0.2*2 → 1.2000000000000002)
};

/** ETA de entrega = despacho + días estimados del método (§"tracking más rico" — Fase 3). Se
 * compara contra la entrega real (o contra "ahora" si sigue en camino) sólo para mostrar un badge
 * informativo — nunca bloquea ni altera el pipeline. */
const enrichShipment = (s) => {
  const order = getOrder(s.orderId);
  const method = getMethod(s.methodId);
  const estimatedDeliveryAt = s.dispatchedAt && method ? addDays(s.dispatchedAt, method.etaDays) : null;
  const referenceAt = s.deliveredAt || (["devuelto", "cancelado"].includes(s.status) ? null : nowStamp());
  return {
    ...s,
    order,
    customerName: order?.customerName || "—",
    address: order?.address || "",
    warehouseName: warehouseLabel(s.warehouseId),
    carrierName: getCarrier(s.carrierId)?.name || null,
    methodName: getMethod(s.methodId)?.name || null,
    zoneName: getZone(s.zoneId)?.name || null,
    items: order?.items || [],
    estimatedWeightKg: order ? computeWeight(order) : 0,
    estimatedDeliveryAt,
    deliveryPerformance: getDeliveryPerformance(estimatedDeliveryAt, referenceAt),
  };
};

const createShipmentRecord = (order) => {
  const shipment = {
    id: `SHP-${String(++_seq.shipment).padStart(3, "0")}`,
    orderId: order.id,
    warehouseId: order.warehouseId,
    carrierId: null,
    methodId: null,
    zoneId: resolveZoneId(order.address),
    weightKg: null,
    cost: null,
    status: "pendiente_preparacion",
    pickedItems: [],
    hasOpenIncident: false,
    blockedByStockDiff: false,
    stockDiffNote: null,
    trackingCode: null,
    createdAt: nowStamp(),
    dispatchedAt: null,
    deliveredAt: null,
    trackingEvents: [],
  };
  _shipments = [shipment, ..._shipments];
  return shipment;
};

/** Materializa el Envío de un pedido pagado que todavía no tiene uno — se deriva en lectura, nunca
 * se crea "por las dudas" (mismo criterio que ya usa Reposición con sus sugerencias calculadas). */
const ensureShipment = (orderId) => {
  const existing = _shipments.find((s) => s.orderId === orderId);
  if (existing) return existing;
  const order = getOrder(orderId);
  if (!order || order.paymentStatus !== "Pagado") return null;
  return createShipmentRecord(order);
};

const ensureShipmentsForPaidOrders = () => {
  listOrders().filter((o) => o.paymentStatus === "Pagado").forEach((o) => ensureShipment(o.id));
};

export const listShipments = ({ status } = {}) => {
  ensureShipmentsForPaidOrders();
  return _shipments
    .map(enrichShipment)
    .filter((s) => !status || s.status === status)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const getShipment = (id) => {
  ensureShipmentsForPaidOrders();
  const shipment = _shipments.find((s) => s.id === id);
  return shipment ? enrichShipment(shipment) : null;
};

/** Punto de entrada desde `PedidoDetalle.jsx` ("Ver envío") — crea el Envío si todavía no existe. */
export const getShipmentForOrder = (orderId) => {
  const shipment = ensureShipment(orderId);
  return shipment ? enrichShipment(shipment) : null;
};

export const getShipmentCost = (orderId) => _shipments.find((s) => s.orderId === orderId)?.cost ?? null;

export const getPortfolioSummary = () => {
  const list = listShipments();
  const dispatched = list.filter((s) => s.dispatchedAt);
  const avgPrepHours = dispatched.length
    ? dispatched.reduce((sum, s) => sum + (new Date(s.dispatchedAt) - new Date(s.createdAt)) / 3_600_000, 0) / dispatched.length
    : 0;

  // % de envíos con incidencia: sobre despachados (sólo ahí se puede abrir una), cuenta la
  // incidencia haya quedado o no resuelta — mide "cuántos tuvieron un problema", no sólo los
  // que siguen abiertos ahora mismo (eso ya lo cubre el tab "Con incidencia" del listado).
  const shipmentIdsWithIncident = new Set(_incidents.map((i) => i.shipmentId));
  const withIncident = dispatched.filter((s) => shipmentIdsWithIncident.has(s.id));
  const incidentRate = dispatched.length ? (withIncident.length / dispatched.length) * 100 : 0;

  // Costo de envío promedio por zona — sólo envíos con costo ya congelado (packing en adelante).
  const zoneCostMap = new Map();
  dispatched.filter((s) => s.cost != null).forEach((s) => {
    const entry = zoneCostMap.get(s.zoneId) || { zoneId: s.zoneId, zoneName: s.zoneName, count: 0, totalCost: 0 };
    entry.count += 1;
    entry.totalCost += s.cost;
    zoneCostMap.set(s.zoneId, entry);
  });
  const costByZone = [...zoneCostMap.values()]
    .map((z) => ({ ...z, avgCost: z.totalCost / z.count }))
    .sort((a, b) => b.avgCost - a.avgCost);

  return {
    porPreparar: list.filter((s) => s.status === "pendiente_preparacion").length,
    enProceso: list.filter((s) => ["en_picking", "en_packing"].includes(s.status)).length,
    enTransito: list.filter((s) => ["en_transito", "en_reparto"].includes(s.status)).length,
    avgPrepHours,
    incidentRate,
    incidentCount: withIncident.length,
    dispatchedCount: dispatched.length,
    costByZone,
  };
};

// ---------------------------------------------------------------------------
// Pipeline: Preparación → Picking → Packing → Despacho → Tránsito → Entrega (§3.1)
// ---------------------------------------------------------------------------
export const startPicking = (id) => {
  const s = _shipments.find((x) => x.id === id);
  if (!s || s.status !== "pendiente_preparacion") throw new Error("Sólo se puede iniciar el picking de un envío por preparar.");
  _shipments = _shipments.map((x) => (x.id === id ? { ...x, status: "en_picking" } : x));
  return getShipment(id);
};

export const togglePicked = (id, skuId) => {
  _shipments = _shipments.map((x) => {
    if (x.id !== id) return x;
    const already = x.pickedItems.includes(skuId);
    return { ...x, pickedItems: already ? x.pickedItems.filter((s) => s !== skuId) : [...x.pickedItems, skuId] };
  });
  return getShipment(id);
};

export const completePicking = (id) => {
  const shipment = getShipment(id);
  if (!shipment || shipment.status !== "en_picking") throw new Error("El envío no está en picking.");
  if (shipment.blockedByStockDiff) {
    throw new Error("Hay una diferencia de stock reportada — corregila en Inventario y marcala como resuelta antes de continuar.");
  }
  const allSkuIds = shipment.items.map((it) => it.skuId);
  if (!allSkuIds.every((sku) => shipment.pickedItems.includes(sku))) {
    throw new Error("Todavía faltan ítems por recolectar.");
  }
  _shipments = _shipments.map((x) => (x.id === id ? { ...x, status: "en_packing" } : x));
  return getShipment(id);
};

/** Si el picking encuentra una diferencia física, el Envío no puede avanzar hasta que Inventario
 * la explique con un Ajuste (§4.5) — nunca se despacha "lo que hay". */
export const reportStockDifference = (id, { skuId, note } = {}) => {
  const shipment = _shipments.find((x) => x.id === id);
  if (!shipment || shipment.status !== "en_picking") throw new Error("Sólo se puede reportar una diferencia durante el picking.");
  const sku = getSku(skuId);
  _shipments = _shipments.map((x) => (x.id === id
    ? { ...x, blockedByStockDiff: true, stockDiffNote: note?.trim() || `Diferencia de stock detectada en ${sku?.name || skuId}` }
    : x));
  return getShipment(id);
};

export const clearStockDifference = (id) => {
  _shipments = _shipments.map((x) => (x.id === id ? { ...x, blockedByStockDiff: false, stockDiffNote: null } : x));
  return getShipment(id);
};

/** Registra el peso real y, si hace falta, el transportista/método elegido; calcula y congela el
 * costo (§3.5). Si no hay tarifa configurada para esa combinación, no avanza — nunca se despacha
 * con costo $0 (§4.6). */
export const completePacking = (id, { weightKg, carrierId, methodId }) => {
  const shipment = _shipments.find((x) => x.id === id);
  if (!shipment || shipment.status !== "en_packing") throw new Error("El envío no está en packing.");

  const finalCarrierId = carrierId || shipment.carrierId;
  const finalMethodId = methodId || shipment.methodId;
  if (!finalCarrierId || !finalMethodId) throw new Error("Elegí transportista y método antes de continuar.");

  const order = getOrder(shipment.orderId);
  const weight = Number(weightKg) > 0 ? Number(weightKg) : computeWeight(order);
  const rateMatch = findApplicableRate({ carrierId: finalCarrierId, methodId: finalMethodId, zoneId: shipment.zoneId, weightKg: weight });
  if (!rateMatch) {
    throw new Error("No hay tarifa configurada para ese transportista, método y zona con este peso — cargala en Tarifas antes de continuar.");
  }

  _shipments = _shipments.map((x) => (x.id === id
    ? { ...x, status: "listo_despacho", weightKg: weight, carrierId: finalCarrierId, methodId: finalMethodId, cost: rateMatch.cost }
    : x));
  return getShipment(id);
};

/** El punto de no retorno (§3.3): consume stock real y recién ahí Pedidos se entera (hito 1/3). */
export const dispatchShipment = (id) => {
  const shipment = _shipments.find((x) => x.id === id);
  if (!shipment || shipment.status !== "listo_despacho") throw new Error("El envío no está listo para despachar.");

  const order = getOrder(shipment.orderId);
  fulfillOrder(order.id, order.items.map((it) => ({ skuId: it.skuId, qty: it.qty })), shipment.warehouseId);
  markDispatched(order.id);

  // El código sale del puerto `shipping.track`; sin proveedor lo resuelve el
  // fallback local, que es el mismo simulado de antes.
  const prefix = getCarrier(shipment.carrierId)?.trackingPrefix || "ENV";
  const { trackingCode } = trackPort({
    shipmentId: id, orderId: shipment.orderId, carrierId: shipment.carrierId, carrierPrefix: prefix,
  });

  const event = { status: "despachado", location: `Despachado desde ${warehouseLabel(shipment.warehouseId)}`, at: nowStamp() };
  _shipments = _shipments.map((x) => (x.id === id
    ? { ...x, status: "despachado", dispatchedAt: nowStamp(), trackingCode, trackingEvents: [...x.trackingEvents, event] }
    : x));
  emit("envio.despachado", { type: "shipment", id }, {
    shipmentId: id, orderId: shipment.orderId, carrierId: shipment.carrierId, trackingCode,
  });
  return getShipment(id);
};

/** Tracking simulado (§1, decisión tomada): un evento por vez, siguiendo el orden del pipeline —
 * nunca se puede saltar de "despachado" a "en_reparto" sin pasar por "en_transito". */
export const addTrackingEvent = (id, { location } = {}) => {
  const shipment = _shipments.find((x) => x.id === id);
  if (!shipment) throw new Error("Envío no encontrado.");
  const next = nextTrackingStatus(shipment.status);
  if (!next || !["en_transito", "en_reparto"].includes(next)) {
    throw new Error("Este envío no admite más eventos de tracking manuales.");
  }
  const event = { status: next, location: location?.trim() || TRACKING_STATUS_LABELS[next], at: nowStamp() };
  _shipments = _shipments.map((x) => (x.id === id ? { ...x, status: next, trackingEvents: [...x.trackingEvents, event] } : x));
  return getShipment(id);
};

export const markShipmentDelivered = (id) => {
  const shipment = _shipments.find((x) => x.id === id);
  if (!shipment || shipment.status !== "en_reparto") throw new Error("Sólo se puede entregar un envío en reparto.");

  markDelivered(shipment.orderId);
  const event = { status: "entregado", location: shipment.address || "Domicilio del cliente", at: nowStamp() };
  _shipments = _shipments.map((x) => (x.id === id
    ? { ...x, status: "entregado", deliveredAt: nowStamp(), trackingEvents: [...x.trackingEvents, event] }
    : x));
  const delivered = getShipment(id);
  emit("envio.entregado", { type: "shipment", id }, {
    shipmentId: id, orderId: shipment.orderId, leadTimeHours: delivered.leadTimeHours ?? null,
  });
  return delivered;
};

// ---------------------------------------------------------------------------
// Incidencias — evento lateral, nunca un estado del pipeline (§3.1/§4.7). Se abren sobre un
// Envío ya despachado y se resuelven con una de 3 salidas: reintentar (sigue su curso), devolver
// (fuerza `devuelto` + repone stock + reembolsa) o contactar cliente (deriva a CX, no cambia nada).
// ---------------------------------------------------------------------------
const enrichIncident = (inc) => {
  const shipment = _shipments.find((s) => s.id === inc.shipmentId);
  const order = shipment ? getOrder(shipment.orderId) : null;
  return {
    ...inc,
    shipmentStatus: shipment?.status || null,
    orderId: shipment?.orderId || null,
    customerName: order?.customerName || "—",
    ageHours: inc.status === "abierta" || inc.status === "en_gestion"
      ? (new Date(nowStamp()) - new Date(inc.openedAt)) / 3_600_000
      : null,
  };
};

export const listIncidents = ({ status } = {}) =>
  _incidents.map(enrichIncident)
    .filter((i) => !status || i.status === status)
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

export const getIncidentsForShipment = (shipmentId) =>
  _incidents.filter((i) => i.shipmentId === shipmentId).map(enrichIncident).sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

export const openIncident = (shipmentId, { type, description } = {}) => {
  const shipment = _shipments.find((s) => s.id === shipmentId);
  if (!shipment) throw new Error("Envío no encontrado.");
  if (!["despachado", "en_transito", "en_reparto"].includes(shipment.status)) {
    throw new Error("Sólo se puede reportar una incidencia sobre un envío despachado.");
  }
  const incident = {
    id: `INC-${String(++_seq.incident).padStart(3, "0")}`,
    shipmentId, type, description: description?.trim() || "",
    status: "abierta", resolution: null, note: "",
    openedAt: nowStamp(), resolvedAt: null,
  };
  _incidents = [incident, ..._incidents];
  _shipments = _shipments.map((s) => (s.id === shipmentId ? { ...s, hasOpenIncident: true } : s));
  emit("envio.incidencia_abierta", { type: "shipment", id: shipmentId }, {
    shipmentId, orderId: shipment.orderId, kind: type, note: incident.description,
  });
  audit({
    action: "logistica.incidencias",
    subject: { type: "shipment", id: shipmentId, label: `Envío ${shipmentId}` },
    changes: [change("Incidencia", null, `${type} — ${incident.description || "sin detalle"}`)],
    ref: incident.id,
  });
  return enrichIncident(incident);
};

export const markIncidentInGestion = (id) => {
  _incidents = _incidents.map((i) => (i.id === id && i.status === "abierta" ? { ...i, status: "en_gestion" } : i));
  return _incidents.find((i) => i.id === id) ? enrichIncident(_incidents.find((i) => i.id === id)) : null;
};

/** La única resolución que mueve al Envío es "devolver": repone el stock (`returnGoods`) y **pide**
 * el reembolso (`markReturnRequested` → el pedido queda "Reembolso pendiente"). El movimiento de
 * dinero lo aprueba Finanzas desde su cola de reembolsos (docs/MODULO-FINANZAS-FACTURACION.md §5.3). */
export const resolveIncident = (id, { resolution, note } = {}) => {
  const incident = _incidents.find((i) => i.id === id);
  if (!incident || incident.status === "resuelta") throw new Error("Esta incidencia ya está resuelta.");
  const shipment = _shipments.find((s) => s.id === incident.shipmentId);
  if (!shipment) throw new Error("Envío no encontrado.");

  if (resolution === "devolver") {
    const order = getOrder(shipment.orderId);
    returnGoods(order.id, order.items.map((it) => ({ skuId: it.skuId, qty: it.qty })), shipment.warehouseId);
    markReturnRequested(order.id);
    const event = { status: "devuelto", location: `Devuelto a ${warehouseLabel(shipment.warehouseId)}`, at: nowStamp() };
    _shipments = _shipments.map((s) => (s.id === shipment.id ? { ...s, status: "devuelto", trackingEvents: [...s.trackingEvents, event] } : s));
  }
  // "reintentar" y "contactar_cliente" no cambian el estado del envío — son las otras 2 salidas.

  _incidents = _incidents.map((i) => (i.id === id ? { ...i, status: "resuelta", resolution, note: note?.trim() || "", resolvedAt: nowStamp() } : i));

  const stillOpen = _incidents.some((i) => i.shipmentId === shipment.id && i.id !== id && i.status !== "resuelta");
  _shipments = _shipments.map((s) => (s.id === shipment.id ? { ...s, hasOpenIncident: stillOpen } : s));

  emit("envio.incidencia_resuelta", { type: "shipment", id: shipment.id }, { shipmentId: shipment.id, resolution });
  return enrichIncident(_incidents.find((i) => i.id === id));
};
