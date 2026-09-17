/**
 * ⭐ La cola de acciones sensibles (§5.3).
 *
 * Reembolsar, cancelar, emitir una nota de crédito: cosas que mueven plata o no
 * se deshacen. El motor **no las ejecuta**; deja una propuesta acá con todo el
 * contexto, y una persona confirma o descarta.
 *
 * No es un mecanismo nuevo: es el mismo gate que Finanzas ya usa para los
 * reembolsos (`markReturnRequested` → `approveRefund`). Abrir un segundo camino
 * por el que la plata se mueve sin que nadie firme sería exactamente el error
 * que ese gate existe para evitar.
 *
 * ── ⭐ Se revalida al aprobar ─────────────────────────────────────────────
 * Entre que el motor propuso y alguien aprueba pasa tiempo: el pedido pudo
 * pagarse, cancelarse o desaparecer. Aprobar **no** reproduce una decisión
 * vieja: vuelve a cargar el sujeto, vuelve a evaluar las condiciones de la
 * regla y recién ahí ejecuta. Si el mundo cambió, la propuesta queda
 * `obsoleta` con el motivo.
 */
import { getAction } from "./actions";
import { buildContext, describeSubject } from "./subjects";
import { evaluateGroup } from "./conditions";
import { nowIso } from "./clock";
import { withContext } from "./bus";

let _pending = [];
let _seq = 0;

export const APPROVAL_STATUS = {
  pendiente: { label: "Pendiente", tone: "warning" },
  aprobada: { label: "Aprobada", tone: "success" },
  descartada: { label: "Descartada", tone: "neutral" },
  obsoleta: { label: "Obsoleta", tone: "neutral" },
  fallida: { label: "Falló al ejecutar", tone: "danger" },
};

const enrich = (p) => ({
  ...p,
  action: getAction(p.actionKey),
  statusMeta: APPROVAL_STATUS[p.status],
});

/**
 * Encola una propuesta. La llama el motor cuando una regla llega a una acción
 * sensible.
 */
export const propose = ({ rule, subject, event, actionKey, params, preview, runId }) => {
  const item = {
    id: `APR-${++_seq}`,
    ruleId: rule.id,
    ruleName: rule.name,
    subject,
    subjectLabel: describeSubject(subject),
    event: { key: event.key, payload: event.payload },
    actionKey,
    params,
    preview,
    runId,
    status: "pendiente",
    createdAt: nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    reason: null,
    result: null,
  };
  _pending = [item, ..._pending];
  return enrich(item);
};

export const listApprovals = ({ status } = {}) =>
  _pending.filter((p) => !status || p.status === status).map(enrich);

export const getApproval = (id) => {
  const p = _pending.find((x) => x.id === id);
  return p ? enrich(p) : null;
};

export const countPending = () => _pending.filter((p) => p.status === "pendiente").length;

const patch = (id, changes) => {
  _pending = _pending.map((p) => (p.id === id ? { ...p, ...changes } : p));
  return getApproval(id);
};

/**
 * Aprueba y **ejecuta ahora**, contra el estado de ahora.
 *
 * @param {Function} getRule  para volver a leer la regla y revalidar sus condiciones
 */
export const approve = (id, { by = null, getRule } = {}) => {
  const item = _pending.find((p) => p.id === id);
  if (!item) return { ok: false, error: "La propuesta no existe." };
  if (item.status !== "pendiente") return { ok: false, error: "Esta propuesta ya se resolvió." };

  const action = getAction(item.actionKey);
  if (!action) {
    return { ok: false, error: `La acción «${item.actionKey}» ya no existe en el catálogo.` };
  }

  // --- revalidación: el sujeto y las condiciones, ahora ---
  const ctx = buildContext(item.subject, item.event);
  if (!ctx) {
    patch(id, { status: "obsoleta", resolvedAt: nowIso(), resolvedBy: by, reason: `${item.subject.id} ya no existe.` });
    return { ok: false, error: `${item.subject.id} ya no existe: la propuesta quedó obsoleta.` };
  }

  const rule = getRule?.(item.ruleId);
  if (rule) {
    const evaluation = evaluateGroup(rule.conditions, ctx);
    if (!evaluation.pass) {
      const failed = evaluation.results.filter((r) => !r.pass).map((r) => r.label || r.field);
      const reason = `Las condiciones ya no se cumplen: ${failed.join(", ")}.`;
      patch(id, { status: "obsoleta", resolvedAt: nowIso(), resolvedBy: by, reason });
      return { ok: false, error: reason };
    }
  }

  // --- ejecución ---
  try {
    const result = withContext({ depth: 1, origin: "accion" }, () => action.run(ctx, item.params || {}));
    if (result?.ok === false) {
      patch(id, { status: "fallida", resolvedAt: nowIso(), resolvedBy: by, reason: result.detail });
      return { ok: false, error: result.detail };
    }
    const saved = patch(id, {
      status: "aprobada", resolvedAt: nowIso(), resolvedBy: by, result: result?.detail || "Hecho",
    });
    return { ok: true, approval: saved, detail: result?.detail || "Hecho" };
  } catch (err) {
    // El error del módulo dueño se propaga textual, igual que en una ejecución.
    patch(id, { status: "fallida", resolvedAt: nowIso(), resolvedBy: by, reason: err.message });
    return { ok: false, error: err.message };
  }
};

export const reject = (id, { by = null, reason = "" } = {}) => {
  const item = _pending.find((p) => p.id === id);
  if (!item) return { ok: false, error: "La propuesta no existe." };
  if (item.status !== "pendiente") return { ok: false, error: "Esta propuesta ya se resolvió." };
  patch(id, {
    status: "descartada", resolvedAt: nowIso(), resolvedBy: by,
    reason: reason.trim() || "Descartada sin motivo.",
  });
  return { ok: true };
};

export const clearApprovals = () => { _pending = []; };
