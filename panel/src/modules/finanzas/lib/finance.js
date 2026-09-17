/** Mapas de presentación para Gastos, Comisiones y Reembolsos (Fase 3). */

export const EXPENSE_CATEGORIES = {
  alquiler: "Alquiler",
  sueldos: "Sueldos",
  servicios: "Servicios",
  marketing: "Marketing",
  software: "Software",
  honorarios: "Honorarios",
  impuestos: "Impuestos",
  otros: "Otros",
};

export const RECURRENCE = {
  unico: { label: "Único", tone: "neutral" },
  mensual: { label: "Mensual", tone: "info" },
  anual: { label: "Anual", tone: "info" },
};

export const EXPENSE_STATUS = {
  pendiente: { label: "Pendiente", tone: "warning" },
  pagado: { label: "Pagado", tone: "success" },
};

export const COMMISSION_KIND = {
  pasarela: { label: "Pasarela", tone: "neutral" },
  vendedor: { label: "Vendedor", tone: "info" },
};

export const COMMISSION_STATUS = {
  descontada: { label: "Descontada por la pasarela", tone: "neutral" },
  devengada: { label: "Devengada", tone: "warning" },
  liquidada: { label: "Liquidada", tone: "success" },
};

export const REFUND_STATUS = {
  solicitado: { label: "Pendiente de aprobación", tone: "warning" },
  ejecutado: { label: "Reembolsado", tone: "success" },
  rechazado: { label: "Rechazado", tone: "danger" },
};

export const REFUND_METHODS = {
  original: "Al medio de pago original",
  transferencia: "Transferencia bancaria",
  credito_a_favor: "Nota de crédito a favor",
};

export const costCenterLabel = (cc, warehouseName) =>
  cc === "global" ? "Toda la empresa" : warehouseName || cc;
