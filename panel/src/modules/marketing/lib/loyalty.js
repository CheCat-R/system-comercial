/** Fidelización — puntos + recompensas (Fase 3). Ver docs/MODULO-MARKETING.md §2 / §8.7. */

export const LEDGER_TYPE = {
  earn: { label: "Acumulación", tone: "success", sign: 1 },
  redeem: { label: "Canje", tone: "info", sign: -1 },
  expire: { label: "Vencimiento", tone: "danger", sign: -1 },
  reverse: { label: "Reversa (devolución)", tone: "warning", sign: -1 },
  adjust: { label: "Ajuste manual", tone: "neutral", sign: 1 },
};

export const TIER_LABELS = {
  vip: "VIP", frecuente: "Frecuente", activo: "Activo",
  en_riesgo: "En riesgo", durmiente: "Durmiente", lead: "Lead",
};

export const CART_STATUS = {
  abierto: { label: "Abierto", tone: "warning" },
  recuperado: { label: "Recuperado", tone: "success" },
  perdido: { label: "Perdido", tone: "danger" },
};

export const REWARD_STATUS = {
  activa: { label: "Activa", tone: "success" },
  inactiva: { label: "Inactiva", tone: "neutral" },
};

/** Puntos que acumula un pedido: total × earnRate × multiplicador de tier. */
export const earnedPoints = (total, program, tier) => {
  const mult = program.tierMultipliers?.[tier] || 1;
  return Math.round((total || 0) * (program.earnRate || 0) * mult);
};

/** Valor en $ de una cantidad de puntos al canjear. */
export const pointsToMoney = (points, program) => Math.round((points || 0) * (program.pointValue || 0));
