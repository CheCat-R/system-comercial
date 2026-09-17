/**
 * Única puerta de entrada de la UI de Pedidos. La UI nunca importa `data/orders.mock.js` directo
 * — mismo criterio que `clientsApi.js` / `inventoryApi.js` / `supplyApi.js`.
 *
 * Pedidos sigue siendo dueño del pago (reserva stock al confirmar, libera si se reembolsa antes de
 * despachar — docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §3.2). Desde
 * docs/MODULO-LOGISTICA-FULFILLMENT.md §4.8, **Logística pasa a ser dueña de todo el ciclo físico
 * posterior al pago**: `markDispatched`/`markDelivered`/`markReturnRequested` son los únicos puntos
 * de escritura de `fulfillmentStatus` a partir de "Pagado", y los llama `logisticaApi.js` en sus
 * transiciones de estado — nunca la UI de Pedidos directo (por eso ya no existe `dispatchOrder`
 * acá, y `refundOrder` sólo cubre el caso previo al despacho). `confirmRefund`/`rejectRefund` los
 * llama `financeApi.js` cuando Finanzas resuelve la cola de reembolsos.
 *
 * Estado en memoria: se resetea con un reload completo de la página (igual que los otros módulos).
 */
import { orders as seedOrders } from "../data/orders.mock";
import { getSku, warehouseLabel, reserveForOrder, releaseReservation } from "../../inventario/api/inventoryApi";
import { atDaysAgo } from "../lib/time";
// La auditoría es una hoja sin dependencias, igual que el bus: importarla no
// puede crear un ciclo. **Registrar es responsabilidad del módulo dueño**, que es
// el único que sabe qué cambió (MODULO-SEGURIDAD.md §2.7).
import { audit } from "../../seguridad/lib/audit";
import { change } from "../../seguridad/lib/diff";
// El portón de F3: quién puede, con qué motivo y quién más lo firma — decidido
// por el catálogo de permisos, no por esta pantalla ni por esta función.
import { sensitive } from "../../seguridad/lib/gate";
// El bus es una hoja sin dependencias: importarlo no puede crear un ciclo, y
// Pedidos no aprende qué es una automatización (docs/MODULO-AUTOMATIZACIONES.md §1.2).
import { emit } from "../../automatizaciones/lib/bus";

const clone = (x) => JSON.parse(JSON.stringify(x));

let _orders = clone(seedOrders);

const SHIPPING = 3500;
const TAX_RATE = 0.21;

const nowStamp = () => atDaysAgo(0, new Date().getHours().toString().padStart(2, "0"), new Date().getMinutes().toString().padStart(2, "0"), new Date().getSeconds().toString().padStart(2, "0"));

const enrichOrder = (order) => {
  const items = order.items.map((it) => {
    const sku = getSku(it.skuId);
    return { ...it, name: sku?.name || it.skuId, sku: sku?.sku || "", lineTotal: it.qty * it.unitPrice };
  });
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  // Descuento de Marketing (campo pasivo: lo calcula `marketingApi`, Pedidos sólo lo refleja — ver
  // docs/MODULO-MARKETING.md §6). El IVA se devenga sobre el neto ya con descuento. El envío puede
  // quedar en 0 si aplicó una promo/cupón de "envío gratis".
  const discount = Math.max(0, Math.round(order.discount || 0));
  const shipping = order.shipping != null ? order.shipping : SHIPPING;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * TAX_RATE);
  const total = taxable + shipping + tax;
  return {
    ...order,
    items,
    subtotal,
    discount,
    couponCode: order.couponCode || null,
    appliedPromotions: order.appliedPromotions || [],
    pointsRedeemed: Math.max(0, Math.round(order.pointsRedeemed || 0)),
    shipping,
    tax,
    total,
    warehouseName: warehouseLabel(order.warehouseId),
  };
};

export const listOrders = () =>
  _orders.map(enrichOrder).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getOrder = (id) => {
  const order = _orders.find((o) => o.id === id);
  return order ? enrichOrder(order) : null;
};

const asLines = (order) => order.items.map((it) => ({ skuId: it.skuId, qty: it.qty }));

/** Pedido_Pagado → reserva (§3.2). Si no alcanza el stock, la línea queda en backorder — nunca
 * se fuerza una reserva negativa. */
/** Un asiento de auditoría sobre un pedido, con su sujeto ya armado. */
const auditOrder = (action, id, changes, extra = {}) => audit({
  action,
  subject: { type: "order", id, label: `Pedido #${id}` },
  changes,
  requireActor: true,
  ...extra,
});

