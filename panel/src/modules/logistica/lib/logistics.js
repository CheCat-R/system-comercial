/** Estados del pipeline de un Envío — ver docs/MODULO-LOGISTICA-FULFILLMENT.md §3.1.
 * `devuelto`/`cancelado` son ramas laterales, no pasos del pipeline principal. */
export const SHIPMENT_STATUS = {
  pendiente_preparacion: { label: "Por preparar", tone: "neutral" },
  en_picking: { label: "En picking", tone: "info" },
  en_packing: { label: "En packing", tone: "info" },
  listo_despacho: { label: "Listo para despachar", tone: "warning" },
  despachado: { label: "Despachado", tone: "success" },
  en_transito: { label: "En tránsito", tone: "info" },
  en_reparto: { label: "En reparto", tone: "warning" },
  entregado: { label: "Entregado", tone: "success" },
  devuelto: { label: "Devuelto", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "danger" },
};

export const SHIPMENT_STEPS = [
  "pendiente_preparacion", "en_picking", "en_packing", "listo_despacho",
  "despachado", "en_transito", "en_reparto", "entregado",
];

export const TRACKING_STATUS_LABELS = {
  despachado: "Despachado desde el depósito",
  en_transito: "En tránsito",
  en_reparto: "En reparto",
  entregado: "Entregado",
};

/** Próximo estado de tracking sugerido según el estado actual — evita saltar pasos a mano. */
export const nextTrackingStatus = (status) => {
  const idx = SHIPMENT_STEPS.indexOf(status);
  return idx >= 0 && idx < SHIPMENT_STEPS.length - 1 ? SHIPMENT_STEPS[idx + 1] : null;
};

export const DELIVERY_PERFORMANCE = {
  a_tiempo: { label: "A tiempo", tone: "success" },
  demorado: { label: "Con demora", tone: "danger" },
};

/** Compara la entrega (real, o "ahora" si el envío todavía está en camino) contra la ETA estimada
 * (fecha de despacho + días del método) — puramente informativo, no bloquea ni cambia el pipeline. */
export const getDeliveryPerformance = (estimatedAt, referenceAt) => {
  if (!estimatedAt || !referenceAt) return null;
  return new Date(referenceAt) > new Date(estimatedAt) ? "demorado" : "a_tiempo";
};
