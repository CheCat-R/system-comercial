/**
 * ⭐ El evaluador de condiciones y su vocabulario base.
 *
 * Igual que un evento, **una condición declara de dónde sale su valor** (§4.1).
 * Y las opciones cerradas —segmentos, tiers, estados de stock, estados de
 * envío— **se leen del módulo dueño**, nunca se copian acá: si Inventario
 * agrega un estado, el builder lo ofrece sin tocar este archivo, y dos pantallas
 * del panel no pueden terminar contradiciéndose (regla §8.9).
 *
 * `subjectTypes` es lo que hace que el builder pueda deshabilitar con motivo:
 * una condición sobre el envío no se puede colgar de una regla cuyo sujeto es
 * una cuenta (§2.1).
 *
 * ── ⭐ Qué quedó acá y qué se fue ─────────────────────────────────────────
 *
 * Antes este archivo importaba de Clientes, Inventario, Logística,
 * Integraciones y Seguridad para llenar los selectores. Eso ataba el motor a
 * cinco módulos de negocio y era parte del nudo que hacía imposible llevarse un
 * módulo solo a otro proyecto.
 *
 * Ahora acá viven **los operadores, la evaluación y las condiciones de
 * contexto** (hora, día hábil) — lo genérico, lo que existe en cualquier panel.
 * Las ~35 condiciones de dominio las declara su módulo dueño y llegan por
 * `registrarCondicion()`. El `options: () => …` sigue siendo un thunk que lee
 * del módulo dueño; lo único que cambió es de qué lado del import está.
 */
import { registrarCondiciones, condicion, condiciones } from "./registry";

/**
 * Se reexporta para que un módulo declare sus condiciones con un solo import:
 * el registro y el vocabulario (operadores, atajos de opciones) vienen juntos,
 * que es como se usan.
 */
export { registrarCondiciones };

/* ---------------------------------------------------------- operadores */

export const OPERATORS = {
  eq: { label: "es igual a", arity: 1 },
  ne: { label: "es distinto de", arity: 1 },
  gt: { label: "es mayor que", arity: 1 },
  gte: { label: "es mayor o igual a", arity: 1 },
  lt: { label: "es menor que", arity: 1 },
  lte: { label: "es menor o igual a", arity: 1 },
  in: { label: "es alguno de", arity: "many" },
  not_in: { label: "no es ninguno de", arity: "many" },
  between: { label: "está entre", arity: 2 },
  contains: { label: "contiene", arity: 1 },
  is_empty: { label: "está vacío", arity: 0 },
  is_not_empty: { label: "no está vacío", arity: 0 },
  is_true: { label: "es verdadero", arity: 0 },
  is_false: { label: "es falso", arity: 0 },
  changed_to: { label: "pasó a ser", arity: 1 },
};

/**
 * Los juegos de operadores por tipo de campo. Se exportan porque los usan los
 * módulos al declarar sus condiciones: que cada uno arme su propia lista sería
 * la forma más rápida de que dos módulos ofrezcan operadores distintos para el
 * mismo tipo de dato.
 */
export const NUMERIC_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "between"];
export const ENUM_OPS = ["eq", "ne", "in", "not_in"];
export const TEXT_OPS = ["eq", "ne", "contains", "is_empty", "is_not_empty"];
export const BOOL_OPS = ["is_true", "is_false"];
export const LIST_OPS = ["contains", "is_empty", "is_not_empty"];

/** Atajos para armar las opciones de un selector desde el mapa del módulo dueño. */
export const asOptions = (map) => Object.values(map).map((x) => ({ value: x.key, label: x.label }));
export const asStatusOptions = (map) =>
  Object.entries(map).map(([key, x]) => ({ value: key, label: x.label }));

/* ------------------------------------- las condiciones propias del motor */

registrarCondiciones({
  "context.isWorkday": {
    label: "Es día hábil", group: "Contexto",
    subjectTypes: null, type: "boolean", ops: BOOL_OPS,
    source: "reloj del motor",
    get: (c) => c.context?.isWorkday ?? null,
  },
  "context.hour": {
    label: "Hora del día", group: "Contexto",
    subjectTypes: null, type: "number", ops: NUMERIC_OPS,
    source: "reloj del motor",
    get: (c) => c.context?.hour ?? null,
  },
});

