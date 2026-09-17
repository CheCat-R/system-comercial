/** `trackingPrefix` alimenta el código de seguimiento simulado (§"tracking más rico" — Fase 3):
 * se arma como `{trackingPrefix}-{8 dígitos}` al despachar, nunca contra una API real. */
export const carriers = [
  { id: "CAR-01", name: "Andreani", contactPhone: "0810-122-1111", isActive: true, trackingPrefix: "AND" },
  { id: "CAR-02", name: "Correo Argentino", contactPhone: "0800-777-8767", isActive: true, trackingPrefix: "COA" },
  { id: "CAR-03", name: "Flota propia", contactPhone: "Interno", isActive: true, trackingPrefix: "FLP" },
];
