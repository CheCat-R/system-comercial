/**
 * La regla, en castellano.
 *
 * La lista y el historial no muestran JSON: muestran la oración que la regla
 * dice. Es lo que permite entender un tablero de automatizaciones de un vistazo
 * — y lo que obliga a que el modelo sea simple: si una regla no se puede
 * escribir en una oración, es porque tiene demasiadas piezas (§4.4).
 */
import { getEvent } from "./events";
import { getCondition, OPERATORS } from "./conditions";
import { getAction } from "./actions";
import { describeExecutionMode } from "./clock";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;

/** Un valor de condición, formateado según el tipo declarado. */
export const describeValue = (condition, op, value) => {
  if (["is_empty", "is_not_empty", "is_true", "is_false"].includes(op)) return "";
  if (Array.isArray(value)) {
    const labels = value.map((v) => optionLabel(condition, v));
    return op === "between" ? labels.join(" y ") : labels.join(", ");
  }
  if (condition?.type === "money") return money(value);
  return optionLabel(condition, value);
};

const optionLabel = (condition, value) => {
  if (!condition?.options) return String(value ?? "");
  try {
    const found = condition.options().find((o) => String(o.value) === String(value));
    return found ? found.label : String(value ?? "");
  } catch {
    return String(value ?? "");
  }
};

export const describeCondition = (rule) => {
  const condition = getCondition(rule.field);
  if (!condition) return `«${rule.field}» (no existe)`;
  const op = OPERATORS[rule.op]?.label || rule.op;
  const value = describeValue(condition, rule.op, rule.value);
  return `${condition.label} ${op}${value ? ` ${value}` : ""}`;
};

export const describeConditions = (group) => {
  const rules = group?.rules || [];
  if (!rules.length) return ["siempre"];
  return rules.map((r) => (r.rules ? describeConditions(r).join(" o ") : describeCondition(r)));
};

export const describeAction = (step) => {
  const action = getAction(step.key);
  if (!action) return `«${step.key}» (no existe)`;
  const p = step.params || {};
  if (p.title) return `${action.label}: «${p.title}»`;
  if (p.message) return `${action.label}: «${p.message}»`;
  if (p.tag) return `${action.label} «${p.tag}»`;
  if (p.audienceName) return `${action.label} «${p.audienceName}»`;
  return action.label;
};

export const describeTrigger = (trigger) => {
  const event = getEvent(trigger?.key);
  if (!event) return `«${trigger?.key}» (no existe)`;
  const params = trigger.params || {};
  const extras = Object.entries(params)
    .map(([k, v]) => {
      const spec = (event.scanParams || []).find((s) => s.key === k);
      if (!spec) return null;
      const value = Array.isArray(v)
        ? v.map((x) => spec.options?.find((o) => o.value === x)?.label || x).join(", ")
        : v;
      return `${spec.label.toLowerCase()}: ${value}`;
    })
    .filter(Boolean);
  return extras.length ? `${event.label} (${extras.join(" · ")})` : event.label;
};

/**
 * El texto del modo lo arma `lib/clock.js`, que es quien calcula el retraso.
 * Tener dos versiones de esta frase es la forma más fácil de que la lista diga
 * una cosa y el motor haga otra.
 */
export const describeExecution = (execution = {}) => describeExecutionMode(execution);

/**
 * Sólo la primera letra: bajar la cadena entera rompe los nombres propios y los
 * placeholders (`{{order.customerName}}` → `{{order.customername}}`, que además
 * deja de resolver).
 */
const lowerFirst = (s = "") => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** La regla entera, en una oración. */
export const describeRule = (rule) => {
  const conditions = describeConditions(rule.conditions);
  const when = describeTrigger(rule.trigger);
  const si = conditions[0] === "siempre" ? "" : ` y ${conditions.join(rule.conditions?.match === "any" ? " o " : " y ")}`;
  const then = rule.actions.map(describeAction).map(lowerFirst).join(", ");
  return `Cuando ${lowerFirst(when)}${si}, ${then}.`;
};

export const RUN_STATUS_META = {
  ok: { label: "Ejecutada", tone: "success" },
  parcial: { label: "Parcial", tone: "warning" },
  fallida: { label: "Fallida", tone: "danger" },
  descartada: { label: "Descartada", tone: "neutral" },
  bloqueada: { label: "Bloqueada", tone: "warning" },
  simulada: { label: "Simulada", tone: "info" },
  pendiente_aprobacion: { label: "Espera aprobación", tone: "warning" },
};

export const RULE_STATE_META = {
  publicada: { label: "Publicada", tone: "success" },
  borrador: { label: "Borrador", tone: "neutral" },
  pausada: { label: "Pausada", tone: "warning" },
};

export const STEP_STATUS_META = {
  ok: { label: "Hecho", tone: "success" },
  fallida: { label: "Falló", tone: "danger" },
  simulada: { label: "Simulada", tone: "info" },
  pendiente_aprobacion: { label: "A aprobar", tone: "warning" },
};
