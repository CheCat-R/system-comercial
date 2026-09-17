/**
 * Única puerta de Automatizaciones.
 *
 * Escribe en Pedidos · CRM · Inventario · Logística · Marketing · Finanzas,
 * **siempre por sus `api/`**, nunca en sus datos (regla §1.1). Y nadie importa
 * este archivo: los módulos sólo conocen `lib/bus.js`, que no importa nada
 * (§1.2). Por eso el grafo sigue siendo acíclico.
 */
import { emit, getEventLog, withContext } from "../lib/bus";
import { seguridad } from "../lib/registry";
import {
  EVENTS, EVENT_MODULES, SUBJECT_TYPES, getEvent, listEvents, listStateEvents,
  assertEventContracts, subjectLabel,
} from "../lib/events";
import { allConditions, OPERATORS, getCondition, listConditions, conditionRejection } from "../lib/conditions";
import {
  allActions, ACTION_TIERS, getAction, listActions, actionRejection, defaultParams,
  listTasks, toggleTask, listNotifications, clearNotifications,
} from "../lib/actions";
import {
  connect, tick, runRule, runScanner, listRuns, getRun, forgetRule,
  GUARDS, GUARD_LABELS, RUN_STATUS,
} from "../lib/engine";
import { scanMatches, risingEdges, watermarkOf, clearWatermark } from "../lib/scanner";
import { buildContext, describeSubject } from "../lib/subjects";
import {
  now, nowIso, advance, nextDueAt, pendingJobs, formatStamp, relativeTo,
  HOUR, DAY, DELAY_UNITS, EXECUTION_MODES, describeExecutionMode, TODAY,
} from "../lib/clock";
import {
  describeRule, describeTrigger, describeConditions, describeCondition, describeAction, describeExecution,
  RUN_STATUS_META, RULE_STATE_META, STEP_STATUS_META,
} from "../lib/describe";
import {
  listApprovals, getApproval, approve as approveAction, reject as rejectAction,
  countPending, APPROVAL_STATUS,
} from "../lib/approvals";
import {
  canView, canEdit, canPublish, canUseSensitive, canApprove, canAdvanceClock,
  permissionsOf, PERMISSIONS, denial,
} from "../lib/rbac";
import { rules as seedRules } from "../data/rules.mock";

/* --------------------------------------------------------- contratos */

const brokenEvents = assertEventContracts();
if (brokenEvents.length && import.meta.env?.DEV) {
  console.error("[automatizaciones] eventos sin contrato completo:", brokenEvents);
}
export const getBrokenEventContracts = () => brokenEvents;

/* ------------------------------------------------------- re-exports */

export {
  EVENTS, EVENT_MODULES, SUBJECT_TYPES, allConditions, OPERATORS, allActions, ACTION_TIERS,
  GUARDS, GUARD_LABELS, RUN_STATUS, RUN_STATUS_META, RULE_STATE_META, STEP_STATUS_META,
  DELAY_UNITS, EXECUTION_MODES, TODAY, APPROVAL_STATUS, PERMISSIONS,
};
export {
  getEvent, listEvents, listStateEvents, subjectLabel,
  getCondition, listConditions, conditionRejection,
  getAction, listActions, actionRejection, defaultParams,
  listRuns, getRun, getEventLog,
  describeRule, describeTrigger, describeConditions, describeCondition, describeAction, describeExecution,
  buildContext, describeSubject, watermarkOf,
  listTasks, toggleTask, listNotifications, clearNotifications,
  now, nowIso, formatStamp, relativeTo, pendingJobs, nextDueAt, describeExecutionMode,
  listApprovals, getApproval, countPending,
  canView, canEdit, canPublish, canUseSensitive, canApprove, canAdvanceClock, permissionsOf,
};

/* -------------------------------------------------------------- reglas */

let _rules = JSON.parse(JSON.stringify(seedRules));
let _seq = _rules.length;

