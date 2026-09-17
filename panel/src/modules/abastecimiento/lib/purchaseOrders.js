/** Estados de una Orden de Compra — ver docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §3.6. Sin flujo
 * de aprobación (decisión tomada): de Borrador se pasa directo a Enviada. */
export const PO_STATUS = {
  borrador: { label: "Borrador", tone: "warning" },
  enviada: { label: "Enviada", tone: "info" },
  parcial: { label: "Parcial", tone: "warning" },
  recibida: { label: "Recibida", tone: "success" },
  cerrada: { label: "Cerrada", tone: "neutral" },
  cancelada: { label: "Cancelada", tone: "danger" },
};

/** Pipeline visual — "parcial" se pinta entre Enviada y Recibida aunque una OC totalmente
 * recibida de una sola vez nunca pase literalmente por ese estado. */
export const PO_STEPS = ["borrador", "enviada", "recibida", "cerrada"];

export const pctReceived = (order) => {
  const ordered = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const received = order.lines.reduce((s, l) => s + l.qtyReceived, 0);
  return ordered === 0 ? 0 : Math.round((received / ordered) * 100);
};

export const orderTotal = (order) => order.lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
