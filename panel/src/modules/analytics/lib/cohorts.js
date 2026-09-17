/**
 * ⭐ Cohortes, retención y repago del CAC.
 *
 * Una cohorte es el conjunto de cuentas cuya **primera compra** cae en un mes
 * dado. La matriz cruza esa camada contra los meses siguientes: fila = mes de
 * alta, columna = mes+n, celda = qué proporción volvió a comprar (o cuánto
 * lleva dejado por cliente, si se mira el LTV acumulado).
 *
 * ── Las dos reglas que hacen que la matriz no mienta ──────────────────────
 *
 * 1. **Una celda que todavía no ocurrió no vale 0, vale nada.** La cohorte de
 *    junio no tiene mes+6 porque junio+6 está en el futuro. Rellenar eso con
 *    cero es la forma más común de dibujar una caída de retención inexistente:
 *    el triángulo inferior derecho de la matriz queda vacío a propósito.
 *
 * 2. **Sólo entran meses completos.** El último mes con datos es septiembre de
 *    2026 y tiene tres días; agosto arranca el día 10, que es la frontera con
 *    los datos vivos (§1.3). Un mes recortado en una matriz de retención se lee
 *    como un derrumbe, así que la ventana termina en el último mes íntegro.
 *
 * Ver docs/MODULO-ANALYTICS.md §2.3 y §9.3.
 */
import { monthKey, LIVE_START, TODAY } from "./periods";

/* ------------------------------------------------- aritmética de meses */

const pad = (n) => String(n).padStart(2, "0");

/** "2026-07" → 24319. Permite sumar meses sin pelear con `Date`. */
export const monthIndex = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return y * 12 + (m - 1);
};

export const monthFromIndex = (i) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;

export const monthLabel = (i) => {
  const d = new Date(Math.floor(i / 12), i % 12, 1);
  return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
};

/**
 * Último mes **íntegro** que el dataset cubre de punta a punta.
 *
 * `LIVE_START` es el 10 de agosto: agosto está cubierto sólo desde el día 10,
 * así que el último mes entero es julio. Se deriva de la frontera en vez de
 * escribirse a mano para que siga siendo cierto si la frontera se mueve.
 */
export const lastCompleteMonth = () => {
  const boundary = monthIndex(monthKey(LIVE_START));
  // El mes de la frontera tiene un hueco — del 1 al 9 no hay ni historia ni dato
  // vivo — salvo que la frontera caiga justo el día 1.
  const covered = LIVE_START.getDate() === 1 ? boundary : boundary - 1;
  // Y en ningún caso puede ser el mes en curso, que todavía no terminó.
  return Math.min(covered, monthIndex(monthKey(TODAY)) - 1);
};

/* ----------------------------------------------------------- la matriz */

/**
 * Construye la matriz.
 *
 * @param {object} universe  `{ orders, firstOrderAt }` — el universo completo,
 *                           no el período consultado: una cohorte se sigue por
 *                           meses, no por la ventana que mira el usuario.
 * @param {number} horizon   cuántos meses de seguimiento como máximo.
 */
export const buildCohorts = (universe, { horizon = 12 } = {}) => {
  const { orders = [], firstOrderAt = new Map() } = universe;
  const last = lastCompleteMonth();

  // --- cohorte de cada cuenta ---
  const cohortOf = new Map();
  firstOrderAt.forEach((date, accountId) => {
    cohortOf.set(accountId, monthIndex(monthKey(date)));
  });

  // --- actividad (cuenta × mes) → ingreso neto de ese mes ---
  const activity = new Map();
  orders.forEach((o) => {
    if (o.returned) return;
    const mi = monthIndex(o.month);
    if (mi > last) return;
    const key = `${o.accountId}|${mi}`;
    activity.set(key, (activity.get(key) || 0) + o.revenueNet);
  });

  // --- miembros por cohorte, descartando las camadas de meses incompletos ---
  const members = new Map();
  cohortOf.forEach((mi, accountId) => {
    if (mi > last) return;
    if (!members.has(mi)) members.set(mi, []);
    members.get(mi).push(accountId);
  });

  const cohortIndexes = [...members.keys()].sort((a, b) => a - b);
  if (!cohortIndexes.length) {
    return { rows: [], offsets: [], lastCompleteMonth: last, horizon, totalAccounts: 0 };
  }

  const maxOffset = Math.min(horizon, last - cohortIndexes[0]);
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  const rows = cohortIndexes.map((ci) => {
    const accounts = members.get(ci);
    const size = accounts.length;
    let cumRevenue = 0;

    const cells = offsets.map((offset) => {
      const mi = ci + offset;

      // Regla 1: lo que todavía no pasó no es un cero.
      if (mi > last) return { offset, mature: false };

      let active = 0;
      let revenue = 0;
      accounts.forEach((a) => {
        const v = activity.get(`${a}|${mi}`);
        if (v !== undefined) { active += 1; revenue += v; }
      });
      cumRevenue += revenue;

      return {
        offset,
        mature: true,
        month: mi,
        active,
        retention: size ? active / size : null,
        revenue,
        cumRevenue,
        cumPerCustomer: size ? cumRevenue / size : null,
      };
    });

    return {
      key: monthFromIndex(ci),
      index: ci,
      label: monthLabel(ci),
      size,
      cells,
    };
  });

  return {
    rows,
    offsets,
    lastCompleteMonth: last,
    lastCompleteLabel: monthLabel(last),
    horizon,
    totalAccounts: rows.reduce((s, r) => s + r.size, 0),
  };
};

