/**
 * Deriva CustomerMetrics de una cuenta a partir de sus pedidos.
 * Es una función pura: mismos inputs → mismo output. Se recalcula al render.
 * Ver docs/MODULO-CRM.md §4 y §8.
 */
import { TODAY, daysBetween } from "./time";
import { scoreRFM, DEFAULT_RFM_CONFIG } from "./rfm";
import { resolveSegment, tierFromSegment } from "./segments";

const EMPTY = {
  ltv: 0, aov: 0, ordersCount: 0, refundsCount: 0, refundedAmount: 0,
  firstOrderAt: null, lastOrderAt: null, recencyDays: null, ageDays: null,
  frequencyYear: 0, r: 0, f: 0, m: 0,
};

/**
 * @param {object} account
 * @param {Array} accountOrders  pedidos de esa cuenta
 * @param {object} [rfmConfig]   umbrales RFM (Fase 2, editables)
 * @returns {object} CustomerMetrics + { segmentKey, segmentReason, tier }
 */
export const deriveMetrics = (account, accountOrders = [], rfmConfig = DEFAULT_RFM_CONFIG) => {
  const paid = accountOrders.filter((o) => o.paymentStatus === "paid");
  const refunded = accountOrders.filter((o) => o.paymentStatus === "refunded");

  let base = { ...EMPTY };

  if (paid.length) {
    const dates = paid.map((o) => o.date).sort();
    const grossLtv = paid.reduce((s, o) => s + o.total, 0);
    const refundedAmount = refunded.reduce((s, o) => s + o.total, 0);
    const ltv = grossLtv - refundedAmount;
    const lastOrderAt = dates[dates.length - 1];
    const firstOrderAt = dates[0];
    const last365 = paid.filter((o) => daysBetween(TODAY, o.date) <= 365).length;

    base = {
      ltv,
      aov: Math.round(ltv / paid.length),
      ordersCount: paid.length,
      refundsCount: refunded.length,
      refundedAmount,
      firstOrderAt,
      lastOrderAt,
      recencyDays: daysBetween(TODAY, lastOrderAt),
      ageDays: daysBetween(TODAY, firstOrderAt),
      frequencyYear: last365,
    };
  } else {
    base = { ...EMPTY, refundsCount: refunded.length };
  }

  const { r, f, m } = scoreRFM(base, rfmConfig);
  base.r = r;
  base.f = f;
  base.m = m;

  const segment = resolveSegment({ ...base, r, f, m });
  base.segmentKey = segment.key;
  base.segmentReason = segment.reason;
  base.tier = tierFromSegment(segment.key, account?.tierOverride);
  base.tierIsOverride = Boolean(account?.tierOverride);

  return base;
};
