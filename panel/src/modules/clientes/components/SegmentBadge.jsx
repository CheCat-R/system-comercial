import { segmentOf, tierOf } from "../lib/segments";

/**
 * Badge de segmento smart o de tier. Reutiliza las clases `.tier-badge--<tono>`
 * globales del design system.
 */
export const SegmentBadge = ({ segmentKey, size }) => {
  const s = segmentOf(segmentKey);
  return (
    <span className={`tier-badge tier-badge--${s.tone} ${size === "sm" ? "tier-badge--sm" : ""}`}>
      {s.label}
    </span>
  );
};

export const TierBadge = ({ tier, size }) => {
  const t = tierOf(tier);
  return (
    <span className={`tier-badge tier-badge--${t.tone} ${size === "sm" ? "tier-badge--sm" : ""}`}>
      {t.label}
    </span>
  );
};

export default SegmentBadge;