const enrich = (r) => {
  const event = getEvent(r.trigger?.key);
  const runs = listRuns({ ruleId: r.id, limit: 400 });
  const last = runs[0] || null;
  return {
    ...r,
    event,
    subjectType: event?.subjectType || null,
    subjectLabel: event ? subjectLabel(event.subjectType) : "—",
    triggerText: describeTrigger(r.trigger),
    conditionTexts: describeConditions(r.conditions),
    actionTexts: r.actions.map(describeAction),
    executionText: describeExecution(r.execution),
    sentence: describeRule(r),
    tiers: [...new Set(r.actions.map((a) => getAction(a.key)?.tier).filter(Boolean))],
    stats: {
      total: runs.length,
      ok: runs.filter((x) => x.status === "ok").length,
      failed: runs.filter((x) => ["fallida", "parcial"].includes(x.status)).length,
      blocked: runs.filter((x) => x.status === "bloqueada").length,
      pending: runs.filter((x) => x.status === "pendiente_aprobacion").length,
      lastAt: last?.startedAt || null,
      lastStatus: last?.status || null,
    },
  };
};

export const listRules = ({ search, state, module: mod } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _rules
    .map(enrich)
    .filter((r) => !state || r.state === state)
    .filter((r) => !mod || r.event?.module === mod)
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    .sort((a, b) => Number(b.state === "publicada") - Number(a.state === "publicada") || a.name.localeCompare(b.name));
};

export const getRule = (id) => {
  const r = _rules.find((x) => x.id === id);
  return r ? enrich(r) : null;
};

export const createRule = (data = {}, { role = "" } = {}) => {
  if (!canEdit(role)) return { ok: false, error: denial("crear automatizaciones") };
  if (!canUseSensitive(role) && (data.actions || []).some((a) => getAction(a.key)?.tier === "sensitive")) {
    return { ok: false, error: denial("usar acciones sensibles") };
  }
  const rule = {
    id: `AU-${String(++_seq).padStart(2, "0")}`,
    name: data.name?.trim() || "Automatización sin nombre",
    description: data.description || "",
    state: "borrador",
    system: false,
    createdBy: data.createdBy || seguridad().actorActual()?.name || "Sistema",
    createdAt: nowIso(),
    trigger: data.trigger || { kind: "event", key: "pedido.pagado", params: {} },
    conditions: data.conditions || { match: "all", rules: [] },
    actions: data.actions || [],
    execution: data.execution || { mode: "immediate" },
    guards: data.guards || { dedupeWindowHours: 24, maxRunsPerTick: 20 },
  };
  _rules = [..._rules, rule];
  return { ok: true, rule: enrich(rule) };
};

export const updateRule = (id, patch, { role = "" } = {}) => {
  if (!canEdit(role)) return { ok: false, error: denial("editar automatizaciones") };
  if (!canUseSensitive(role) && (patch.actions || []).some((a) => getAction(a.key)?.tier === "sensitive")) {
    return { ok: false, error: denial("usar acciones sensibles") };
  }

  const before = _rules.find((r) => r.id === id);
  _rules = _rules.map((r) => (r.id === id ? { ...r, ...patch } : r));

  /**
   * ⭐ Si cambió el **disparador** o el **modo de ejecución**, se olvida lo que
   * la regla ya había hecho: marca de agua y trabajos en cola.
   *
   * Encontrado probando: al pasar una regla de "inmediata" a "recurrente", los
   * sujetos que ya estaban dentro de la condición seguían en la marca de agua,
   * así que el escáner no creaba ningún trabajo y **la recurrencia no arrancaba
   * nunca**. Es razonable en general: lo que se disparó bajo la definición
   * vieja no dice nada sobre la nueva.
   */
  const changedTrigger = JSON.stringify(before?.trigger) !== JSON.stringify(patch.trigger ?? before?.trigger);
  const changedExecution = JSON.stringify(before?.execution) !== JSON.stringify(patch.execution ?? before?.execution);
  if (changedTrigger || changedExecution) {
    forgetRule(id);
    clearWatermark(id);
  }

  return { ok: true, rule: getRule(id), reset: changedTrigger || changedExecution };
};

