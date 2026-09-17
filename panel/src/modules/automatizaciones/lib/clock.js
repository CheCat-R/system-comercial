/**
 * ⭐ El reloj virtual y la cola de trabajos.
 *
 * **El panel no ejecuta nada mientras está cerrado.** No hay backend ni service
 * worker, y el estado en memoria se resetea con un reload completo, igual que en
 * todos los módulos. Decirlo de frente es parte del diseño
 * (docs/MODULO-AUTOMATIZACIONES.md §2.5).
 *
 * Sobre esa base, **los cuatro modos de ejecución se reducen a una sola
 * primitiva** (§2.4): una cola de `ScheduledJob` con `dueAt`, y un `tick(now)`
 * que drena lo vencido.
 *
 *   inmediata   → job con dueAt = ahora
 *   con retraso → job con dueAt = evento + N
 *   programada  → job con dueAt = próxima ocurrencia
 *   recurrente  → igual, y al ejecutarse reencola la siguiente
 *
 * Un solo camino de código para los cuatro significa un solo lugar donde puede
 * fallar, y que el historial se ve igual para todos.
 *
 * Es el mismo patrón de materialización perezosa que el panel ya usa en
 * `ensureShipment`, `ensureDocsForOrder` y `ensureScheduledPublish`.
 */

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Misma fecha de referencia que todos los módulos. */
export const TODAY = startOfDay(new Date(2026, 8, 3)); // 2026-09-03

/**
 * El "ahora" del motor. Arranca a media mañana de TODAY —no a las 00:00— para
 * que las condiciones que miran horas del día tengan algo razonable que evaluar.
 */
const ORIGIN = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 10, 0, 0);

let _now = new Date(ORIGIN);

export const now = () => new Date(_now);
export const nowIso = () => _now.toISOString();

/** Avanza el reloj. En F3 la UI expone +1 h / +1 día / hasta el próximo job. */
export const advance = (ms) => {
  _now = new Date(_now.getTime() + ms);
  return now();
};

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const resetClock = () => { _now = new Date(ORIGIN); };

/* ------------------------------------------------------ cola de trabajos */

let _jobs = [];
let _seq = 0;

/**
 * Encola un trabajo.
 * @param {object} job `{ ruleId, subject, event, dueAt, kind }`
 */
export const schedule = ({ ruleId, subject, event, delayMs = 0, kind = "immediate" }) => {
  const job = {
    id: `JOB-${++_seq}`,
    ruleId,
    subject,
    event,
    kind,
    createdAt: nowIso(),
    dueAt: new Date(_now.getTime() + Math.max(0, delayMs)).toISOString(),
  };
  _jobs = [..._jobs, job];
  return job;
};

/** Trabajos vencidos al momento `at`, en orden cronológico. */
export const dueJobs = (at = _now) =>
  _jobs
    .filter((j) => new Date(j.dueAt).getTime() <= at.getTime())
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

export const removeJob = (id) => { _jobs = _jobs.filter((j) => j.id !== id); };

export const pendingJobs = () =>
  [..._jobs].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

/** El próximo vencimiento, para el botón "avanzar hasta el próximo trabajo". */
export const nextDueAt = () => {
  const upcoming = _jobs
    .map((j) => new Date(j.dueAt))
    .filter((d) => d.getTime() > _now.getTime())
    .sort((a, b) => a - b);
  return upcoming[0] || null;
};

export const clearJobs = () => { _jobs = []; };

/** Quita los trabajos pendientes de una regla (al pausarla o borrarla). */
export const dropJobsOfRule = (ruleId) => {
  const before = _jobs.length;
  _jobs = _jobs.filter((j) => j.ruleId !== ruleId);
  return before - _jobs.length;
};

/* ------------------------------------------------------------- formato */

const pad = (n) => String(n).padStart(2, "0");

export const formatStamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "hace 3 h" / "en 2 d", relativo al reloj virtual. */
export const relativeTo = (iso, at = _now) => {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - at.getTime();
  const abs = Math.abs(diff);
  // Con el reloj detenido, lo que acaba de pasar da diferencia 0 y redondear
  // hacia arriba lo mostraba como "en 1 min" — algo del pasado anunciado como
  // futuro.
  if (abs < MINUTE) return "recién";
  const unit =
    abs < HOUR ? `${Math.round(abs / MINUTE)} min`
      : abs < DAY ? `${Math.round(abs / HOUR)} h`
        : `${Math.round(abs / DAY)} d`;
  return diff < 0 ? `hace ${unit}` : `en ${unit}`;
};

/** Milisegundos de un retraso declarado como `{ value, unit }`. */
export const delayToMs = ({ value = 0, unit = "hours" } = {}) => {
  const factor = { minutes: MINUTE, hours: HOUR, days: DAY }[unit] || HOUR;
  return Math.max(0, Number(value) || 0) * factor;
};

export const DELAY_UNITS = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "días" },
];

/* ------------------------------------------------- modos de ejecución */

export const EXECUTION_MODES = [
  { value: "immediate", label: "Inmediata", hint: "Se ejecuta en cuanto ocurre el disparador" },
  { value: "delay", label: "Con retraso", hint: "Espera y vuelve a evaluar las condiciones al vencer" },
  { value: "schedule", label: "Programada", hint: "A una hora fija del día" },
  { value: "recurring", label: "Recurrente", hint: "Se repite mientras el sujeto siga en la condición" },
];

/** Milisegundos hasta la próxima vez que den las `hour:00`. */
export const msUntilHour = (hour = 9, from = _now) => {
  const target = new Date(from);
  target.setHours(Number(hour) || 0, 0, 0, 0);
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - from.getTime();
};

/**
 * ⭐ Cuánto espera un trabajo según el modo de la regla.
 *
 * **Los cuatro modos se resuelven acá y sólo acá**: el motor encola siempre de
 * la misma forma y no sabe de horas ni de recurrencias. "Inmediata" es un
 * retraso de 0 — el mismo camino de código (§2.4).
 */
export const delayForExecution = (execution = {}) => {
  switch (execution.mode) {
    case "delay": return delayToMs(execution.delay);
    case "schedule": return msUntilHour(execution.at?.hour ?? 9);
    case "recurring": return delayToMs(execution.every) || DAY;
    default: return 0;
  }
};

/** Texto del modo, para la lista y el historial. */
export const describeExecutionMode = (execution = {}) => {
  const unit = (d) => DELAY_UNITS.find((u) => u.value === d?.unit)?.label || "horas";
  switch (execution.mode) {
    case "delay": return `${execution.delay?.value ?? 0} ${unit(execution.delay)} después`;
    case "schedule": return `todos los días a las ${String(execution.at?.hour ?? 9).padStart(2, "0")}:00`;
    case "recurring": return `cada ${execution.every?.value ?? 1} ${unit(execution.every)}`;
    default: return "inmediata";
  }
};
