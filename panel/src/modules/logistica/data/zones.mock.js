/** `keywords` se usa para resolver la Zona a partir de la dirección de un pedido (texto libre,
 * sin validación geográfica real en esta etapa) — ver docs/MODULO-LOGISTICA-FULFILLMENT.md §3.5.
 * La última zona de la lista actúa como catch-all si ninguna palabra clave matchea. */
export const zones = [
  { id: "ZON-01", name: "CABA", keywords: ["CABA", "Ciudad Autónoma de Buenos Aires"] },
  { id: "ZON-02", name: "GBA", keywords: ["GBA", "Conurbano", "Martínez", "Bs. As."] },
  { id: "ZON-03", name: "Interior", keywords: ["Córdoba", "Santa Fe", "Rosario", "Mendoza", "Interior"] },
];
