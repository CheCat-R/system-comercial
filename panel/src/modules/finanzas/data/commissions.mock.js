/**
 * Tarifas de comisión — configuración editable desde Finanzas › Comisiones › Tarifas (§9.4).
 * En la Fase 2 esto vivía como constante en `lib/pnl.js`; la Fase 3 lo promueve a config mutable
 * que el P&L lee en vivo.
 *
 *  - `pasarela`: fee por medio de pago. Lo descuenta la pasarela en el momento del cobro (no hay
 *    liquidación aparte). `key` matchea por substring contra `order.paymentMethod`.
 *  - `vendedor`: comisión de la fuerza de venta B2B. `key` = `ownerUserId` de la cuenta en el CRM.
 *    Se devenga con la venta y se **liquida en un pago aparte** (§6.10).
 */
export const commissionRates = [
  { id: "CR-01", kind: "pasarela", key: "mercadopago", label: "MercadoPago", percent: 0.0499 },
  { id: "CR-02", kind: "pasarela", key: "transferencia", label: "Transferencia bancaria", percent: 0 },
  { id: "CR-03", kind: "pasarela", key: "efectivo", label: "Efectivo", percent: 0 },
  { id: "CR-04", kind: "pasarela", key: "__default__", label: "Tarjeta / otro medio", percent: 0.035 },

  { id: "CR-05", kind: "vendedor", key: "u-maria", label: "María López", percent: 0.03, appliesOn: "venta" },
  { id: "CR-06", kind: "vendedor", key: "u-roberto", label: "Roberto Díaz", percent: 0.03, appliesOn: "venta" },
  { id: "CR-07", kind: "vendedor", key: "u-carlos", label: "Carlos Pérez", percent: 0.025, appliesOn: "venta" },
];
