/**
 * Estados de una conexión y su salud (§2.6).
 *
 * La distinción que importa: **degradada y caída son estados operativos, no
 * errores de una llamada**. Una llamada puede fallar sin que la integración esté
 * caída; una integración caída no debería dejar al panel sin operar — para eso
 * está el fallback.
 */

export const CONNECTION_STATES = {
  no_configurada: {
    key: "no_configurada", label: "Sin configurar", tone: "neutral",
    hint: "El puerto existe y no hay proveedor elegido. Corre la implementación local del módulo.",
    running: "local",
  },
  configurada: {
    key: "configurada", label: "Configurada", tone: "info",
    hint: "Hay proveedor y configuración, falta probar la conexión.",
    running: "local",
  },
  conectada: {
    key: "conectada", label: "Conectada", tone: "success",
    hint: "El último chequeo dio bien. El proveedor atiende el puerto.",
    running: "provider",
  },
  degradada: {
    key: "degradada", label: "Degradada", tone: "warning",
    hint: "Responde, pero con errores o latencia por encima del umbral.",
    running: "provider",
  },
  caida: {
    key: "caida", label: "Caída", tone: "danger",
    hint: "El chequeo falla o hubo demasiadas fallas seguidas.",
    running: "local",
  },
  deshabilitada: {
    key: "deshabilitada", label: "Deshabilitada", tone: "neutral",
    hint: "Apagada a mano. Vuelve a la implementación local: no rompe nada.",
    running: "local",
  },
};

export const getState = (key) => CONNECTION_STATES[key] || CONNECTION_STATES.no_configurada;

/** ¿Quién atiende el puerto en este estado? `local` = el fallback del módulo. */
export const runningIn = (state) => getState(state).running;

/** Umbrales por defecto para pasar a degradada. */
export const THRESHOLDS = { errorRate: 0.2, latencyMs: 3000, consecutiveFailures: 3 };

/**
 * Deriva el estado a partir de la salud observada. Se calcula, no se escribe a
 * mano: un estado que alguien puede fijar arbitrariamente deja de significar
 * algo.
 */
export const deriveState = (connection, healthArg) => {
  // `healthArg` llega `null` explícito cuando hay proveedor configurado y
  // todavía nadie probó la conexión, y **un valor por defecto de parámetro sólo
  // cubre `undefined`**. Sin esto, configurar sin probar y recargar rompía la
  // pantalla. (Es el mismo tropiezo que `resolvePeriod(v, null)` en Analytics.)
  const health = healthArg || {};

  if (!connection?.provider) return "no_configurada";

  // ⭐ "Nunca se habilitó" y "se apagó a mano" no son lo mismo.
  // Mirando sólo `enabled === false`, una conexión recién configurada aparecía
  // como *deshabilitada* y los estados *degradada* y *caída* no se veían nunca
  // — que es justo para lo que existen. Sólo `disableConnection` marca
  // `disabledAt`.
  if (connection.disabledAt) return "deshabilitada";

  if (health.ok == null) return "configurada";
  if (health.ok === false) return "caida";
  if (health.consecutiveFailures >= THRESHOLDS.consecutiveFailures) return "caida";
  if (health.errorRate > THRESHOLDS.errorRate || health.latencyMs > THRESHOLDS.latencyMs) return "degradada";
  return "conectada";
};

/**
 * Chequeo de salud del **modo simulado**: siempre sano, porque no hay red de por
 * medio. Devolverlo explícito y no `null` deja claro que el puerto está
 * funcionando, sólo que localmente.
 */
export const localHealth = () => ({
  ok: true,
  latencyMs: 0,
  consecutiveFailures: 0,
  errorRate: 0,
  message: "Corriendo con la implementación local del módulo.",
  lastCheckAt: new Date().toISOString(),
});
