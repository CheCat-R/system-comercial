/**
 * Catálogo de segmentos smart + resolución por RFM y derivación de tier.
 * Ver docs/MODULO-CRM.md §5.
 */

export const SEGMENTS = {
  lead:       { key: "lead",       label: "Lead",             tone: "neutral", action: "Nurturing, primera compra" },
  nuevo:      { key: "nuevo",      label: "Nuevo",            tone: "info",    action: "Onboarding, segunda compra" },
  prometedor: { key: "prometedor", label: "Prometedor",       tone: "info",    action: "Incentivo de recompra" },
  activo:     { key: "activo",     label: "Activo",           tone: "success", action: "Mantener el vínculo" },
  leal:       { key: "leal",       label: "Leal / Frecuente", tone: "success", action: "Programa de fidelidad" },
  campeon:    { key: "campeon",    label: "Campeón / VIP",    tone: "warning", action: "Trato preferencial, early access" },
  en_riesgo:  { key: "en_riesgo",  label: "En riesgo",        tone: "warning", action: "Campaña de recuperación" },
  durmiente:  { key: "durmiente",  label: "Durmiente",        tone: "danger",  action: "Reactivación agresiva" },
  perdido:    { key: "perdido",    label: "Perdido",          tone: "danger",  action: "Win-back o archivar" },
};

export const segmentOf = (key) => SEGMENTS[key] || SEGMENTS.activo;

const TIER_BY_SEGMENT = {
  campeon: "vip",
  leal: "frecuente",
  en_riesgo: "en_riesgo",
  durmiente: "durmiente",
  perdido: "durmiente",
  lead: "lead",
  nuevo: "activo",
  prometedor: "activo",
  activo: "activo",
};

export const TIERS = {
  vip:       { key: "vip",       label: "VIP",        tone: "warning" },
  frecuente: { key: "frecuente", label: "Frecuente",  tone: "success" },
  activo:    { key: "activo",    label: "Activo",     tone: "info" },
  en_riesgo: { key: "en_riesgo", label: "En riesgo",  tone: "warning" },
  durmiente: { key: "durmiente", label: "Durmiente",  tone: "danger" },
  lead:      { key: "lead",      label: "Lead",       tone: "neutral" },
};

export const tierOf = (key) => TIERS[key] || TIERS.activo;

/**
 * Devuelve la clave de segmento smart y la regla que matcheó (para el "por qué").
 * @param {{ordersCount:number, recencyDays:number|null, r:number, f:number, m:number}} metrics
 */
export const resolveSegment = ({ ordersCount, recencyDays, r, f, m }) => {
  if (!ordersCount) return { key: "lead", reason: "No registra pedidos pagados." };
  if (recencyDays > 240) return { key: "perdido", reason: `Sin comprar hace ${recencyDays} días (+240).` };
  if (recencyDays > 120) return { key: "durmiente", reason: `Sin comprar hace ${recencyDays} días (120–240).` };
  if (recencyDays > 60 && f >= 3 && m >= 3)
    return { key: "en_riesgo", reason: `Buen histórico (F${f}·M${m}) pero sin comprar hace ${recencyDays} días.` };
  if (r >= 4 && f >= 4 && m >= 4)
    return { key: "campeon", reason: `RFM alto en las tres dimensiones (R${r}·F${f}·M${m}).` };
  if (f >= 4 && recencyDays <= 60)
    return { key: "leal", reason: `Compra seguido (F${f}) y reciente (${recencyDays} días).` };
  if (ordersCount >= 2 && recencyDays <= 45)
    return { key: "prometedor", reason: `${ordersCount} pedidos y compra reciente (${recencyDays} días).` };
  if (ordersCount === 1 && recencyDays <= 30)
    return { key: "nuevo", reason: `Primera compra hace ${recencyDays} días.` };
  return { key: "activo", reason: "Compra de forma ocasional, sin patrón marcado." };
};

export const tierFromSegment = (segmentKey, tierOverride) =>
  tierOverride || TIER_BY_SEGMENT[segmentKey] || "activo";
