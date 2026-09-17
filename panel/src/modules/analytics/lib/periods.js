/**
 * Períodos, comparaciones y la frontera historia / dato vivo.
 *
 * Dos reglas que se aplican en todo el módulo:
 *  · Un período que incluye hoy es **parcial**, y se compara contra el **mismo
 *    tramo** del período anterior — no contra el mes entero (§4).
 *  · **No se ofrece comparación interanual**: no hay dos años de datos. Un
 *    selector que siempre devuelve "sin datos" es peor que no tenerlo (§2.8).
 */

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/** Misma fecha de referencia que todos los módulos. */
export const TODAY = startOfDay(new Date(2026, 8, 3)); // 2026-09-03

/**
 * Frontera entre la historia generada por Analytics y los datos vivos de los
 * módulos. **No se solapan nunca** (§1.3): antes de esta fecha manda
 * `data/history.mock.js`; desde acá, `pedidosApi` y compañía.
 */
export const LIVE_START = startOfDay(new Date(2026, 7, 10)); // 2026-08-10

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/* --------------------------------------------------------------- períodos */

export const PERIODS = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "last7", label: "Últimos 7 días" },
  { value: "last14", label: "Últimos 14 días" },
  { value: "last30", label: "Últimos 30 días" },
  { value: "last90", label: "Últimos 90 días" },
  { value: "thisMonth", label: "Este mes" },
  { value: "lastMonth", label: "Mes pasado" },
  { value: "thisQuarter", label: "Este trimestre" },
  { value: "thisYear", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

/**
 * @returns {{from: Date, to: Date, label: string, isPartial: boolean, days: number}}
 */
export const resolvePeriod = (value, options) => {
  // `options` puede llegar `null` explícito, y un valor por defecto de
  // parámetro sólo cubre `undefined`.
  const { from, to } = options || {};
  const build = (a, b, label) => {
    const start = startOfDay(a);
    const end = endOfDay(b);
    return {
      from: start,
      to: end,
      label,
      // Parcial = el período llega hasta hoy y hoy todavía no terminó.
      isPartial: endOfDay(TODAY).getTime() <= end.getTime() && start.getTime() <= TODAY.getTime(),
      days: Math.round((endOfDay(b) - startOfDay(a)) / 86400000) + 1,
    };
  };

  switch (value) {
    case "today": return build(TODAY, TODAY, "Hoy");
    case "yesterday": return build(addDays(TODAY, -1), addDays(TODAY, -1), "Ayer");
    case "last7": return build(addDays(TODAY, -6), TODAY, "Últimos 7 días");
    case "last14": return build(addDays(TODAY, -13), TODAY, "Últimos 14 días");
    case "last30": return build(addDays(TODAY, -29), TODAY, "Últimos 30 días");
    case "last90": return build(addDays(TODAY, -89), TODAY, "Últimos 90 días");
    case "thisMonth":
      return build(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), TODAY, "Este mes");
    case "lastMonth": {
      const first = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
      const last = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0);
      return build(first, last, "Mes pasado");
    }
    case "thisQuarter": {
      const q = Math.floor(TODAY.getMonth() / 3);
      return build(new Date(TODAY.getFullYear(), q * 3, 1), TODAY, "Este trimestre");
    }
    case "thisYear":
      return build(new Date(TODAY.getFullYear(), 0, 1), TODAY, "Este año");
    case "custom":
      if (!from || !to) return resolvePeriod("last30");
      return build(new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`), "Personalizado");
    default:
      return resolvePeriod("last30");
  }
};

/* ----------------------------------------------------------- comparaciones */

export const COMPARISONS = [
  { value: "previous", label: "Período anterior", hint: "Mismo largo, justo antes" },
  { value: "lastMonth", label: "Mismo tramo del mes anterior", hint: "Para estacionalidad de calendario" },
  { value: "target", label: "Contra objetivo", hint: "El valor esperado de cada métrica" },
  { value: "none", label: "Sin comparación" },
];

/**
 * Ventana contra la que se compara. `null` si no aplica (sin comparación, o
 * contra objetivo, que no es una ventana temporal).
 *
 * Si el período es **parcial**, la ventana anterior se recorta al mismo tramo:
 * comparar 3 días contra 30 es la forma más rápida de inventar una caída.
 */
export const resolveComparison = (period, compare) => {
  if (!compare || compare === "none" || compare === "target") return null;

  if (compare === "previous") {
    const to = endOfDay(new Date(period.from.getTime() - 86400000));
    const from = startOfDay(addDays(to, -(period.days - 1)));
    return { from, to, label: `${period.days} días previos` };
  }

  if (compare === "lastMonth") {
    const from = startOfDay(addMonths(period.from, -1));
    const to = endOfDay(addMonths(startOfDay(period.to), -1));
    return { from, to, label: "Mismo tramo del mes anterior" };
  }

  return null;
};

/* ------------------------------------------------------------ granularidad */

/** El grano se ajusta solo al largo del período: 90 días por día es ilegible. */
export const granularityFor = (period) => {
  if (period.days <= 31) return "day";
  if (period.days <= 120) return "week";
  return "month";
};

export const GRANULARITY_LABEL = { day: "por día", week: "por semana", month: "por mes" };

/** Baldes ordenados que cubren el período, para las series temporales. */
export const bucketsOf = (period, granularity = granularityFor(period)) => {
  const out = [];

  if (granularity === "month") {
    let cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
    while (cursor <= period.to) {
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      out.push({
        key: monthKey(cursor),
        label: cursor.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }),
        from: startOfDay(cursor),
        to: endOfDay(end > period.to ? period.to : end),
      });
      cursor = addMonths(cursor, 1);
    }
    return out;
  }

  const step = granularity === "week" ? 7 : 1;
  let cursor = startOfDay(period.from);
  while (cursor <= period.to) {
    const end = addDays(cursor, step - 1);
    out.push({
      key: dayKey(cursor),
      label: granularity === "week"
        ? `${cursor.getDate()}/${cursor.getMonth() + 1}`
        : cursor.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
      from: startOfDay(cursor),
      to: endOfDay(end > period.to ? period.to : end),
    });
    cursor = addDays(cursor, step);
  }
  return out;
};

/* ------------------------------------------------------- historia vs. vivo */

/** Qué parte del período consultado viene de cada origen (§8.5). */
export const describeSources = (period) => {
  const liveFrom = LIVE_START.getTime();
  const hasHistory = period.from.getTime() < liveFrom;
  const hasLive = period.to.getTime() >= liveFrom;

  if (hasHistory && hasLive) {
    return {
      mixed: true, hasHistory, hasLive,
      text: `Hasta el ${LIVE_START.toLocaleDateString("es-AR")} son datos históricos generados; desde ahí, datos vivos de los módulos.`,
    };
  }
  if (hasHistory) {
    return { mixed: false, hasHistory, hasLive, text: "Período cubierto por la historia generada." };
  }
  return { mixed: false, hasHistory, hasLive, text: "Período cubierto por los datos vivos de los módulos." };
};

/** Posición 0..1 de la frontera dentro del período, para dibujarla en la serie. */
export const boundaryRatio = (period) => {
  const span = period.to.getTime() - period.from.getTime();
  if (span <= 0) return null;
  const at = (LIVE_START.getTime() - period.from.getTime()) / span;
  return at > 0 && at < 1 ? at : null;
};

export const inPeriod = (value, period) => {
  if (!value) return false;
  const t = new Date(value).getTime();
  return t >= period.from.getTime() && t <= period.to.getTime();
};
