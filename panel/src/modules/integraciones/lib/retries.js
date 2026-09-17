/**
 * ⭐ La cola de reintentos (§2.7).
 *
 * Tres decisiones, y las tres son de política, no de implementación:
 *
 * 1. **Sólo se reintenta lo que puede andar en el próximo intento.** `transporte`,
 *    `remoto` y `limite` sí; `auth`, `config` y `validacion` no —reintentarlos
 *    sólo gasta cuota y esconde que hace falta una persona—; y `negocio` no es
 *    siquiera una falla.
 *
 * 2. **⭐ No se reintenta lo que ya se resolvió local.** Si la llamada falló pero
 *    el puerto cayó al fallback del módulo, la operación *ya está hecha*: la
 *    comisión se calculó con la tabla propia, el CAE no se emitió porque ese
 *    puerto es sensible y falla fuerte. Encolar ahí sería reintentar algo que
 *    nadie está esperando. La cola existe para lo que **quedó sin hacer**.
 *
 * 3. **El trabajo guarda la clave de idempotencia, no la vuelve a derivar.**
 *    Derivarla de nuevo al reintentar es la forma más silenciosa de cobrar dos
 *    veces: alcanza con que entre medio haya cambiado un campo del sujeto.
 *
 * El reloj es el del navegador y **nada corre con el panel cerrado**, igual que
 * en Automatizaciones. Se dice en la pantalla en vez de fingir un worker.
 */
import { BACKOFF, nextDelayMs, isRetryable, ERROR_TYPES } from "./errors";

export const JOB_STATES = {
  esperando: { key: "esperando", label: "Esperando", tone: "warning", hint: "Tiene hora: el backoff todavía no venció." },
  reintentando: { key: "reintentando", label: "Reintentando", tone: "info", hint: "Se está ejecutando ahora." },
  resuelto: { key: "resuelto", label: "Resuelto", tone: "success", hint: "Un reintento anduvo." },
  agotado: { key: "agotado", label: "Agotado", tone: "danger", hint: "Se acabaron los intentos. Queda para intervención humana y se anunció al bus." },
  cancelado: { key: "cancelado", label: "Cancelado", tone: "neutral", hint: "Alguien lo bajó de la cola a mano." },
};

let _jobs = [];
let _seq = 0;

/**
 * ¿Corresponde encolar? Devuelve el motivo cuando no, para poder decirlo en la
 * consola — un reintento que no ocurre y no se explica es indistinguible de un
 * bug.
 */
export const retryDecision = ({ errorType, resolvedLocally, attempt }) => {
  if (errorType === "negocio") {
    return { queue: false, reason: "Es una respuesta de negocio, no una falla: no se reintenta (§2.7)." };
  }
  if (!isRetryable(errorType)) {
    return { queue: false, reason: `«${ERROR_TYPES[errorType]?.label || errorType}» no se reintenta: ${ERROR_TYPES[errorType]?.hint || "requiere intervención"}` };
  }
  if (resolvedLocally) {
    return { queue: false, reason: "La operación ya se resolvió con la implementación local del módulo: no hay nada pendiente que reintentar." };
  }
  if (attempt >= BACKOFF.maxAttempts) {
    return { queue: false, reason: `Se agotaron los ${BACKOFF.maxAttempts} intentos.` };
  }
  return { queue: true, reason: null };
};

export const enqueue = ({
  portKey, connectionId, provider, payload, meta = {}, errorType, errorMessage,
  attempt = 1, correlationId, idempotencyKey = null, subject = null, operation = null, callId = null,
}) => {
  const delay = nextDelayMs(attempt);
  const job = {
    id: `RTY-${String(++_seq).padStart(4, "0")}`,
    portKey, connectionId, provider,
    // ⭐ El payload se guarda **sin redactar**: un reintento con el payload
    // enmascarado manda `•••1234` al proveedor.
    payload,
    meta,
    subject, operation, idempotencyKey, correlationId,
    attempt,
    nextAttempt: attempt + 1,
    maxAttempts: BACKOFF.maxAttempts,
    errorType, errorMessage,
    createdAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + delay).toISOString(),
    delayMs: delay,
    state: "esperando",
    history: [{ attempt, at: new Date().toISOString(), errorType, errorMessage, callId }],
  };
  _jobs = [job, ..._jobs];
  return job;
};

export const listJobs = ({ state, portKey } = {}) =>
  _jobs
    .filter((j) => !state || j.state === state)
    .filter((j) => !portKey || j.portKey === portKey);

export const getJob = (id) => _jobs.find((j) => j.id === id) || null;

/** Los que ya vencieron. El tick los toma de a uno. */
export const dueJobs = (at = Date.now()) =>
  _jobs.filter((j) => j.state === "esperando" && new Date(j.dueAt).getTime() <= at);

export const patchJob = (id, patch) => {
  _jobs = _jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  return getJob(id);
};

/** Anota un intento fallido y reprograma, o lo da por agotado. */
export const reschedule = (id, { errorType, errorMessage, callId }) => {
  const job = getJob(id);
  if (!job) return null;

  const attempt = job.nextAttempt;
  const history = [...job.history, { attempt, at: new Date().toISOString(), errorType, errorMessage, callId }];

  if (attempt >= job.maxAttempts || !isRetryable(errorType)) {
    return patchJob(id, { state: "agotado", attempt, history, errorType, errorMessage, dueAt: null });
  }

  const delay = nextDelayMs(attempt);
  return patchJob(id, {
    state: "esperando",
    attempt,
    nextAttempt: attempt + 1,
    errorType, errorMessage,
    history,
    delayMs: delay,
    dueAt: new Date(Date.now() + delay).toISOString(),
  });
};

export const resolveJob = (id, { callId } = {}) =>
  patchJob(id, {
    state: "resuelto",
    dueAt: null,
    history: [...(getJob(id)?.history || []), { attempt: getJob(id)?.nextAttempt, at: new Date().toISOString(), ok: true, callId }],
  });

export const cancelJob = (id) => patchJob(id, { state: "cancelado", dueAt: null });

export const queueSummary = () => ({
  waiting: listJobs({ state: "esperando" }).length,
  exhausted: listJobs({ state: "agotado" }).length,
  resolved: listJobs({ state: "resuelto" }).length,
  total: _jobs.length,
  backoff: BACKOFF,
});

export const clearRetries = () => { _jobs = []; _seq = 0; };