/**
 * Cambiar de estado no es sólo un campo: al pausar hay que **descartar los
 * trabajos pendientes** de la regla. Si no, una regla pausada seguiría
 * ejecutando lo que encoló antes, que es exactamente lo que uno quiso evitar al
 * pausarla.
 */
export const setRuleState = (id, state, { role = "" } = {}) => {
  if (!canPublish(role)) return { ok: false, error: denial("publicar o pausar automatizaciones") };
  const rule = _rules.find((r) => r.id === id);
  if (!rule) return { ok: false, error: "La automatización no existe." };
  if (!["publicada", "borrador", "pausada"].includes(state)) return { ok: false, error: "Estado inválido." };

  _rules = _rules.map((r) => (r.id === id ? { ...r, state } : r));

  if (state !== "publicada") {
    const dropped = forgetRule(id);
    // La marca de agua también: al republicar, lo que ya estaba en la condición
    // vuelve a contar como entrada. Es lo esperable — si no, una regla pausada
    // un mes reanudaría muda.
    clearWatermark(id);
    return { ok: true, rule: getRule(id), droppedJobs: dropped };
  }

  return { ok: true, rule: getRule(id) };
};

export const duplicateRule = (id, { role = "" } = {}) => {
  const r = _rules.find((x) => x.id === id);
  if (!r) return { ok: false, error: "La automatización no existe." };
  const copy = JSON.parse(JSON.stringify(r));
  return createRule({ ...copy, name: `${r.name} (copia)`, system: false }, { role });
};

/** Las de fábrica no se borran: se duplican y se edita la copia. */
export const deleteRule = (id, { role = "" } = {}) => {
  if (!canEdit(role)) return { ok: false, error: denial("eliminar automatizaciones") };
  const r = _rules.find((x) => x.id === id);
  if (!r) return { ok: false, error: "La automatización no existe." };
  if (r.system) return { ok: false, error: "Las automatizaciones de fábrica no se eliminan. Duplicala y editá la copia." };
  _rules = _rules.filter((x) => x.id !== id);
  forgetRule(id);
  clearWatermark(id);
  return { ok: true };
};

/* ----------------------------------------------------------- el motor */

const getRules = () => _rules;

let _connected = false;

/**
 * Arranca el motor. Idempotente: la UI lo llama al montar cualquier pantalla del
 * módulo y no pasa nada si ya estaba conectado.
 */
export const start = () => {
  if (_connected) return;
  connect(getRules);
  _connected = true;
};

/** Corre un ciclo: escáner + drenaje de trabajos vencidos. */
export const runTick = () => tick(_rules);

/** Sólo el escáner, sin ejecutar — para ver qué está a punto de dispararse. */
export const previewScanner = () =>
  _rules
    .filter((r) => r.state === "publicada" && r.trigger?.kind === "state")
    .map((rule) => {
      const matches = scanMatches(rule);
      const { entered } = risingEdges(rule, matches, { dryRun: true });
      return {
        rule: enrich(rule),
        matches: matches.length,
        entering: entered.length,
        watermark: watermarkOf(rule.id).length,
      };
    });

/**
 * Simulación de una regla (dry-run).
 *
 * Corre **el mismo camino** que la ejecución real pero sin llamar a ningún
 * `api/`: cada acción se describe con su `preview()`. Sobre un dataset mock es
 * la única forma de confiar en una regla antes de publicarla (§9.3).
 *
 * La pantalla del simulador llega en F2; el motor ya lo soporta.
 */