export const confirmPayment = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.paymentStatus !== "Pendiente") throw new Error("Sólo se puede confirmar el pago de un pedido pendiente.");

  const { backorders } = reserveForOrder(order.id, asLines(order), order.warehouseId);
  _orders = _orders.map((o) => (o.id === id ? { ...o, paymentStatus: "Pagado", paidAt: nowStamp(), backorders } : o));

  const paid = getOrder(id);
  emit("pedido.pagado", { type: "order", id }, {
    orderId: id, customerName: paid.customerName, total: paid.total,
    paymentMethod: paid.paymentMethod, backorders,
  });
  if (backorders.length) {
    emit("pedido.backorder", { type: "order", id }, {
      orderId: id, lines: backorders, missing: backorders.reduce((s, b) => s + b.missing, 0),
    });
  }

  auditOrder("pedidos.cobrar", id, [
    change("Estado de pago", "Pendiente", "Pagado"),
    ...(backorders.length ? [change("Backorder", null, `${backorders.length} línea(s) sin stock`)] : []),
  ]);

  return { order: paid, backorders };
};

/**
 * Pago rechazado por la pasarela.
 *
 * Se agregó junto con el módulo de Automatizaciones
 * (docs/MODULO-AUTOMATIZACIONES.md §3.8.1): antes el pago sólo iba de
 * `Pendiente` a `Pagado`, así que "pago rechazado" no se podía disparar.
 *
 * No hay nada que liberar: la reserva de stock se hace recién al **confirmar**
 * el pago, así que un pedido rechazado nunca llegó a reservar.
 */
export const rejectPayment = (id, { reason = "Rechazado por la pasarela" } = {}) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.paymentStatus !== "Pendiente") {
    throw new Error("Sólo se puede rechazar el pago de un pedido pendiente.");
  }
  _orders = _orders.map((o) => (o.id === id
    ? { ...o, paymentStatus: "Rechazado", rejectedAt: nowStamp(), rejectionReason: reason }
    : o));

  const rejected = getOrder(id);
  emit("pedido.pago_rechazado", { type: "order", id }, {
    orderId: id, customerName: rejected.customerName, total: rejected.total, reason,
  });
  auditOrder("pedidos.rechazar_pago", id, [change("Estado de pago", "Pendiente", "Rechazado")], { reason });
  return rejected;
};

/**
 * Reintento tras un rechazo: vuelve a dejar el pedido pendiente para poder
 * confirmarlo. Sin esto un rechazo sería un callejón sin salida.
 */
export const retryPayment = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.paymentStatus !== "Rechazado") {
    throw new Error("Sólo se puede reintentar el pago de un pedido rechazado.");
  }
  _orders = _orders.map((o) => (o.id === id
    ? { ...o, paymentStatus: "Pendiente", rejectedAt: null, rejectionReason: null }
    : o));
  return getOrder(id);
};

/**
 * Aplica un descuento de Marketing a un pedido **pendiente** (campo pasivo). El detalle
 * (`discount` / `couponCode` / `appliedPromotions` / `freeShipping`) lo calcula `marketingApi` y la
 * UI de alta de pedido lo pasa acá — Pedidos no valida cupones ni conoce las reglas.
 */
export const applyDiscountToOrder = (id, { discount = 0, couponCode = null, appliedPromotions = [], freeShipping = false, pointsRedeemed = 0 } = {}) => {
  const order = _orders.find((o) => o.id === id);
  if (!order) throw new Error("Pedido no encontrado.");
  if (order.paymentStatus !== "Pendiente") throw new Error("El descuento se aplica antes de confirmar el pago.");
  _orders = _orders.map((o) => (o.id === id
    ? { ...o, discount: Math.max(0, Math.round(discount)), couponCode, appliedPromotions, pointsRedeemed: Math.max(0, Math.round(pointsRedeemed)), ...(freeShipping ? { shipping: 0 } : {}) }
    : o));
  emit("pedido.descuento_aplicado", { type: "order", id }, { orderId: id, discount: Math.round(discount), couponCode });
  return getOrder(id);
};

/** Quita cualquier descuento de un pedido pendiente. */
export const clearOrderDiscount = (id) => {
  _orders = _orders.map((o) => (o.id === id ? { ...o, discount: 0, couponCode: null, appliedPromotions: [], pointsRedeemed: 0, shipping: undefined } : o));
  return getOrder(id);
};

/** Pedido cancelado antes de pagarse — no hay reserva que liberar. Un pedido
 * **rechazado** también se puede cancelar: si no, el rechazo sería un callejón
 * sin salida del que sólo se sale reintentando. */
export const cancelOrder = (id, { reason } = {}) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || !["Pendiente", "Rechazado"].includes(order.paymentStatus)) {
    throw new Error("Sólo se puede cancelar un pedido pendiente de pago o rechazado.");
  }

  // ⭐ El motivo lo exige el portón, no esta función: el grado lo declara el
  // catálogo de permisos (`pedidos.cancelar` = con motivo). Acá sólo se ejecuta.
  return sensitive({
    action: "pedidos.cancelar",
    subject: { type: "order", id, label: `Pedido #${id}` },
    reason,
    preview: `Cancelar el pedido #${id} de ${order.customerName}`,
    run: () => {
      _orders = _orders.map((o) => (o.id === id ? { ...o, paymentStatus: "Cancelado", fulfillmentStatus: "Cancelado" } : o));
      emit("pedido.cancelado", { type: "order", id }, { orderId: id, customerName: order.customerName });
      return {
        value: getOrder(id),
        changes: [
          change("Estado de pago", order.paymentStatus, "Cancelado"),
          change("Estado logístico", order.fulfillmentStatus, "Cancelado"),
        ],
      };
    },
  });
};

