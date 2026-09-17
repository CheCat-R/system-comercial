/**
 * Lo que Abastecimiento le ofrece al motor de Automatizaciones.
 *
 * Sólo un sujeto y dos condiciones: la orden de compra participa de las reglas
 * como **sujeto de eventos** (`compra.recibida`, `compra.cerrada`), no como algo
 * que una automatización manipule. Enviar o recibir una OC toca stock y plata:
 * eso lo hace una persona por la pantalla, no una regla.
 */
import { getPurchaseOrder } from "./api/supplyApi";
import { registrarSujeto } from "../automatizaciones/lib/registry";
import { registrarCondiciones, NUMERIC_OPS, TEXT_OPS } from "../automatizaciones/lib/conditions";

registrarSujeto("purchaseOrder", {
  label: "Orden de compra",
  cargar: (id, { safe }) => {
    const po = safe(() => getPurchaseOrder(id));
    return po ? { purchaseOrder: po } : null;
  },
  describir: (subject, c) => `${subject.id} · ${c.purchaseOrder?.supplierName || ""}`.trim(),
});

registrarCondiciones({
  "purchaseOrder.total": {
    label: "Total de la orden de compra", group: "Compras",
    subjectTypes: ["purchaseOrder"], type: "money", ops: NUMERIC_OPS,
    source: "supplyApi.getPurchaseOrder().total",
    get: (c) => c.purchaseOrder?.total ?? null,
  },
  "purchaseOrder.supplierName": {
    label: "Proveedor", group: "Compras",
    subjectTypes: ["purchaseOrder"], type: "text", ops: TEXT_OPS,
    source: "supplyApi.getPurchaseOrder().supplierName",
    get: (c) => c.purchaseOrder?.supplierName ?? null,
  },
});
