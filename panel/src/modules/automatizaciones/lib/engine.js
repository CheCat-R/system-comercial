/**
 * ⭐ El motor: evento → condición → acción.
 *
 * Un ciclo completo es siempre el mismo, venga el evento del bus o del escáner:
 *
 *   1. ¿Qué reglas publicadas escuchan este evento?
 *   2. Para cada una, ¿pasan las salvaguardas?          (§2.6)
 *   3. Cargar el sujeto **ahora** y evaluar condiciones  (§2.4)
 *   4. Ejecutar las acciones, una por una, registrando cada resultado
 *   5. Dejar la ejecución en el historial, pase lo que pase
 *
 * ── ⭐ Las cuatro salvaguardas ────────────────────────────────────────────
 * Un motor que escucha lo que él mismo provoca es un bucle infinito esperando a
 * ocurrir: la regla A cambia un pedido → se emite un evento → dispara la regla B
 * → mueve stock → dispara la regla A. En una app sin backend eso es una pestaña
 * congelada. Hacen falta las cuatro porque cada una tapa un agujero distinto, y
 * **cuando cortan lo dicen**: un tope silencioso es indistinguible de un motor
 * roto.
 */
import { subscribe, withContext, tagEvent, record } from "./bus";
// ⭐ Cuando actúa una regla, **el actor es la regla**. Sin esto, el rastro de un
// pedido cancelado por una automatización diría "Sistema", que es la forma
// elegante de decir *no sabemos* (MODULO-SEGURIDAD.md §3).
// Seguridad no se importa: se enchufa (ver registry.js). Importarla cerraría
// el círculo, porque `securityApi` emite al bus de este mismo módulo.
import { seguridad } from "./registry";

import { evaluateGroup } from "./conditions";
import { getAction, ACTION_TIERS } from "./actions";
import { buildContext, describeSubject } from "./subjects";
import { scanMatches, risingEdges, forgetMark, markOfMatch } from "./scanner";
import {
  now, nowIso, schedule, dueJobs, removeJob, delayForExecution, dropJobsOfRule,
} from "./clock";
import { propose } from "./approvals";

/* --------------------------------------------------------- salvaguardas */

export const GUARDS = {
  maxDepth: 3,
  maxRunsPerTick: 20,
  dedupeWindowHours: 24,
};

export const GUARD_LABELS = {
  depth: "Profundidad de cadena",
  dedupe: "Idempotencia",
  budget: "Presupuesto por tick",
  selfTrigger: "Auto-disparo",
};

/** `ruleId|subjectId|eventKey` → ISO de la última ejecución. */
let _dedupe = new Map();

/** Reglas que están ejecutándose en la cadena actual (salvaguarda 4). */
let _inFlight = new Set();

/**
 * La idempotencia usa **la misma granularidad que la marca de agua**.
 *
 * El escáner de stock trabaja por SKU × depósito (`SKU-1@DEP-04`) porque dos
 * depósitos cortos son dos cosas distintas que resolver. Si la clave de dedupe
 * usara sólo el SKU, el segundo depósito quedaría bloqueado por 24 h y el aviso
 * nunca llegaría: dos mecanismos contando cosas distintas es peor que no tener
 * ninguno. Por eso el evento puede traer su propio `dedupeId`.
 */
const dedupeKey = (ruleId, event, subject) =>
  `${ruleId}|${event.dedupeId || subject.id}|${event.key}`;

