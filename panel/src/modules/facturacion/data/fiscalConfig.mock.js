/**
 * Configuración impositiva — la pantalla Facturación › Impuestos la muestra y edita.
 * Todo simulado (no hay AFIP real). Ver docs/MODULO-FINANZAS-FACTURACION.md §3 / §9.9.
 */

/** Datos del emisor (CheCAT). Responsable Inscripto. */
export const issuer = {
  legalName: "CheCAT S.A.",
  taxId: "30-71888999-7",
  taxCondition: "Responsable Inscripto",
  grossIncome: "901-888999-7",
  activityStart: "2019-03-01",
  address: "Av. Córdoba 1234, Piso 6, C1055 CABA, Argentina",
};

/** Puntos de venta habilitados. La numeración de comprobantes es independiente por punto de venta. */
export const pointsOfSale = [
  { id: "0001", name: "Tienda web", isDefault: true, active: true },
  { id: "0002", name: "Ventas mayoristas", isDefault: false, active: true },
];

/** Alícuota de IVA por categoría de catálogo. El SKU puede sobreescribirla con su propio `taxRate`. */
export const vatByCategory = [
  { category: "Calzado", rate: 0.21 },
  { category: "Indumentaria", rate: 0.21 },
  { category: "Accesorios", rate: 0.21 },
];

/**
 * Percepciones por jurisdicción (IIBB). **Configuradas pero no se aplican automáticamente en la
 * Fase 1** — se dejan listas para cuando Finanzas cierre el circuito (mantiene el total del
 * comprobante igual al total cobrado en el pedido). Ver §3.3.
 */
export const perceptionRules = [
  { jurisdiction: "Buenos Aires", tax: "IIBB", rate: 0.035, active: false },
  { jurisdiction: "CABA", tax: "IIBB", rate: 0.02, active: false },
  { jurisdiction: "Córdoba", tax: "IIBB", rate: 0.03, active: false },
  { jurisdiction: "Santa Fe", tax: "IIBB", rate: 0.032, active: false },
];
