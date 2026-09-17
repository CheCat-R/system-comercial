/**
 * ⭐ El escáner de condiciones observadas.
 *
 * Hay hechos que **nadie anuncia** porque no son un cambio sino un estado:
 * "stock bajo", "carrito abandonado", "cliente inactivo". No hay una función que
 * uno llame para que eso ocurra; simplemente en algún momento es cierto. El
 * escáner los detecta recorriendo el estado actual en cada tick (§2.3).
 *
 * ── ⭐ Dispara por FLANCO, no por nivel ───────────────────────────────────
 *
 * "Stock bajo" puede durar semanas. Si la regla se ejecutara en cada tick
 * mientras la condición es verdadera, mandaría cuarenta avisos por el mismo SKU:
 *
 *   stock del SKU-2 →  ok  ok  bajo  bajo  bajo  ok  bajo
 *   dispara         →   ·   ·   ▲     ·     ·    ·   ▲
 *
 * Por eso cada regla mantiene una **marca de agua** con los sujetos que ya están
 * dentro de su condición: sólo se dispara cuando un sujeto **entra**, y la marca
 * se limpia cuando sale (para que pueda volver a disparar más adelante).
 *
 * Es el error más común en los motores de automatización reales, y la razón por
 * la que la gente termina desconfiando de ellos.
 *
 * ⭐ **Los escáneres los declara cada módulo dueño**, no este archivo (ver
 * `registry.js`). Acá vive el mecanismo —el flanco y la marca de agua—, que es
 * lo genérico; qué significa "stock bajo" lo sabe Inventario y nadie más.
 */
import { now } from "./clock";
import { escaner, eventosConEscaner } from "./registry";

const safe = (fn, fallback = []) => { try { return fn(); } catch { return fallback; } };
const hoursSince = (iso) => (iso ? (now().getTime() - new Date(iso).getTime()) / 3_600_000 : null);

/** Lo que recibe cada escáner registrado, para que no reimplemente el reloj. */
export const HELPERS = { safe, hoursSince, now };

export const hasScanner = (eventKey) => Boolean(escaner(eventKey));

export const scannedEvents = () => eventosConEscaner();

/** Sujetos que cumplen ahora la condición de esta regla. */
export const scanMatches = (rule) => {
  const scan = escaner(rule?.trigger?.key);
  if (!scan) return [];
  try {
    return scan(rule.trigger.params || {}, HELPERS) || [];
  } catch {
    return [];
  }
};

/* ------------------------------------------------------ marcas de agua */

/** `ruleId → Set(subjectId)`: quién ya estaba dentro de la condición. */
let _watermarks = new Map();

/**
 * Diferencia contra la marca de agua: devuelve **sólo los que entraron** y
 * actualiza el estado. Los que salieron se limpian para que puedan volver a
 * disparar la próxima vez que entren.
 *
 * @param {boolean} dryRun si es true no toca la marca (lo usa el simulador de F2)
 */
const markOf = (m) => m.key || m.subject.id;

export const risingEdges = (rule, matches, { dryRun = false } = {}) => {
  const previous = _watermarks.get(rule.id) || new Set();
  const current = new Set(matches.map(markOf));

  const entered = matches.filter((m) => !previous.has(markOf(m)));
  const left = [...previous].filter((id) => !current.has(id));

  if (!dryRun) _watermarks.set(rule.id, current);

  return { entered, left, current: [...current], previous: [...previous] };
};

/**
 * Estado de la marca de agua de una regla — el historial lo muestra para
 * explicar por qué una condición verdadera **no** volvió a disparar.
 */
export const watermarkOf = (ruleId) => [...(_watermarks.get(ruleId) || new Set())];

export const clearWatermark = (ruleId) => { _watermarks.delete(ruleId); };

/**
 * Saca **una marca** de la marca de agua, sin borrarla entera.
 *
 * Se recibe la marca (`SKU-5@DEP-01`) y no el id del sujeto (`SKU-5`) porque
 * son cosas distintas: un mismo SKU puede estar bajo mínimo en un depósito y
 * bien en otro. Confundirlas fue justo el bug que hacía que una recurrencia no
 * parara nunca — el depósito repuesto seguía vivo porque el otro seguía corto.
 */
export const forgetMark = (ruleId, mark) => {
  _watermarks.get(ruleId)?.delete(mark);
};

/** La marca de un match: compuesta si el escáner la define, si no el sujeto. */
export const markOfMatch = (m) => m.key || m.subject.id;

export const clearAllWatermarks = () => { _watermarks = new Map(); };
