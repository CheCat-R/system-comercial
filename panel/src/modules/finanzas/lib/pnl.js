/**
 * Cálculos puros del P&L de gestión — ver docs/MODULO-FINANZAS-FACTURACION.md §2.3.
 * Nada de estado: recibe un objeto de importes, devuelve números.
 *
 * Las **tasas** de comisión (pasarela y vendedor) viven en `data/commissions.mock.js` y las maneja
 * `financeApi` como config editable (Fase 3).
 */

export const emptyPnl = () => ({
  revenueNet: 0,
  cogs: 0,
  shippingCost: 0,
  shippingCharged: 0,
  gatewayFee: 0,
  sellerCommission: 0,
  adjustments: 0,
});

export const contributionMargin = (p) =>
  p.revenueNet - p.cogs - p.shippingCost - p.gatewayFee - p.sellerCommission + p.adjustments;

export const grossMargin = (p) => p.revenueNet - p.cogs;

export const marginPct = (p) => {
  const cm = contributionMargin(p);
  return p.revenueNet ? cm / p.revenueNet : null;
};

export const addPnl = (a, b) => ({
  revenueNet: a.revenueNet + b.revenueNet,
  cogs: a.cogs + b.cogs,
  shippingCost: a.shippingCost + b.shippingCost,
  shippingCharged: a.shippingCharged + b.shippingCharged,
  gatewayFee: a.gatewayFee + b.gatewayFee,
  sellerCommission: a.sellerCommission + b.sellerCommission,
  adjustments: a.adjustments + b.adjustments,
});
