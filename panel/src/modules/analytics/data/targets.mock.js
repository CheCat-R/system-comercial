/**
 * Objetivos por métrica — habilitan la comparación "contra objetivo" (§4) y el
 * panel "Qué mirar" del Resumen.
 *
 * Los valores están expresados **en la unidad de la métrica**: los porcentajes
 * como proporción (0.42 = 42 %), el dinero en pesos.
 */
export const targets = {
  revenue_net: 3_200_000,      // por mes
  orders_paid: 32,
  aov: 95_000,
  gross_margin_pct: 0.45,
  contribution_margin_pct: 0.32,
  customers_new: 14,
  return_rate: 0.06,           // techo: más que esto preocupa
  repeat_rate: 0.30,
  cac: 18_000,                 // techo
  ltv_cac_ratio: 3,
  roas: 4,
  delivery_rate: 0.95,
  incident_rate: 0.08,         // techo
  dispatch_lead_time: 24,      // techo, en horas
};