/** Reembolso previo al despacho: libera la reserva, nunca salió del depósito. Una vez que existe
 * un Envío en Logística, la devolución después de despachado se gestiona desde ahí (Incidencias,
 * Fase 2) — acá ya no se permite reembolsar un pedido despachado/entregado. */
export const refundOrder = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.paymentStatus !== "Pagado") throw new Error("Sólo se puede reembolsar un pedido pagado.");
  if (order.fulfillmentStatus !== "Sin despachar") {
    throw new Error("Este pedido ya tiene un envío en curso — las devoluciones después del despacho se gestionan desde Logística.");
  }
  releaseReservation(order.id, asLines(order), order.warehouseId);
  const amount = getOrder(id).total;
  _orders = _orders.map((o) => (o.id === id ? { ...o, paymentStatus: "Reembolsado", fulfillmentStatus: "Cancelado", refundedAt: nowStamp() } : o));
  emit("pedido.reembolsado", { type: "order", id }, { orderId: id, amount });
  auditOrder("finanzas.aprobar_reembolso", id, [
    change("Estado de pago", "Pagado", "Reembolsado"),
    change("Importe devuelto", null, amount, "money"),
  ]);
  return getOrder(id);
};

// ---------------------------------------------------------------------------
// Escritura exclusiva de Logística (docs/MODULO-LOGISTICA-FULFILLMENT.md §4.8): a partir del pago,
// el único que llama estas funciones es `logisticaApi.js`, nunca la UI de Pedidos directo.
// ---------------------------------------------------------------------------
export const markDispatched = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.paymentStatus !== "Pagado" || order.fulfillmentStatus !== "Sin despachar") {
    throw new Error("El pedido no está en condiciones de despacharse.");
  }
  _orders = _orders.map((o) => (o.id === id ? { ...o, fulfillmentStatus: "Despachado", dispatchedAt: nowStamp() } : o));
  return getOrder(id);
};

export const markDelivered = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.fulfillmentStatus !== "Despachado") throw new Error("El pedido no está despachado.");
  _orders = _orders.map((o) => (o.id === id ? { ...o, fulfillmentStatus: "Entregado", deliveredAt: nowStamp() } : o));
  return getOrder(id);
};

/**
 * Logística resolvió una Incidencia como "Devolver": la mercadería volvió al depósito, pero el
 * **dinero todavía no se movió** — queda "Reembolso pendiente" hasta que Finanzas apruebe
 * (docs/MODULO-FINANZAS-FACTURACION.md §5.3 / §6.11). Antes de la Fase 3 de Finanzas esto marcaba
 * "Reembolsado" de una; ahora hay un gate de aprobación.
 */
export const markReturnRequested = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order) throw new Error("Pedido no encontrado.");
  _orders = _orders.map((o) => (o.id === id
    ? { ...o, paymentStatus: "Reembolso pendiente", fulfillmentStatus: "Devuelto", returnedAt: nowStamp() }
    : o));
  // Único punto donde el pago pasa a "Reembolso pendiente", lo llame quien lo llame.
  emit("reembolso.solicitado", { type: "order", id }, { orderId: id, amount: getOrder(id).total });
  auditOrder("pedidos.devolucion", id, [
    change("Estado de pago", order.paymentStatus, "Reembolso pendiente"),
    change("Estado logístico", order.fulfillmentStatus, "Devuelto"),
  ]);
  return getOrder(id);
};

/** Finanzas aprobó y ejecutó el reembolso. Lo llama `financeApi.approveRefund`. */
export const confirmRefund = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order) throw new Error("Pedido no encontrado.");
  _orders = _orders.map((o) => (o.id === id ? { ...o, paymentStatus: "Reembolsado", refundedAt: nowStamp() } : o));
  auditOrder("finanzas.aprobar_reembolso", id, [
    change("Estado de pago", "Reembolso pendiente", "Reembolsado"),
    change("Importe devuelto", null, order.total, "money"),
  ]);
  return getOrder(id);
};

/** Finanzas rechazó el reembolso: la mercadería ya volvió, pero el dinero no se devuelve — queda
 * para resolución manual con el cliente. Lo llama `financeApi.rejectRefund`. */
export const rejectRefund = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order) throw new Error("Pedido no encontrado.");
  _orders = _orders.map((o) => (o.id === id ? { ...o, paymentStatus: "Pagado" } : o));
  auditOrder("finanzas.rechazar_reembolso", id, [change("Estado de pago", "Reembolso pendiente", "Pagado")]);
  return getOrder(id);
};