const checkGuards = (rule, subject, event, runsThisTick, { recurring = false } = {}) => {
  if (event.depth > GUARDS.maxDepth) {
    return { blocked: "depth", reason: `La cadena llegó a profundidad ${event.depth}; el tope es ${GUARDS.maxDepth}. Se cortó para evitar un bucle.` };
  }

  if (_inFlight.has(rule.id)) {
    return { blocked: "selfTrigger", reason: `«${rule.name}» ya está ejecutándose en esta cadena: una regla no puede dispararse a sí misma.` };
  }

  // ⭐ Una recurrencia no puede chocar con su propia idempotencia.
  // "Recordar cada 2 días" con una ventana de dedupe de 24 h funcionaría; con
  // una de 72 h, la regla no volvería a ejecutarse nunca y el usuario vería una
  // recurrencia muda. En un job recurrente **el intervalo ES el límite de
  // frecuencia**, así que la ventana no se aplica.
  const window = recurring ? 0 : (rule.guards?.dedupeWindowHours ?? GUARDS.dedupeWindowHours) * 3_600_000;
  const last = window ? _dedupe.get(dedupeKey(rule.id, event, subject)) : null;
  if (last && now().getTime() - new Date(last).getTime() < window) {
    const hours = Math.round((now().getTime() - new Date(last).getTime()) / 3_600_000);
    return { blocked: "dedupe", reason: `Ya se ejecutó sobre ${event.dedupeId || subject.id} por «${event.key}» hace ${hours} h; la ventana de idempotencia es de ${window / 3_600_000} h.` };
  }

  const budget = rule.guards?.maxRunsPerTick ?? GUARDS.maxRunsPerTick;
  if (runsThisTick >= budget) {
    return { blocked: "budget", reason: `«${rule.name}» alcanzó su presupuesto de ${budget} ejecuciones en este tick.` };
  }

  return { blocked: null };
};

/* ------------------------------------------------------------ historial */

let _runs = [];
let _runSeq = 0;

const pushRun = (run) => {
  _runs = [run, ..._runs].slice(0, 400);
  return run;
};

export const listRuns = ({ ruleId, status, limit = 200 } = {}) =>
  _runs
    .filter((r) => !ruleId || r.ruleId === ruleId)
    .filter((r) => !status || r.status === status)
    .slice(0, limit);

export const getRun = (id) => _runs.find((r) => r.id === id) || null;

export const seedRuns = (runs) => { _runs = [...runs]; _runSeq = runs.length; };

export const clearRuns = () => { _runs = []; };

/* ------------------------------------------------------------ ejecución */

const RUN_STATUS = {
  ok: "ok",
  parcial: "parcial",
  fallida: "fallida",
  descartada: "descartada",
  bloqueada: "bloqueada",
  simulada: "simulada",
  pendiente_aprobacion: "pendiente_aprobacion",
};

export { RUN_STATUS };

/**
 * Ejecuta una regla sobre un sujeto. Devuelve la ejecución registrada.
 *
 * `dryRun` corre exactamente el mismo camino pero **sin llamar a ningún `api/`**:
 * usa `preview()` de cada acción. Es lo que hace posible el simulador de F2.
 */
