/**
 * Reglas fiscales puras (sin estado) — ver docs/MODULO-FINANZAS-FACTURACION.md §3.
 * Modelo AFIP/ARCA **simulado**: no hay integración real, el CAE se genera localmente.
 */

export const DOC_TYPES = {
  factura: { label: "Factura", short: "FC" },
  nota_credito: { label: "Nota de Crédito", short: "NC" },
  nota_debito: { label: "Nota de Débito", short: "ND" },
};

export const DOC_STATUS = {
  borrador: { label: "Borrador", tone: "warning" },
  emitido: { label: "Emitido", tone: "success" },
  anulado: { label: "Anulado", tone: "danger" },
};

/** Condición del cliente frente al IVA → tono para el badge (`ConditionBadge` = StatusBadge + este mapa). */
export const TAX_CONDITIONS = {
  "Responsable Inscripto": { label: "Resp. Inscripto", short: "RI", tone: "info" },
  "Monotributo": { label: "Monotributo", short: "MT", tone: "neutral" },
  "Consumidor Final": { label: "Consumidor Final", short: "CF", tone: "neutral" },
  "Exento": { label: "Exento", short: "EX", tone: "neutral" },
};

/** Emisor asumido Responsable Inscripto (CheCAT). */
export const ISSUER_CONDITION = "Responsable Inscripto";

/**
 * Letra del comprobante (§3.2). Emisor RI:
 *  - cliente RI            → A (IVA discriminado)
 *  - resto / sin condición → B (IVA no discriminado)
 */
export const resolveLetter = (customerCondition) =>
  customerCondition === "Responsable Inscripto" ? "A" : "B";

export const formatFullNumber = (pointOfSale, number) =>
  `${String(pointOfSale).padStart(4, "0")}-${String(number).padStart(8, "0")}`;

export const docLabel = (doc) =>
  `${DOC_TYPES[doc.docType]?.short || doc.docType} ${doc.letter} ${doc.fullNumber}`;

/**
 * CAE simulado: 14 dígitos determinísticos a partir de una semilla (número + fecha), para que no
 * cambie entre renders ni entre recargas.
 */
export const simulateCae = (seed) => {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) % 100000000000;
  return `7${String(n).padStart(11, "0")}${String((h >>> 8) % 100).padStart(2, "0")}`.slice(0, 14);
};

/** Si la NC/ND cubre todo el comprobante origen o sólo una parte. */
export const DOC_SCOPE = {
  total: { label: "Total" },
  parcial: { label: "Parcial" },
};
