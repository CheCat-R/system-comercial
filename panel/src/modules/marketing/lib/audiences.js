/**
 * Filtros de comportamiento de marketing para las Audiencias (§2 / §8.5). Marketing **no** redefine
 * RFM ni los segmentos — la `base` sale del CRM y los `filters` la refinan.
 */
export const AUDIENCE_FILTERS = {
  opened_any_campaign: { label: "Abrió alguna campaña", valueType: "none" },
  never_opened: { label: "Nunca abrió una campaña", valueType: "none" },
  has_unused_coupon: { label: "Tiene un cupón sin usar", valueType: "none" },
  days_since_last_order_gt: { label: "Días sin comprar (más de)", valueType: "number" },
  min_ltv: { label: "LTV mínimo ($)", valueType: "number" },
  subscribed_email: { label: "Suscripto a email", valueType: "none" },
};

export const BASE_TYPES = {
  all: "Toda la cartera",
  segment: "Segmento smart",
  manualSegment: "Segmento manual",
  tag: "Etiqueta",
};

export const describeBase = (base) => {
  if (!base || base.type === "all") return "Toda la cartera";
  const prefix = { segment: "Segmento", manualSegment: "Segmento", tag: "Etiqueta" }[base.type] || "";
  return `${prefix}: ${base.label || base.value}`;
};

export const describeFilters = (filters = []) => {
  if (!filters.length) return "Sin filtros";
  return filters
    .map((f) => {
      const def = AUDIENCE_FILTERS[f.field];
      if (!def) return f.field;
      return def.valueType === "number" ? `${def.label} ${f.value}` : def.label;
    })
    .join(" · ");
};