export const runRule = (rule, subject, event, { dryRun = false } = {}) => {
  const startedAt = nowIso();
  const t0 = Date.now();

  const run = {
    id: `RUN-${++_runSeq}`,
    ruleId: rule.id,
    ruleName: rule.name,
    subject,
    subjectLabel: null,
    event: { key: event.key, payload: event.payload, depth: event.depth, origin: event.origin },
    startedAt,
    status: null,
    reason: null,
    conditions: [],
    steps: [],
    ms: 0,
    dryRun,
  };

  // --- 1. cargar el sujeto AHORA, no cuando se emitió el evento ---
  const ctx = buildContext(subject, event);
  if (!ctx) {
    run.status = RUN_STATUS.descartada;
    run.reason = `El sujeto ${subject.id} ya no existe: entre que se encoló y venció, dejó de estar disponible.`;
    run.ms = Date.now() - t0;
    return pushRun(run);
  }
  run.subjectLabel = describeSubject(subject, ctx);

  // --- 2. condiciones (se revalidan siempre, incluso en un job diferido) ---
  const evaluation = evaluateGroup(rule.conditions, ctx);
  run.conditions = evaluation.results;
  if (!evaluation.pass) {
    run.status = RUN_STATUS.descartada;
    const failed = evaluation.results.filter((r) => !r.pass).map((r) => r.label || r.field);
    run.reason = `No se cumplen las condiciones: ${failed.join(", ") || "—"}.`;
    run.ms = Date.now() - t0;
    return pushRun(run);
  }

  // --- 3. acciones ---
  _inFlight.add(rule.id);
  try {
    rule.actions.forEach((step) => {
      const action = getAction(step.key);
      if (!action) {
        run.steps.push({ key: step.key, label: step.key, status: "fallida", detail: `La acción «${step.key}» no existe en el catálogo.` });
        return;
      }

      const base = { key: step.key, label: action.label, tier: action.tier };

      // Simulación: se describe, no se ejecuta.
      if (dryRun) {
        let text = "";
        try { text = action.preview(ctx, step.params || {}); } catch { text = "(no se pudo previsualizar)"; }
        run.steps.push({ ...base, status: "simulada", detail: text });
        return;
      }

      // ⭐ Las acciones sensibles no se ejecutan solas (§5.3). La cola de
      // aprobación tiene su pantalla en F3; la propiedad de seguridad rige
      // desde ahora.
      if (action.tier === "sensitive") {
        let text = "";
        try { text = action.preview(ctx, step.params || {}); } catch { text = action.label; }
        const proposal = propose({
          rule, subject, event, actionKey: step.key, params: step.params || {},
          preview: text, runId: run.id,
        });
        run.steps.push({
          ...base,
          status: "pendiente_aprobacion",
          detail: `${text} — queda propuesta (${proposal.id}), no ejecutada.`,
          ref: proposal.id,
        });
        return;
      }

      try {
        // Los eventos que emita el `api/` durante esta acción heredan depth+1,
        // que es lo que permite cortar las cascadas.
        const result = seguridad().conActor(seguridad().actorAutomatizacion(rule), () =>
          withContext({ depth: event.depth + 1, origin: "accion" }, () =>
            action.run(ctx, step.params || {})
          )
        );
        run.steps.push({
          ...base,
          status: result?.ok === false ? "fallida" : "ok",
          detail: result?.detail || "Hecho",
          ref: result?.ref || null,
        });
      } catch (err) {
        // ⭐ El error del módulo dueño se propaga TEXTUAL (regla §8.2).
        run.steps.push({ ...base, status: "fallida", detail: err.message });
      }
    });
  } finally {
    _inFlight.delete(rule.id);
  }

  // --- 4. estado final ---
  const failed = run.steps.filter((s) => s.status === "fallida").length;
  const pending = run.steps.filter((s) => s.status === "pendiente_aprobacion").length;

  if (dryRun) run.status = RUN_STATUS.simulada;
  else if (failed && failed === run.steps.length) run.status = RUN_STATUS.fallida;
  else if (failed) run.status = RUN_STATUS.parcial;
  else if (pending) run.status = RUN_STATUS.pendiente_aprobacion;
  else run.status = RUN_STATUS.ok;

  if (!dryRun) _dedupe.set(dedupeKey(rule.id, event, subject), nowIso());

  run.ms = Date.now() - t0;
  return pushRun(run);
};

const blockedRun = (rule, subject, event, guard) =>
  pushRun({
    id: `RUN-${++_runSeq}`,
    ruleId: rule.id,
    ruleName: rule.name,
    subject,
    subjectLabel: describeSubject(subject),
    event: { key: event.key, payload: event.payload, depth: event.depth, origin: event.origin },
    startedAt: nowIso(),
    status: RUN_STATUS.bloqueada,
    guard: guard.blocked,
    guardLabel: GUARD_LABELS[guard.blocked],
    reason: guard.reason,
    conditions: [],
    steps: [],
    ms: 0,
  });

/* ------------------------------------------------------------ despacho */

/** Reglas activas que escuchan un evento. */
const matchingRules = (rules, eventKey) =>
  rules.filter((r) => r.state === "publicada" && r.trigger?.key === eventKey);

/**
 * Procesa un evento del bus: encola un trabajo por cada regla que lo escucha.
 * El retraso sale del modo de ejecución de la regla; "inmediata" es
 * `delayMs = 0`, o sea el mismo camino (§2.4).
 */
export const handleEvent = (rules, event) => {
  const matched = matchingRules(rules, event.key);
  if (event.id) tagEvent(event.id, matched.map((r) => r.id));
  if (!matched.length || !event.subject) return [];

  return matched.map((rule) =>
    schedule({
      ruleId: rule.id,
      subject: event.subject,
      event,
      kind: rule.execution?.mode || "immediate",
      delayMs: delayForExecution(rule.execution),
    })
  );
};

/**
 * Corre el escáner de todas las reglas de condición observada y encola los
 * **flancos de subida**: sólo los sujetos que acaban de entrar en la condición.
 */
