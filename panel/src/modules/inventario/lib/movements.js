/** Tipos de movimiento del kardex — ver docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §2.3. */
export const MOVEMENT_TYPES = {
  ingreso: { label: "Ingreso", tone: "success" },
  egreso: { label: "Egreso", tone: "danger" },
  ajuste_pos: { label: "Ajuste (+)", tone: "success" },
  ajuste_neg: { label: "Ajuste (−)", tone: "danger" },
  reserva: { label: "Reserva", tone: "info" },
  liberacion: { label: "Liberación de reserva", tone: "neutral" },
  transfer_out: { label: "Transferencia · salida", tone: "warning" },
  transfer_in: { label: "Transferencia · entrada", tone: "warning" },
  venta: { label: "Venta", tone: "accent" },
  devolucion: { label: "Devolución", tone: "success" },
};

export const ADJUSTMENT_REASONS = {
  rotura: "Rotura",
  vencimiento: "Vencimiento",
  merma: "Merma / faltante",
  correccion_conteo: "Corrección de conteo",
  otro: "Otro",
};

const REF_LABELS = {
  order: "Pedido",
  receipt: "Recepción",
  adjustment: "Ajuste",
  transfer: "Transferencia",
};

export const refLabel = (refType) => REF_LABELS[refType] || refType;
