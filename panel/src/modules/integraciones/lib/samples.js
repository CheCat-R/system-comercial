/**
 * Payloads de ejemplo para el dry-run.
 *
 * **Para los puertos que ya consume el núcleo, el ejemplo sale de datos
 * reales**: un pedido de verdad, un comprobante de verdad. Un dry-run sobre un
 * objeto inventado prueba que el código corre; uno sobre un pedido real prueba
 * que la traducción sirve — que es la pregunta.
 *
 * Para los puertos todavía declarados y sin consumidor, se arma un ejemplo desde
 * los tipos del contrato y **se dice que es sintético**.
 */
import { listOrders } from "../../pedidos/api/pedidosApi";
import { listDocuments } from "../../facturacion/api/billingApi";
import { listShipments } from "../../logistica/api/logisticaApi";
import { getPort } from "./catalog";

const safe = (fn, fallback = []) => { try { return fn(); } catch { return fallback; } };

/** Valor plausible según el tipo declarado, para los puertos sin datos reales. */
const byType = (type) => ({
  string: "texto",
  money: 100000,
  number: 1,
  decimal: 0.05,
  boolean: true,
  date: new Date().toISOString().slice(0, 10),
  list: [],
  object: {},
}[type] ?? null);

const synthetic = (port) => {
  const payload = {};
  Object.entries(port.input).forEach(([k, t]) => { payload[k] = byType(t); });
  return { payload, real: false, source: "Generado desde los tipos del contrato: este puerto todavía no lo consume nadie." };
};

/** Ejemplos reales para los puertos cableados. */
const REAL = {
  "payments.fee": () => {
    const order = safe(listOrders).find((o) => o.paymentStatus === "Pagado");
    if (!order) return null;
    return {
      payload: { orderId: order.id, total: order.total, paymentMethod: order.paymentMethod },
      real: true,
      source: `Pedido ${order.id} de ${order.customerName}`,
    };
  },

  "invoicing.issue": () => {
    // ⭐ Facturación le dice `docType` a lo que el puerto llama `type`, y
    // `customerTaxCondition` a lo que el puerto llama `condition`: **esa
    // traducción es justamente el trabajo del adaptador**. Buscar por el nombre
    // del puerto en vez de por el del módulo hacía que este ejemplo nunca
    // encontrara un comprobante, así que el dry-run de facturación caía siempre
    // al sintético — decía la verdad ("ejemplo sintético") por el motivo
    // equivocado. Encontrado probando F3.
    const doc = safe(listDocuments).find((d) => d.docType === "factura");
    if (!doc) return null;
    return {
      payload: {
        documentId: doc.id, type: doc.docType, letter: doc.letter,
        pointOfSale: doc.pointOfSale, number: doc.fullNumber, issueDate: doc.issueDate,
        receiver: { name: doc.customerName, taxId: doc.customerTaxId, condition: doc.customerTaxCondition },
        lines: doc.lines, totals: { net: doc.totalNet, vat: doc.totalVat, total: doc.total },
      },
      real: true,
      source: `Comprobante ${doc.fullNumber} de ${doc.customerName}`,
    };
  },

  "shipping.track": () => {
    const shipment = safe(listShipments).find((s) => s.dispatchedAt) || safe(listShipments)[0];
    if (!shipment) return null;
    return {
      payload: {
        shipmentId: shipment.id, orderId: shipment.orderId,
        carrierId: shipment.carrierId, carrierPrefix: "AND",
      },
      real: true,
      source: `Envío ${shipment.id} · ${shipment.customerName}`,
    };
  },
};

/**
 * El payload que se mandaría, para el dry-run.
 * @returns {{ payload, real, source }}
 */
export const sampleFor = (portKey) => {
  const port = getPort(portKey);
  if (!port) return null;

  const real = REAL[portKey]?.();
  return real || synthetic(port);
};

/* ======================================================== entrantes (F3) */

/**
 * Payloads de webhook para el inyector (§5, regla 4).
 *
 * **Salen del dominio real, igual que los del dry-run.** Un webhook de ejemplo
 * con `orderId: "ORD-123"` prueba que el parser corre; uno con un pedido que
 * está pendiente de verdad prueba que el efecto ocurre — que es la pregunta.
 * Por eso el ejemplo dice a qué pedido apunta y en qué estado está.
 *
 * El cuarto es a propósito **intraducible**: un contracargo no existe como hecho
 * del dominio, y la regla es no inventar un evento para acomodar a un proveedor.
 * Poder ver ese descarte vale tanto como ver los que entran.
 */
export const webhookSamples = () => {
  const orders = safe(listOrders);
  const pending = orders.find((o) => o.paymentStatus === "Pendiente");
  const anyOrder = pending || orders[0];
  const shipments = safe(listShipments);
  const enRoute = shipments.find((s) => s.status === "en_reparto") || shipments[0];

  return [
    {
      key: "payment.approved",
      label: "Pago acreditado",
      translatesTo: "pedido.pagado",
      hint: pending
        ? `El pedido ${pending.id} está Pendiente: el efecto lo va a confirmar de verdad.`
        : "No hay ningún pedido pendiente ahora, así que el módulo dueño lo va a rechazar — y eso también es correcto.",
      raw: {
        id: `evt_${Date.now().toString().slice(-6)}`,
        type: "payment.approved",
        createdAt: new Date().toISOString(),
        data: { orderId: anyOrder?.id || "10000", amount: anyOrder?.total || 0, currency: "ARS", last4: "4242" },
      },
    },
    {
      key: "payment.rejected",
      label: "Pago rechazado",
      translatesTo: "pedido.pago_rechazado",
      hint: "Rechazo del emisor: es una respuesta de negocio, no una falla de integración.",
      raw: {
        id: `evt_${(Date.now() + 1).toString().slice(-6)}`,
        type: "payment.rejected",
        createdAt: new Date().toISOString(),
        data: { orderId: anyOrder?.id || "10000", reason: "Fondos insuficientes", last4: "4242" },
      },
    },
    {
      key: "shipment.delivered",
      label: "Envío entregado",
      translatesTo: "envio.entregado",
      hint: enRoute?.status === "en_reparto"
        ? `El envío ${enRoute.id} está en reparto: se va a marcar entregado.`
        : "No hay envíos en reparto ahora: Logística va a rechazar el efecto y quedará registrado.",
      raw: {
        id: `evt_${(Date.now() + 2).toString().slice(-6)}`,
        type: "shipment.delivered",
        createdAt: new Date().toISOString(),
        data: { shipmentId: enRoute?.id || "SHP-1", deliveredAt: new Date().toISOString(), receivedBy: "Titular" },
      },
    },
    {
      key: "dispute.opened",
      label: "Contracargo abierto (no se puede traducir)",
      translatesTo: null,
      hint: "El panel no tiene un hecho de dominio que signifique esto. Se descarta y se registra: no se inventa un evento nuevo para acomodar a un proveedor.",
      raw: {
        id: `evt_${(Date.now() + 3).toString().slice(-6)}`,
        type: "dispute.opened",
        createdAt: new Date().toISOString(),
        data: { orderId: anyOrder?.id || "10000", amount: anyOrder?.total || 0, reason: "fraud" },
      },
    },
  ];
};