export const runScanner = (rules) => {
  const jobs = [];

  rules
    .filter((r) => r.state === "publicada" && r.trigger?.kind === "state")
    .forEach((rule) => {
      const matches = scanMatches(rule);
      const { entered } = risingEdges(rule, matches);

      entered.forEach((m) => {
        const event = {
          id: null,
          key: rule.trigger.key,
          subject: m.subject,
          // Misma granularidad que la marca de agua (ver `dedupeKey`).
          dedupeId: m.key || m.subject.id,
          payload: m.payload,
          at: nowIso(),
          depth: 0,
          origin: "escaner",
        };
        // Se registra en la traza pero NO se emite: la regla ya tiene su
        // trabajo encolado acá abajo, y emitirlo haría que el suscriptor lo
        // encolara una segunda vez.
        const logged = record({ ...event, matchedRules: [rule.id] });
        jobs.push(schedule({
          ruleId: rule.id,
          subject: m.subject,
          event: { ...event, id: logged.id },
          kind: rule.execution?.mode || "immediate",
          delayMs: delayForExecution(rule.execution),
        }));
      });
    });

  return jobs;
};

/**
 * ⭐ El tick: corre el escáner y drena los trabajos vencidos.
 *
 * Es el único lugar donde se ejecuta algo, así que es también el único lugar
 * donde se aplica el presupuesto por regla.
 */
export const tick = (rules) => {
  runScanner(rules);

  const runsPerRule = new Map();
  const executed = [];

  dueJobs().forEach((job) => {
    removeJob(job.id);

    const rule = rules.find((r) => r.id === job.ruleId);
    if (!rule || rule.state !== "publicada") return;

    const count = runsPerRule.get(rule.id) || 0;
    const guard = checkGuards(rule, job.subject, job.event, count, { recurring: job.kind === "recurring" });

    if (guard.blocked) {
      executed.push(blockedRun(rule, job.subject, job.event, guard));
      return;
    }

    runsPerRule.set(rule.id, count + 1);
    const run = runRule(rule, job.subject, job.event);
    executed.push(run);

    // ⭐ Recurrente: se reencola sólo si el sujeto SIGUE en la condición.
    //
    // Hay dos formas de dejar de estar: que fallen las condiciones de la regla
    // (la ejecución sale `descartada`) o —en un disparador observado— que el
    // sujeto ya no aparezca en el escaneo, que es el caso que de verdad
    // importa: si el stock se repuso, el recordatorio tiene que parar. Mirar
    // sólo las condiciones dejaba avisos repitiéndose sobre un problema ya
    // resuelto, que es exactamente lo que hace que la gente apague las
    // automatizaciones.
    if (job.kind === "recurring") {
      const conditionsHold = run.status !== "descartada";
      // La marca, no el id del sujeto: el escáner de stock trabaja por
      // SKU × depósito, así que preguntar "¿sigue este SKU en la condición?"
      // mantendría viva la recurrencia del depósito ya repuesto.
      const mark = job.event?.dedupeId || job.subject.id;
      const stillInScan = rule.trigger?.kind !== "state"
        || scanMatches(rule).some((m) => markOfMatch(m) === mark);

      if (conditionsHold && stillInScan) {
        schedule({
          ruleId: rule.id,
          subject: job.subject,
          event: job.event,
          kind: "recurring",
          delayMs: delayForExecution(rule.execution),
        });
      } else if (!stillInScan) {
        // Salió de la condición: se saca su marca para que, si vuelve a entrar
        // más adelante, la regla arranque de nuevo.
        forgetMark(rule.id, mark);
      }
    }
  });

  return executed;
};

/* ------------------------------------------------------- suscripción */

let _unsubscribe = null;

/**
 * Conecta el motor al bus. `getRules` es una función para que el motor siempre
 * vea la lista viva, no una copia del momento del arranque.
 */
export const connect = (getRules) => {
  if (_unsubscribe) _unsubscribe();
  _unsubscribe = subscribe((event) => {
    const rules = getRules();
    handleEvent(rules, event);
    // Los eventos inmediatos se drenan en el acto: si no, "inmediata" sería
    // "cuando alguien entre a la pantalla de Automatizaciones".
    tick(rules);
  });
  return _unsubscribe;
};

export const disconnect = () => { if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; } };

/** Al pausar o borrar una regla, sus trabajos pendientes no deben ejecutarse. */
export const forgetRule = (ruleId) => {
  const dropped = dropJobsOfRule(ruleId);
  [..._dedupe.keys()].forEach((k) => { if (k.startsWith(`${ruleId}|`)) _dedupe.delete(k); });
  return dropped;
};

export const resetGuards = () => { _dedupe = new Map(); _inFlight = new Set(); };
