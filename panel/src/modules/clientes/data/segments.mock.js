/**
 * Segmentos MANUALES (listas curadas a mano). Los segmentos smart se calculan
 * por RFM y viven en lib/segments.js — estos no.
 */
export const manualSegments = [
  {
    id: "SEG-estrategicas",
    name: "Cuentas estratégicas 2026",
    description: "Cuentas prioritarias para el plan comercial del año.",
    color: "accent",
    accountIds: ["CLI-005", "CLI-001"],
  },
  {
    id: "SEG-b2b-mayorista",
    name: "Mayoristas B2B",
    description: "Empresas con lista de precios mayorista y plazo de pago extendido.",
    color: "info",
    accountIds: ["CLI-005", "CLI-007"],
  },
  {
    id: "SEG-reactivar-q4",
    name: "Reactivar Q4",
    description: "Cuentas objetivo de la campaña de reactivación del último trimestre.",
    color: "warning",
    accountIds: ["CLI-004", "CLI-008"],
  },
];
