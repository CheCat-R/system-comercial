/**
 * Lo que Logística le ofrece al motor de Automatizaciones.
 *
 * El sujeto «envío» carga además **su pedido**, porque las condiciones
 * `order.*` aplican a un envío (§2.1) y las acciones sobre el pedido resuelven
 * el id desde el contexto. Que Logística importe a Pedidos ya era así antes de
 * esto y va en la dirección declarada en `ARCHITECTURE.md` §1.4
 * (Logística → Pedidos/Inventario, nadie vuelve).
 *
 * La cuenta del cliente **no** se busca acá: la agrega el CRM extendiendo este
 * mismo sujeto. Un panel sin CRM tiene envíos igual.
 */
import { getShipment, listShipments, openIncident } from "./api/logisticaApi";
import { SHIPMENT_STATUS } from "./lib/logistics";
import { getOrder } from "../pedidos/api/pedidosApi";
import { registrarSujeto, registrarEscaner, registrarAcciones } from "../automatizaciones/lib/registry";
import { interpolate } from "../automatizaciones/lib/subjects";
import {
  registrarCondiciones, asStatusOptions, NUMERIC_OPS, ENUM_OPS, TEXT_OPS, BOOL_OPS,
} from "../automatizaciones/lib/conditions";

/* -------------------------------------------------------------- sujeto */

registrarSujeto("shipment", {
  label: "Envío",
  cargar: (id, { safe }) => {
    const shipment = safe(() => getShipment(id));
    if (!shipment) return null;
    const order = shipment.order || safe(() => getOrder(shipment.orderId));
    return { shipment, order };
  },
  derivar: ({ shipment }, { hoursSince }) => ({
    shipmentHoursSinceDispatch: shipment ? hoursSince(shipment.dispatchedAt) : null,
    shipmentHoursWaiting: shipment ? hoursSince(shipment.createdAt) : null,
  }),
  describir: (subject, c) => `${subject.id} · ${c.shipment?.customerName || ""}`.trim(),
});

/* ------------------------------------------------------------ escáneres */

registrarEscaner("envio.sin_preparar", ({ hours = 48 } = {}, { safe, hoursSince }) =>
  safe(listShipments)
    .filter((s) => s.status === "pendiente_preparacion")
    .map((s) => ({ s, waiting: hoursSince(s.createdAt) ?? 0 }))
    .filter(({ waiting }) => waiting >= Number(hours))
    .map(({ s, waiting }) => ({
      subject: { type: "shipment", id: s.id },
      payload: { shipmentId: s.id, orderId: s.orderId, hoursWaiting: Math.round(waiting) },
    })));

registrarEscaner("envio.demorado", ({ hours = 72 } = {}, { safe, hoursSince }) =>
  safe(listShipments)
    .filter((s) => s.dispatchedAt && !s.deliveredAt && !["devuelto", "cancelado"].includes(s.status))
    .map((s) => ({ s, since: hoursSince(s.dispatchedAt) ?? 0 }))
    .filter(({ since }) => since >= Number(hours))
    .map(({ s, since }) => ({
      subject: { type: "shipment", id: s.id },
      payload: { shipmentId: s.id, orderId: s.orderId, hoursSinceDispatch: Math.round(since) },
    })));

/* ------------------------------------------------------------- acción */

registrarAcciones({
  "shipment.incident": {
    label: "Abrir una incidencia de envío", group: "Logística", tier: "contact",
    subjectTypes: ["shipment"],
    calls: "logisticaApi.openIncident",
    params: [
      { key: "type", label: "Tipo", type: "select", default: "demora",
        options: [
          { value: "demora", label: "Demora" },
          { value: "extravio", label: "Extravío" },
          { value: "danio", label: "Daño" },
          { value: "direccion", label: "Dirección incorrecta" },
        ] },
      { key: "description", label: "Descripción", type: "text", default: "Detectado automáticamente" },
    ],
    preview: (ctx, p) => `Abrir incidencia «${p.type}» sobre ${ctx.subject.id}`,
    run: (ctx, p) => {
      const inc = openIncident(ctx.subject.id, { type: p.type, description: interpolate(p.description, ctx) });
      return { ok: true, detail: `Incidencia ${inc.id} abierta`, ref: inc.id };
    },
  },
});

/* --------------------------------------------------------- condiciones */

registrarCondiciones({
  "shipment.status": {
    label: "Estado del envío", group: "Envío",
    subjectTypes: ["shipment"], type: "enum", ops: ENUM_OPS,
    source: "logistica/lib/logistics.js — SHIPMENT_STATUS",
    options: () => asStatusOptions(SHIPMENT_STATUS),
    get: (c) => c.shipment?.status ?? null,
  },
  "shipment.carrierName": {
    label: "Transportista", group: "Envío",
    subjectTypes: ["shipment"], type: "text", ops: TEXT_OPS,
    source: "logisticaApi.getShipment().carrierName",
    get: (c) => c.shipment?.carrierName ?? null,
  },
  "shipment.zoneName": {
    label: "Zona", group: "Envío",
    subjectTypes: ["shipment"], type: "text", ops: TEXT_OPS,
    source: "logisticaApi — única geografía del sistema",
    get: (c) => c.shipment?.zoneName ?? null,
  },
  "shipment.hoursSinceDispatch": {
    label: "Horas desde el despacho", group: "Envío",
    subjectTypes: ["shipment"], type: "number", ops: NUMERIC_OPS,
    source: "derivado de shipment.dispatchedAt contra el reloj",
    get: (c) => c.derived?.shipmentHoursSinceDispatch ?? null,
  },
  "shipment.hasOpenIncident": {
    label: "Tiene incidencia abierta", group: "Envío",
    subjectTypes: ["shipment"], type: "boolean", ops: BOOL_OPS,
    source: "logisticaApi.getShipment().hasOpenIncident",
    get: (c) => Boolean(c.shipment?.hasOpenIncident),
  },
});