export const simulateRule = (idOrRule, { limit = 10 } = {}) => {
  // Acepta un borrador que todavía no se guardó: simular antes de crear la
  // regla es justo el caso donde más sirve.
  const rule = typeof idOrRule === "string"
    ? _rules.find((r) => r.id === idOrRule)
    : idOrRule && { id: "AU-DRAFT", guards: {}, execution: { mode: "immediate" }, ...idOrRule };
  if (!rule || !rule.trigger?.key) return null;

  const event = getEvent(rule.trigger.key);
  let subjects = [];

  if (rule.trigger.kind === "state") {
    subjects = scanMatches(rule).map((m) => ({ subject: m.subject, payload: m.payload }));
  } else {
    // Para un disparador de evento no hay "sujetos que cumplen": se simula sobre
    // los eventos reales que ya pasaron por el bus.
    subjects = getEventLog({ key: rule.trigger.key, limit: 50 })
      .filter((e) => e.subject)
      .map((e) => ({ subject: e.subject, payload: e.payload }));
  }

  const runs = subjects.slice(0, limit).map(({ subject, payload }) =>
    runRule(rule, subject, {
      key: rule.trigger.key, payload, depth: 0, origin: "simulacion", at: nowIso(),
    }, { dryRun: true })
  );

  // Qué condición descarta más: es la respuesta a "¿por qué mi regla no
  // dispara?", que es la pregunta real detrás de abrir el simulador.
  const blockers = new Map();
  runs.filter((r) => r.status === "descartada").forEach((r) => {
    r.conditions.filter((c) => !c.pass).forEach((c) => {
      const key = c.label || c.field;
      blockers.set(key, (blockers.get(key) || 0) + 1);
    });
  });

  return {
    rule: enrich(rule),
    candidates: subjects.length,
    simulated: runs.length,
    matched: runs.filter((r) => r.status === "simulada").length,
    discarded: runs.filter((r) => r.status === "descartada").length,
    topBlockers: [...blockers.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
    runs,
    note: rule.trigger.kind === "state"
      ? "Sujetos que cumplen la condición ahora mismo."
      : `Se simula sobre los ${subjects.length} evento(s) «${event?.label || rule.trigger.key}» que ya pasaron por el bus.`,
  };
};

/* ------------------------------------------------------- plantillas */

/**
 * Las plantillas **son las reglas de fábrica** (§9.7): no hay un segundo
 * catálogo que mantener sincronizado. Empezar de una plantilla es duplicarla y
 * editar la copia, que es exactamente lo que ya hace `duplicateRule`.
 */
export const listTemplates = () =>
  _rules.filter((r) => r.system).map((r) => {
    const event = getEvent(r.trigger.key);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      sentence: describeRule(r),
      kind: event?.kind || "event",
      subjectLabel: event ? subjectLabel(event.subjectType) : "—",
      tiers: [...new Set(r.actions.map((a) => getAction(a.key)?.tier).filter(Boolean))],
    };
  });

/** Arranca una regla nueva desde una plantilla, sin guardarla todavía. */
export const draftFromTemplate = (templateId) => {
  const r = _rules.find((x) => x.id === templateId);
  if (!r) return null;
  const copy = JSON.parse(JSON.stringify(r));
  return {
    name: `${r.name} (copia)`,
    description: r.description,
    trigger: copy.trigger,
    conditions: copy.conditions,
    actions: copy.actions,
    execution: copy.execution,
    guards: copy.guards,
  };
};

/* --------------------------------------------------- emisor manual */

/**
 * Emite un evento a mano desde la Bandeja de eventos, para probar una regla sin
 * tener que provocar la operación real. Usa el `sample` del contrato como
 * payload por defecto.
 */
export const emitManual = (eventKey, subjectId, payload) => {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, error: "Ese evento no existe en el catálogo." };
  if (!subjectId) return { ok: false, error: `Indicá un ${subjectLabel(event.subjectType).toLowerCase()}.` };

  const subject = { type: event.subjectType, id: subjectId };
  if (!buildContext(subject)) {
    return { ok: false, error: `No se encontró ${subjectLabel(event.subjectType).toLowerCase()} «${subjectId}».` };
  }

  withContext({ depth: 0, origin: "manual" }, () =>
    emit(eventKey, subject, payload || event.sample)
  );
  return { ok: true };
};

/* --------------------------------------------------------- el reloj */

export const advanceClock = (ms, { role = "" } = {}) => {
  if (!canAdvanceClock(role)) return { ok: false, error: denial("avanzar el reloj") };
  advance(ms);
  return { ok: true, now: now(), executed: runTick() };
};

export const advanceToNextJob = ({ role = "" } = {}) => {
  const next = nextDueAt();
  if (!next) return { ok: true, now: now(), executed: [], note: "No hay trabajos pendientes." };
  const ms = next.getTime() - now().getTime() + 1000;
  return advanceClock(ms, { role });
};