/* -------------------------------------------------------------- lectura */

export const getCondition = (key) => condicion(key);

/** Todas las registradas: las de contexto más las que trajo cada módulo del proyecto. */
export const allConditions = () => condiciones();

/** `subjectTypes: null` = aplica a cualquier sujeto (las de contexto). */
export const appliesTo = (condition, subjectType) =>
  !condition?.subjectTypes || condition.subjectTypes.includes(subjectType);

/**
 * Por qué una condición no se puede usar con este sujeto. Se muestra en el
 * builder junto a la opción **deshabilitada**, nunca escondida: ver la razón
 * enseña el modelo, que la opción desaparezca no (§9.2).
 */
export const conditionRejection = (condition, subjectType) => {
  if (!condition) return "Elegí una condición.";
  if (appliesTo(condition, subjectType)) return null;
  const labels = condition.subjectTypes.join(", ");
  return `«${condition.label}» sólo aplica a: ${labels}. El sujeto de esta regla es «${subjectType}».`;
};

export const listConditions = (subjectType) =>
  condiciones().map((c) => ({ ...c, rejection: conditionRejection(c, subjectType) }));

/* ----------------------------------------------------------- evaluación */

const toNumber = (v) => (v == null || v === "" ? null : Number(v));

const compare = (op, actual, value) => {
  switch (op) {
    case "eq": return String(actual) === String(value);
    case "ne": return String(actual) !== String(value);
    case "gt": return toNumber(actual) > toNumber(value);
    case "gte": return toNumber(actual) >= toNumber(value);
    case "lt": return toNumber(actual) < toNumber(value);
    case "lte": return toNumber(actual) <= toNumber(value);
    case "in": return (Array.isArray(value) ? value : [value]).map(String).includes(String(actual));
    case "not_in": return !(Array.isArray(value) ? value : [value]).map(String).includes(String(actual));
    case "between": {
      const n = toNumber(actual);
      const [a, b] = Array.isArray(value) ? value : [null, null];
      return n != null && n >= toNumber(a) && n <= toNumber(b);
    }
    case "contains":
      return Array.isArray(actual)
        ? actual.map(String).includes(String(value))
        : String(actual ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    case "is_empty": return actual == null || actual === "" || (Array.isArray(actual) && !actual.length);
    case "is_not_empty": return !(actual == null || actual === "" || (Array.isArray(actual) && !actual.length));
    case "is_true": return actual === true;
    case "is_false": return actual === false;
    default: return false;
  }
};

/**
 * Evalúa una condición sola. Devuelve el resultado **y el valor que vio**, que
 * es lo que el historial y el simulador necesitan para explicar por qué una
 * regla no disparó.
 */
export const evaluateOne = (rule, ctx) => {
  const condition = getCondition(rule.field);
  if (!condition) {
    return { field: rule.field, pass: false, actual: null, error: `La condición «${rule.field}» no existe en el catálogo.` };
  }

  // `changed_to` sólo tiene sentido sobre un evento que trae from/to.
  if (rule.op === "changed_to") {
    const to = ctx.event?.payload?.to;
    return {
      field: rule.field, label: condition.label, op: rule.op, value: rule.value,
      actual: to ?? null,
      pass: to != null && String(to) === String(rule.value),
      note: to == null ? "El evento no trae un cambio de valor." : null,
    };
  }

  let actual = null;
  try { actual = condition.get(ctx); } catch { actual = null; }

  return {
    field: rule.field, label: condition.label, op: rule.op, value: rule.value,
    actual,
    pass: compare(rule.op, actual, rule.value),
  };
};

/**
 * Evalúa el grupo entero. Un solo nivel de anidamiento a propósito (§4.4): con
 * profundidad ilimitada llega el árbol booleano que nadie sabe leer seis meses
 * después.
 */
export const evaluateGroup = (group, ctx) => {
  const rules = group?.rules || [];
  if (!rules.length) return { pass: true, results: [] };

  const results = rules.map((r) =>
    r.rules ? { group: true, match: r.match, ...evaluateGroup(r, ctx) } : evaluateOne(r, ctx)
  );

  const pass = group.match === "any"
    ? results.some((r) => r.pass)
    : results.every((r) => r.pass);

  return { pass, results };
};
