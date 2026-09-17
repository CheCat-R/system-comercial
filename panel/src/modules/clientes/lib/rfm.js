/**
 * Scoring RFM (Recencia / Frecuencia / Monto), 1–5 por dimensión.
 * Umbrales fijos y configurables (Fase 2: editables desde /clientes/segmentos).
 * Fase 3: opción de quintiles sobre la cartera.
 */

export const DEFAULT_RFM_CONFIG = {
  // recencyDays <= límite → score  (de más reciente a menos)
  recency: [15, 45, 90, 180],
  // frequencyYear >= límite → score  (de más a menos)
  frequency: [12, 6, 3, 1],
  // ltv >= límite → score  (de más a menos)
  monetary: [2_000_000, 800_000, 300_000, 80_000],
};

/** recency: valores ASC → score 5..1 según el primer límite que NO se supera */
const scoreRecency = (value, limits) => {
  for (let i = 0; i < limits.length; i++) if (value <= limits[i]) return 5 - i;
  return 1;
};
/** frequency / monetary: valores DESC → score 5..1 según el primer límite alcanzado */
const scoreDesc = (value, limits) => {
  for (let i = 0; i < limits.length; i++) if (value >= limits[i]) return 5 - i;
  return 1;
};

/**
 * @param {{recencyDays:number|null, frequencyYear:number, ltv:number, ordersCount:number}} m
 * @param {typeof DEFAULT_RFM_CONFIG} config
 * @returns {{r:number, f:number, m:number}}
 */
export const scoreRFM = (m, config = DEFAULT_RFM_CONFIG) => {
  if (!m.ordersCount) return { r: 0, f: 0, m: 0 };
  return {
    r: scoreRecency(m.recencyDays, config.recency),
    f: scoreDesc(m.frequencyYear, config.frequency),
    m: scoreDesc(m.ltv, config.monetary),
  };
};

export const RFM_LABELS = {
  r: { name: "Recencia", hint: "Qué tan reciente fue la última compra", unit: "días desde la última compra" },
  f: { name: "Frecuencia", hint: "Pedidos en los últimos 12 meses", unit: "pedidos / 12 meses" },
  m: { name: "Monto", hint: "Valor total gastado (LTV)", unit: "LTV en $" },
};
