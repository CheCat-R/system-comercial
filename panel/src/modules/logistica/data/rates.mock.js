/** Una fila = costo para una combinación Transportista×Método×Zona×rango de peso.
 * "Flota propia" a propósito sólo tiene tarifa para CABA — demuestra el caso "sin tarifa
 * configurada" del §3.5 cuando se arma un envío a otra zona con ese método. */
let seq = 0;
const rate = (carrierId, methodId, zoneId, weightFrom, weightTo, cost) => ({
  id: `RATE-${String(++seq).padStart(3, "0")}`, carrierId, methodId, zoneId, weightFrom, weightTo, cost,
});

export const rates = [
  // MET-01 Andreani Standard
  rate("CAR-01", "MET-01", "ZON-01", 0, 3, 2500),
  rate("CAR-01", "MET-01", "ZON-01", 3, 999, 4000),
  rate("CAR-01", "MET-01", "ZON-02", 0, 3, 3000),
  rate("CAR-01", "MET-01", "ZON-02", 3, 999, 4800),
  rate("CAR-01", "MET-01", "ZON-03", 0, 3, 4500),
  rate("CAR-01", "MET-01", "ZON-03", 3, 999, 7000),

  // MET-02 Andreani Express
  rate("CAR-01", "MET-02", "ZON-01", 0, 3, 4000),
  rate("CAR-01", "MET-02", "ZON-01", 3, 999, 6000),
  rate("CAR-01", "MET-02", "ZON-02", 0, 3, 4800),
  rate("CAR-01", "MET-02", "ZON-02", 3, 999, 7200),
  rate("CAR-01", "MET-02", "ZON-03", 0, 3, 7000),
  rate("CAR-01", "MET-02", "ZON-03", 3, 999, 10000),

  // MET-03 Correo Argentino Standard
  rate("CAR-02", "MET-03", "ZON-01", 0, 3, 2000),
  rate("CAR-02", "MET-03", "ZON-01", 3, 999, 3200),
  rate("CAR-02", "MET-03", "ZON-02", 0, 3, 2500),
  rate("CAR-02", "MET-03", "ZON-02", 3, 999, 4000),
  rate("CAR-02", "MET-03", "ZON-03", 0, 3, 3800),
  rate("CAR-02", "MET-03", "ZON-03", 3, 999, 6000),

  // MET-04 Flota propia — sólo CABA
  rate("CAR-03", "MET-04", "ZON-01", 0, 3, 1500),
  rate("CAR-03", "MET-04", "ZON-01", 3, 999, 2500),
];
