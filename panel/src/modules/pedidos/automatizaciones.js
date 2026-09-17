/**
 * Lo que Pedidos le ofrece al motor de Automatizaciones.
 *
 * Este archivo es **la única puerta** entre los dos módulos, y va en esta
 * dirección a propósito: Automatizaciones no sabe que existen los pedidos;
 * Pedidos se presenta. Si el proyecto no incluye este módulo, se borra la línea
 * correspondiente de `app/registrarDominio.js` y el motor sigue funcionando sin
 * el sujeto «pedido», sus condiciones y sus acciones.
 *
 * La regla de §1.1 sigue intacta: cada acción llama a la misma función del
 * `api/` que usaría una persona desde la pantalla.
 */
import { getOrder, cancelOrder, refundOrder, listOrders } from "./api/pedidosApi";
import { registrarSujeto, registrarEscaner, registrarAcciones } from "../automatizaciones/lib/registry";
import {
  registrarCondiciones, NUMERIC_OPS, ENUM_OPS, TEXT_OPS, LIST_OPS,
} from "../automatizaciones/lib/conditions";

/* -------------------------------------------------------------- sujeto */

registrarSujeto("order", {
  label: "Pedido",
  cargar: (id, { safe }) => {
    const order = safe(() => getOrder(id));
    return order ? { order } : null;
  },
  derivar: ({ order }, { daysSince }) => ({
    orderAgeDays: order ? daysSince(order.createdAt) : null,
  }),
  describir: (subject, c) => `${subject.id} · ${c.order?.customerName || ""}`.trim(),
});

/* ------------------------------------------------------------- escáner */

registrarEscaner("pedido.pendiente_vencido", ({ days = 3 } = {}, { safe, hoursSince }) =>
  safe(listOrders)
    .filter((o) => o.paymentStatus === "Pendiente")
    .map((o) => ({ o, age: (hoursSince(o.createdAt) ?? 0) / 24 }))
    .filter(({ age }) => age >= Number(days))
    .map(({ o, age }) => ({
      subject: { type: "order", id: o.id },
      payload: { orderId: o.id, days: Math.floor(age), total: o.total, customerName: o.customerName },
    })));

/* ------------------------------------------------------------ acciones */

/**
 * Las acciones sobre el pedido **resuelven el id desde el contexto**, no desde
 * el sujeto.
 *
 * Si usaran `ctx.subject.id` sólo podrían colgarse de una regla cuyo sujeto es
 * un pedido, y quedaba una asimetría rara: las condiciones `order.*` sí aplican
 * a un envío (leen `ctx.order`) pero las acciones no. Con esto, "cuando se
 * entrega un envío y pasó X, reembolsar el pedido" se puede expresar, que es una
 * regla perfectamente razonable.
 */
registrarAcciones({
  "order.cancel": {
    label: "Cancelar el pedido", group: "Pedidos", tier: "sensitive",
    subjectTypes: ["order", "shipment"],
    calls: "pedidosApi.cancelOrder",
    params: [],
    preview: (ctx) => (ctx.order
      ? `Cancelar ${ctx.order.id} (${ctx.order.customerName || "—"})`
      : "No hay pedido asociado a este sujeto."),
    run: (ctx) => {
      if (!ctx.order) return { ok: false, detail: "El sujeto no tiene un pedido asociado." };
      cancelOrder(ctx.order.id);
      return { ok: true, detail: `${ctx.order.id} cancelado` };
    },
  },

  "order.refund": {
    label: "Reembolsar el pedido", group: "Pedidos", tier: "sensitive",
    subjectTypes: ["order", "shipment"],
    calls: "pedidosApi.refundOrder",
    params: [],
    preview: (ctx) => (ctx.order
      ? `Reembolsar ${ctx.order.id} por ${(ctx.order.total ?? 0).toLocaleString("es-AR")}`
      : "No hay pedido asociado a este sujeto."),
    run: (ctx) => {
      if (!ctx.order) return { ok: false, detail: "El sujeto no tiene un pedido asociado." };
      refundOrder(ctx.order.id);
      return { ok: true, detail: `${ctx.order.id} reembolsado` };
    },
  },
});

/* --------------------------------------------------------- condiciones */

registrarCondiciones({
  "order.total": {
    label: "Total del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "money", ops: NUMERIC_OPS,
    source: "pedidosApi.getOrder().total",
    get: (c) => c.order?.total ?? null,
  },
  "order.subtotal": {
    label: "Subtotal del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "money", ops: NUMERIC_OPS,
    source: "pedidosApi.getOrder().subtotal",
    get: (c) => c.order?.subtotal ?? null,
  },
  "order.discount": {
    label: "Descuento del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "money", ops: NUMERIC_OPS,
    source: "pedidosApi.getOrder().discount",
    get: (c) => c.order?.discount ?? null,
  },
  "order.couponCode": {
    label: "Cupón del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "text", ops: TEXT_OPS,
    source: "pedidosApi.getOrder().couponCode",
    get: (c) => c.order?.couponCode ?? null,
  },
  "order.paymentStatus": {
    label: "Estado de pago", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "enum", ops: ENUM_OPS,
    source: "pedidosApi.getOrder().paymentStatus",
    options: () => ["Pendiente", "Pagado", "Rechazado", "Cancelado", "Reembolso pendiente", "Reembolsado"]
      .map((v) => ({ value: v, label: v })),
    get: (c) => c.order?.paymentStatus ?? null,
  },
  "order.fulfillmentStatus": {
    label: "Estado de fulfillment", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "enum", ops: ENUM_OPS,
    source: "pedidosApi.getOrder().fulfillmentStatus",
    options: () => ["Sin despachar", "Despachado", "Entregado", "Devuelto", "Cancelado"]
      .map((v) => ({ value: v, label: v })),
    get: (c) => c.order?.fulfillmentStatus ?? null,
  },
  "order.paymentMethod": {
    label: "Medio de pago", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "text", ops: TEXT_OPS,
    source: "pedidosApi.getOrder().paymentMethod",
    get: (c) => c.order?.paymentMethod ?? null,
  },
  "order.itemCount": {
    label: "Cantidad de líneas", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "number", ops: NUMERIC_OPS,
    source: "pedidosApi.getOrder().items.length",
    get: (c) => c.order?.items?.length ?? null,
  },
  "order.units": {
    label: "Unidades del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "number", ops: NUMERIC_OPS,
    source: "suma de order.items[].qty",
    get: (c) => c.order?.items?.reduce((s, i) => s + i.qty, 0) ?? null,
  },
  "order.ageDays": {
    label: "Antigüedad del pedido (días)", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "number", ops: NUMERIC_OPS,
    source: "derivado de order.createdAt contra el reloj",
    get: (c) => c.derived?.orderAgeDays ?? null,
  },
  "order.skus": {
    label: "SKUs del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "list", ops: LIST_OPS,
    source: "order.items[].skuId",
    get: (c) => c.order?.items?.map((i) => i.skuId) ?? [],
  },
  "order.warehouseId": {
    label: "Depósito del pedido", group: "Pedido",
    subjectTypes: ["order", "shipment"], type: "text", ops: TEXT_OPS,
    source: "pedidosApi.getOrder().warehouseId",
    get: (c) => c.order?.warehouseId ?? null,
  },
});
