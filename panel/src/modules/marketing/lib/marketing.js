/** Mapas de presentación de Campañas / Comunicación (Fase 2). Ver docs/MODULO-MARKETING.md §2 / §8. */

export const OBJECTIVES = {
  awareness: "Awareness",
  conversion: "Conversión",
  retention: "Retención",
  winback: "Recuperación",
  loyalty: "Fidelización",
};

export const CAMPAIGN_STATUS = {
  borrador: { label: "Borrador", tone: "neutral" },
  programada: { label: "Programada", tone: "info" },
  en_curso: { label: "En curso", tone: "success" },
  pausada: { label: "Pausada", tone: "warning" },
  finalizada: { label: "Finalizada", tone: "neutral" },
};

/** `cost` = costo simulado por mensaje entregado (para el ROI). */
export const CHANNELS = {
  email: { label: "Email", cost: 4 },
  push: { label: "Push", cost: 1 },
  sms: { label: "SMS", cost: 38 },
  whatsapp: { label: "WhatsApp", cost: 14 },
};

export const SEND_STATUS = {
  encolado: { label: "Encolado", tone: "neutral" },
  enviado: { label: "Enviado", tone: "info" },
  entregado: { label: "Entregado", tone: "info" },
  abierto: { label: "Abierto", tone: "success" },
  click: { label: "Click", tone: "success" },
  rebotado: { label: "Rebotado", tone: "danger" },
  baja: { label: "Baja", tone: "warning" },
};

/** Un envío "llegó" si está en entregado o más adelante en el embudo. */
export const DELIVERED_PLUS = ["entregado", "abierto", "click"];
export const OPENED_PLUS = ["abierto", "click"];

export const TEMPLATE_CATEGORY = {
  promocional: "Promocional",
  newsletter: "Newsletter",
  transaccional: "Transaccional",
};

export const SUBSCRIPTION_STATUS = {
  suscripto: { label: "Suscripto", tone: "success" },
  baja: { label: "Dado de baja", tone: "danger" },
  no_confirmado: { label: "Sin confirmar", tone: "warning" },
};

export const TRIGGERS = {
  abandoned_cart: "Carrito abandonado",
  segment_entered: "Cambio de segmento",
  birthday: "Cumpleaños",
  post_purchase: "Post-compra",
  first_purchase_nudge: "Recordatorio de 1ª compra",
};

/** Distribución determinística del embudo de un envío, a partir de una semilla estable
 * (`campaignId + accountId`). Sin `Math.random` para que las métricas no cambien entre renders. */
export const hashPct = (seed) => {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000; // 0..0.999
};
