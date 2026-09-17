import { STOCK_STATUS } from "../lib/stock";

const StockLevelBadge = ({ status, size }) => {
  const s = STOCK_STATUS[status] || STOCK_STATUS.ok;
  return (
    <span className={`tier-badge tier-badge--${s.tone}${size === "sm" ? " tier-badge--sm" : ""}`}>
      {s.label}
    </span>
  );
};

export default StockLevelBadge;
