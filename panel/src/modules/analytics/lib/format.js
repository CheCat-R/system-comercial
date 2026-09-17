/**
 * Formato de valores de Analytics.
 *
 * Una regla que vale para todo el módulo: **un porcentaje con denominador 0 se
 * muestra "—", nunca 0 % ni ∞** (regla §8.9). Un cero inventado es peor que un
 * hueco honesto: el cero se compara, se promedia y termina en una decisión.
 */

export const UNITS = ["money", "integer", "decimal", "percent", "ratio", "days", "hours"];

/** `null` / `undefined` / `NaN` / `Infinity` → sin dato. */
export const isBlank = (v) => v == null || (typeof v === "number" && !Number.isFinite(v));

export const money = (n) =>
  isBlank(n) ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-AR")}`;

export const integer = (n) => (isBlank(n) ? "—" : Math.round(n).toLocaleString("es-AR"));

export const decimal = (n, digits = 1) =>
  isBlank(n) ? "—" : n.toFixed(digits).replace(".", ",");

/** Recibe una **proporción** (0.153), muestra "15,3 %". */
export const percent = (ratio, digits = 1) =>
  isBlank(ratio) ? "—" : `${(ratio * 100).toFixed(digits).replace(".", ",")} %`;

export const ratio = (n, digits = 1) => (isBlank(n) ? "—" : `${decimal(n, digits)}×`);

export const days = (n, digits = 1) => (isBlank(n) ? "—" : `${decimal(n, digits)} d`);

export const hours = (n, digits = 1) => (isBlank(n) ? "—" : `${decimal(n, digits)} h`);

const FORMATTERS = { money, integer, decimal, percent, ratio, days, hours };

export const formatValue = (value, unit = "integer") =>
  (FORMATTERS[unit] || integer)(value);

/**
 * Delta entre el valor actual y el de referencia.
 * `pct` es `null` cuando la base es 0: no existe "creció infinito".
 */
export const computeDelta = (current, previous) => {
  if (isBlank(current) || isBlank(previous)) return null;
  const abs = current - previous;
  return {
    abs,
    pct: previous === 0 ? null : abs / Math.abs(previous),
    direction: abs > 0 ? "up" : abs < 0 ? "down" : "flat",
  };
};

/** Para una métrica donde bajar es bueno (devoluciones, incidencias, CAC). */
export const deltaTone = (delta, higherIsBetter = true) => {
  if (!delta || delta.direction === "flat") return "neutral";
  const good = delta.direction === "up" ? higherIsBetter : !higherIsBetter;
  return good ? "success" : "danger";
};

export const formatDelta = (delta, unit) => {
  if (!delta) return "—";
  const sign = delta.abs > 0 ? "+" : "";
  const absText = `${sign}${formatValue(delta.abs, unit)}`;
  if (delta.pct === null) return absText;
  return `${absText} (${sign}${percent(delta.pct)})`;
};

/** Divisiones seguras: sin denominador no hay número. */
export const safeDiv = (a, b) => (!b ? null : a / b);
