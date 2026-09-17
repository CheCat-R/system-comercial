/**
 * Sesiones (§2.5). Funciones puras sobre un objeto sesión.
 *
 * ⭐ **Una sesión que se cae sin aviso en el medio de una carga es una pérdida
 * de trabajo, no una medida de seguridad.** Por eso hay un estado intermedio
 * (`por_vencer`) y se puede extender: la política existe para proteger, no para
 * castigar al que estuvo pensando.
 */

export const SESSION_POLICY = {
  idleMinutes: 30,
  maxHours: 8,
  warnMinutes: 2,
  /** Cuánto vale una re-autenticación antes de tener que repetirla (§2.5). */
  stepUpMinutes: 5,
};

export const SESSION_STATES = {
  activa: { key: "activa", label: "Activa", tone: "success" },
  por_vencer: { key: "por_vencer", label: "Por vencer", tone: "warning" },
  vencida: { key: "vencida", label: "Vencida", tone: "neutral" },
  cerrada: { key: "cerrada", label: "Cerrada", tone: "neutral" },
};

let _seq = 0;

export const createSession = (user, { device = "Este navegador" } = {}) => {
  const now = new Date().toISOString();
  return {
    id: `SES-${String(++_seq).padStart(3, "0")}`,
    userId: user.id,
    userName: user.name,
    startedAt: now,
    lastSeenAt: now,
    device,
    stepUpAt: null,
    closedAt: null,
  };
};

/** Marca actividad. Sin esto, la sesión vence aunque la persona esté trabajando. */
export const touch = (session) => (session ? { ...session, lastSeenAt: new Date().toISOString() } : null);

/**
 * El estado **se calcula**, no se guarda: un estado que alguien puede fijar a
 * mano deja de significar algo (misma idea que `deriveState` en Integraciones).
 */
export const sessionStatus = (session, at = Date.now()) => {
  if (!session) return { state: "cerrada", reason: "No hay sesión.", remainingMs: 0 };
  if (session.closedAt) return { state: "cerrada", reason: "La sesión se cerró.", remainingMs: 0 };

  const idleMs = at - new Date(session.lastSeenAt).getTime();
  const ageMs = at - new Date(session.startedAt).getTime();
  const idleLimit = SESSION_POLICY.idleMinutes * 60000;
  const maxLimit = SESSION_POLICY.maxHours * 3600000;

  if (idleMs >= idleLimit) {
    return { state: "vencida", reason: `Sin actividad por más de ${SESSION_POLICY.idleMinutes} minutos.`, remainingMs: 0 };
  }
  if (ageMs >= maxLimit) {
    return { state: "vencida", reason: `Superó las ${SESSION_POLICY.maxHours} horas de duración máxima.`, remainingMs: 0 };
  }

  const remainingMs = Math.min(idleLimit - idleMs, maxLimit - ageMs);
  if (remainingMs <= SESSION_POLICY.warnMinutes * 60000) {
    return { state: "por_vencer", reason: "Está por vencer por inactividad.", remainingMs };
  }
  return { state: "activa", reason: "En curso.", remainingMs };
};

export const isExpired = (session, at = Date.now()) => sessionStatus(session, at).state === "vencida";

/* ------------------------------------------------------------- step-up */

export const markStepUp = (session) => (session ? { ...session, stepUpAt: new Date().toISOString() } : null);

/**
 * ⭐ Una acción crítica pide **volver a autenticarse**, aunque la sesión esté
 * viva. Es la diferencia entre "estás adentro" y "sos vos, ahora".
 */
export const stepUpValid = (session, at = Date.now()) => {
  if (!session?.stepUpAt) return false;
  return at - new Date(session.stepUpAt).getTime() < SESSION_POLICY.stepUpMinutes * 60000;
};

export const describeRemaining = (ms) => {
  if (ms <= 0) return "vencida";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "menos de un minuto";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};