/* ------------------------------------------------------------ la curva */

/**
 * Curva agregada de retención.
 *
 * Se pondera por tamaño de cohorte (`Σ activos / Σ miembros`), **no** es el
 * promedio de los porcentajes: una cohorte de 3 clientes no puede pesar lo
 * mismo que una de 20. Y cada punto sólo suma las cohortes que ya llegaron a
 * ese mes, así que `cohorts` cae a medida que avanza el eje — por eso se
 * informa junto al valor.
 */
export const retentionCurve = (matrix) =>
  matrix.offsets.map((offset) => {
    let active = 0;
    let size = 0;
    let cohorts = 0;

    matrix.rows.forEach((r) => {
      const cell = r.cells[offset];
      if (!cell?.mature) return;
      active += cell.active;
      size += r.size;
      cohorts += 1;
    });

    return {
      offset,
      label: `mes ${offset}`,
      cohorts,
      accounts: size,
      value: size ? active / size : null,
    };
  });

/**
 * Curva de **ingreso neto acumulado por cliente**, con el mismo criterio de
 * madurez que la retención. Es la que se compara contra el CAC.
 */
export const ltvCurve = (matrix) =>
  matrix.offsets.map((offset) => {
    let cum = 0;
    let size = 0;
    let cohorts = 0;

    matrix.rows.forEach((r) => {
      const cell = r.cells[offset];
      if (!cell?.mature) return;
      cum += cell.cumRevenue;
      size += r.size;
      cohorts += 1;
    });

    return {
      offset,
      label: `mes ${offset}`,
      cohorts,
      accounts: size,
      value: size ? cum / size : null,
    };
  });

/**
 * Meses hasta recuperar el CAC.
 *
 * Compara contra el **margen** acumulado por cliente, no contra el ingreso: el
 * CAC se paga con lo que queda después del costo de la mercadería, no con la
 * facturación. Devuelve `null` cuando la curva no llega al CAC dentro del
 * horizonte — que es un resultado, no un error, y la UI lo dice así.
 */
export const paybackMonths = (curve, cac, marginPct) => {
  if (!cac || marginPct == null) return { months: null, reason: "Sin CAC o sin margen no hay repago que calcular." };

  const hit = curve.find((p) => p.value != null && p.value * marginPct >= cac);
  if (hit) {
    return {
      months: hit.offset,
      reason: null,
      atValue: hit.value * marginPct,
      cohorts: hit.cohorts,
    };
  }

  const lastPoint = [...curve].reverse().find((p) => p.value != null);
  return {
    months: null,
    reason: `A los ${lastPoint?.offset ?? 0} meses el margen acumulado por cliente todavía no llega al CAC.`,
    atValue: lastPoint ? lastPoint.value * marginPct : null,
    cohorts: lastPoint?.cohorts ?? 0,
  };
};

/** El aviso fijo de la pantalla: hasta dónde llega la ventana y por qué (§9.3). */
export const describeCohortWindow = (matrix) => ({
  text:
    `La matriz llega hasta ${matrix.lastCompleteLabel} y no más: agosto de 2026 arranca el ` +
    `${LIVE_START.toLocaleDateString("es-AR")} — la frontera con los datos vivos — y septiembre ` +
    `todavía no terminó. Un mes recortado en una matriz de retención se lee como una caída que ` +
    `no ocurrió.`,
  cohorts: matrix.rows.length,
  accounts: matrix.totalAccounts,
});
