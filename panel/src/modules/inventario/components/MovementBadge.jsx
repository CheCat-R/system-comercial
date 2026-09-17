import { MOVEMENT_TYPES } from "../lib/movements";

const MovementBadge = ({ type }) => {
  const t = MOVEMENT_TYPES[type] || { label: type, tone: "neutral" };
  return <span className={`tag-chip tag-chip--${t.tone}`}>{t.label}</span>;
};

export default MovementBadge;
