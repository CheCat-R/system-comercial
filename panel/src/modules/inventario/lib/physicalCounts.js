/** Estados del wizard de Inventario físico — ver docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §3.5. */
export const COUNT_STATUS = {
  planificado: { label: "Planificado", tone: "neutral" },
  en_conteo: { label: "En conteo", tone: "info" },
  revision: { label: "Revisión", tone: "warning" },
  cerrado: { label: "Cerrado", tone: "success" },
};

export const COUNT_STEPS = ["planificado", "en_conteo", "revision", "cerrado"];

export const SCOPE_LABELS = {
  total: "Todo el depósito",
  categoria: "Por categoría",
  muestra: "Muestra (cíclico)",
};