export const CLOCK_STEPS = [
  { label: "+1 hora", ms: HOUR },
  { label: "+6 horas", ms: 6 * HOUR },
  { label: "+1 día", ms: DAY },
];

/* ----------------------------------------------------- aprobaciones */

/**
 * Aprobar ejecuta **ahora y contra el estado de ahora**: `approvals.approve`
 * vuelve a cargar el sujeto y a evaluar las condiciones de la regla antes de
 * llamar al `api/`. Aprobar no es reproducir una decisión vieja.
 */
export const approveAction_ = (id, { role = "", by = null } = {}) => {
  if (!canApprove(role)) return { ok: false, error: denial("aprobar acciones sensibles") };
  return approveAction(id, { by, getRule: (ruleId) => _rules.find((r) => r.id === ruleId) });
};

export const rejectAction_ = (id, { role = "", by = null, reason = "" } = {}) => {
  if (!canApprove(role)) return { ok: false, error: denial("descartar acciones sensibles") };
  return rejectAction(id, { by, reason });
};

export { approveAction_ as approveApproval, rejectAction_ as rejectApproval };

/* --------------------------------------------------------- métricas */

/**
 * Qué está haciendo el módulo y **qué regla falla**. Deliberadamente corto: el
 * detalle está en el historial, acá va lo que se mira de reojo.
 */
export const getAutomationMetrics = () => {
  const runs = listRuns({ limit: 400 }).filter((r) => !r.dryRun);
  const byRule = new Map();

  runs.forEach((r) => {
    const acc = byRule.get(r.ruleId) || { ruleId: r.ruleId, ruleName: r.ruleName, total: 0, ok: 0, failed: 0, blocked: 0, discarded: 0, pending: 0 };
    acc.total += 1;
    if (r.status === "ok") acc.ok += 1;
    if (["fallida", "parcial"].includes(r.status)) acc.failed += 1;
    if (r.status === "bloqueada") acc.blocked += 1;
    if (r.status === "descartada") acc.discarded += 1;
    if (r.status === "pendiente_aprobacion") acc.pending += 1;
    byRule.set(r.ruleId, acc);
  });

  const steps = runs.flatMap((r) => r.steps);
  const byAction = new Map();
  steps.forEach((st) => {
    const acc = byAction.get(st.key) || { key: st.key, label: st.label, tier: st.tier, ok: 0, failed: 0, pending: 0 };
    if (st.status === "ok") acc.ok += 1;
    if (st.status === "fallida") acc.failed += 1;
    if (st.status === "pendiente_aprobacion") acc.pending += 1;
    byAction.set(st.key, acc);
  });

  return {
    runs: runs.length,
    actions: steps.filter((st) => st.status === "ok").length,
    byRule: [...byRule.values()].sort((a, b) => b.total - a.total),
    byAction: [...byAction.values()].sort((a, b) => (b.ok + b.failed) - (a.ok + a.failed)),
    // "Qué regla falla" es la pregunta que justifica esta pantalla.
    worst: [...byRule.values()].filter((r) => r.failed > 0).sort((a, b) => b.failed - a.failed),
  };
};

/* -------------------------------------------------------- resumen */

export const getSummary = () => {
  const rules = listRules();
  const runs = listRuns({ limit: 400 });
  return {
    total: rules.length,
    published: rules.filter((r) => r.state === "publicada").length,
    paused: rules.filter((r) => r.state === "pausada").length,
    drafts: rules.filter((r) => r.state === "borrador").length,
    runs: runs.length,
    failed: runs.filter((r) => ["fallida", "parcial"].includes(r.status)).length,
    blocked: runs.filter((r) => r.status === "bloqueada").length,
    pendingApproval: runs.filter((r) => r.status === "pendiente_aprobacion").length,
    tasks: listTasks({ done: false }).length,
    jobs: pendingJobs().length,
    approvals: countPending(),
    events: getEventLog({ limit: 400 }).length,
  };
};

export { runScanner };
