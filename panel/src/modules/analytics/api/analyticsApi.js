/**
 * Única puerta de Analytics.
 *
 * **Es el único módulo del panel que no escribe en ninguno** (§7): sólo lee las
 * `api/` de los demás y devuelve números. Si un valor no coincide con su módulo
 * de origen, el bug es de acá.
 *
 * Imports, todos de lectura y unidireccionales:
 *   analyticsApi → pedidosApi · financeApi · clientsApi · catalogApi
 *                · logisticaApi · inventoryApi · marketingApi
 */
import { buildFacts } from "../lib/facts";
import {
  METRICS, AREAS, getMetric, listMetrics, assertContracts, sampleOf, dimensionRejection,
} from "../lib/metrics";
import { groupFacts, listDimensions, getDimension } from "../lib/dimensions";
import {
  resolvePeriod, resolveComparison, describeSources, boundaryRatio,
  granularityFor, GRANULARITY_LABEL, PERIODS, COMPARISONS, TODAY, LIVE_START,
} from "../lib/periods";
import {
  buildCohorts, retentionCurve, ltvCurve, paybackMonths, describeCohortWindow,
  monthFromIndex,
} from "../lib/cohorts";
import { computeDelta, formatValue } from "../lib/format";
import { targets as seedTargets } from "../data/targets.mock";
import { reports as seedReports } from "../data/reports.mock";
import { alerts as seedAlerts } from "../data/alerts.mock";
import { dashboards as seedDashboards } from "../data/dashboards.mock";

import { listCategories, listBrands, listProducts } from "../../productos/api/catalogApi";
import { listZones } from "../../logistica/api/logisticaApi";
import { listWarehouses } from "../../inventario/api/inventoryApi";
import { can } from "../../seguridad/lib/roles";
import { currentActor } from "../../seguridad/lib/audit";

/* --------------------------------------------------------- contratos */

/**
 * Se verifica una vez al cargar el módulo. Una métrica sin contrato completo no
 * llega a producción (regla §8.1).
 */
const brokenContracts = assertContracts();
if (brokenContracts.length && import.meta.env?.DEV) {
  console.error("[analytics] métricas sin contrato completo:", brokenContracts);
}

export { METRICS, AREAS, PERIODS, COMPARISONS, TODAY, LIVE_START };
export { listMetrics, getMetric, listDimensions, getDimension, dimensionRejection };

export const getBrokenContracts = () => brokenContracts;

/* ------------------------------------------------------------ permisos */

/**
 * ⭐ Delegados al catálogo central (`seguridad/lib/permissions.js`).
 *
 * Antes esto era `/admin|direcci/i` acá, otra igual en Automatizaciones y otra
 * en Integraciones: tres archivos decidiendo lo mismo por separado. La regla del
 * módulo no cambió —**el motor no calcula una métrica sensible sin permiso, no
 * la tapa**— pero ahora quién puede se decide en un solo lugar.
 *
 * Se importa la hoja `lib/roles.js`, no el `api/` de Seguridad: un `api/` que
 * importa otro `api/` transversal es un ciclo esperando.
 */

/** Márgenes, costos y CAC sólo para Admin y Dirección (§10). */
export const canSeeSensitive = (role = "") => can(role, "analytics.sensibles");

/** Cohortes y LTV suman Marketing (§10). Ventas y el resto, no. */
export const canSeeCohorts = (role = "") => can(role, "analytics.cohortes");

/** Definir objetivos y alertas es de Admin y Dirección (§10). */
export const canEditTargets = (role = "") => can(role, "analytics.objetivos");

const guard = (metric, role) => {
  if (metric.sensitive && !canSeeSensitive(role)) return false;
  return true;
};

/* -------------------------------------------------------------- cálculo */

const evaluate = (metric, facts) => {
  try {
    const value = metric.compute(facts);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

let _targets = { ...seedTargets };
const targetFor = (metricKey) => (_targets[metricKey] == null ? null : _targets[metricKey]);

/**
 * Una métrica en un período, con su comparación, su `n` y su contrato.
 * Es lo que consume `MetricCard`.
 */
const measure = (metricKey, { facts, compareFacts, compare, role }) => {
  const metric = getMetric(metricKey);
  if (!metric) return null;
  if (!guard(metric, role)) {
    return { key: metricKey, restricted: true, label: metric.label, unit: metric.unit };
  }

  const value = evaluate(metric, facts);
  const sample = sampleOf(metric, facts);

  let reference = null;
  let referenceLabel = null;
  if (compare === "target") {
    reference = targetFor(metricKey);
    referenceLabel = "Objetivo";
  } else if (compareFacts) {
    reference = evaluate(metric, compareFacts);
    referenceLabel = compareFacts.period.label;
  }

  return {
    key: metricKey,
    metric,
    label: metric.label,
    unit: metric.unit,
    value,
    sample,
    lowSample: sample < (metric.minSample || 0),
    minSample: metric.minSample || 0,
    reference,
    referenceLabel,
    delta: reference == null ? null : computeDelta(value, reference),
    higherIsBetter: metric.higherIsBetter !== false,
  };
};

/* ---------------------------------------------------------------- query */

/**
 * El motor. Una consulta = métricas × dimensión × período × comparación × filtros.
 *
 * @param {object} q
 * @param {string[]} q.metrics   claves del diccionario
 * @param {string}   q.dimension clave de dimensión, o null para el total
 * @param {string}   q.period    clave de período
 * @param {object}   q.range     { from, to } si el período es "custom"
 * @param {string}   q.compare   previous | lastMonth | target | none
 * @param {object}   q.filters   §5
 * @param {string}   q.role      para el guardado de métricas sensibles
 */
export const query = ({
  metrics = ["revenue_net"], dimension = null, period = "last30",
  range, compare = "previous", filters = {}, role = "",
} = {}) => {
  const resolved = resolvePeriod(period, range);
  const comparison = resolveComparison(resolved, compare);

  const facts = buildFacts(resolved, filters);
  const compareFacts = comparison
    ? buildFacts({ ...comparison, days: resolved.days, isPartial: false }, filters)
    : null;

  const totals = metrics
    .map((key) => measure(key, { facts, compareFacts, compare, role }))
    .filter(Boolean);

  let rows = [];
  if (dimension) {
    const groups = groupFacts(facts, dimension);
    const compareGroups = compareFacts ? groupFacts(compareFacts, dimension) : [];
    const compareByKey = new Map(compareGroups.map((g) => [g.key, g]));

    rows = groups.map((g) => ({
      key: g.key,
      label: g.label,
      values: metrics
        .map((key) => measure(key, {
          facts: g.facts,
          compareFacts: compareByKey.get(g.key)?.facts || null,
          compare,
          role,
        }))
        .filter(Boolean),
    }));

    // Las series de tiempo van en orden cronológico; el resto, por valor.
    if (dimension !== "tiempo") {
      rows.sort((a, b) => (b.values[0]?.value ?? -Infinity) - (a.values[0]?.value ?? -Infinity));
    }
  }

  return {
    period: resolved,
    comparison,
    dimension: dimension ? getDimension(dimension) : null,
    granularity: granularityFor(resolved),
    granularityLabel: GRANULARITY_LABEL[granularityFor(resolved)],
    sources: describeSources(resolved),
    boundary: boundaryRatio(resolved),
    totals,
    rows,
    sampleOrders: facts.orders.length,
  };
};

/* -------------------------------------------------------------- resumen */

/** Los seis KPIs del Resumen ejecutivo (§9.1). */
export const SUMMARY_METRICS = [
  "revenue_net", "orders_paid", "aov",
  "contribution_margin_pct", "customers_new", "return_rate",
];

export const getSummary = ({ period = "last30", range, compare = "previous", role = "" } = {}) => {
  const kpis = query({ metrics: SUMMARY_METRICS, period, range, compare, role });
  const series = query({ metrics: ["revenue_net", "orders_paid"], dimension: "tiempo", period, range, compare, role });
  const byProduct = query({ metrics: ["revenue_net", "units_sold"], dimension: "producto", period, range, compare: "none", role });
  const byCategory = query({ metrics: ["revenue_net"], dimension: "categoria", period, range, compare: "none", role });
  const byChannel = query({ metrics: ["revenue_net", "orders_paid"], dimension: "canal", period, range, compare: "none", role });

  return {
    period: kpis.period,
    comparison: kpis.comparison,
    sources: kpis.sources,
    boundary: kpis.boundary,
    granularityLabel: kpis.granularityLabel,
    kpis: kpis.totals,
    series: series.rows,
    topProducts: byProduct.rows.slice(0, 6),
    byCategory: byCategory.rows,
    byChannel: byChannel.rows,
    attention: buildAttention(kpis.totals, role),
  };
};

/**
 * "Qué mirar" — el panel del Resumen (§9.1).
 *
 * Tres fuentes, en ese orden de importancia: las **alertas de umbral** que se
 * dispararon, los **objetivos** que no se están cumpliendo y las métricas
 * **sin muestra suficiente**. Una métrica que ya tiene alerta no vuelve a
 * aparecer por objetivo: repetir el mismo problema con dos redacciones
 * distintas es la forma más rápida de que nadie lea el panel.
 */
function buildAttention(kpis, role) {
  const out = [];
  const alerted = new Set();

  evaluateAlerts({ role })
    .filter((a) => a.triggered)
    .forEach((a) => {
      alerted.add(a.alert.metricKey);
      out.push({
        level: "error",
        metricKey: a.alert.metricKey,
        message: `${a.label}: ${formatValue(a.value, a.unit)} ${a.alert.operator === "lt" ? "por debajo de" : "por encima de"} ${formatValue(a.alert.threshold, a.unit)} (${a.periodLabel}).`,
        detail: a.alert.note,
      });
    });

  kpis.forEach((k) => {
    if (k.restricted) return;
    const target = targetFor(k.key);
    if (target != null && k.value != null && !alerted.has(k.key)) {
      const missed = k.higherIsBetter ? k.value < target : k.value > target;
      if (missed) {
        out.push({
          level: "warning",
          metricKey: k.key,
          message: `${k.label} está ${k.higherIsBetter ? "por debajo" : "por encima"} del objetivo (${formatValue(k.value, k.unit)} contra ${formatValue(target, k.unit)}).`,
        });
      }
    }
    if (k.lowSample) {
      out.push({
        level: "info",
        metricKey: k.key,
        message: `${k.label} se apoya en ${k.sample} caso(s): por debajo de los ${k.minSample} que necesita para ser estable.`,
      });
    }
  });

  if (!canSeeSensitive(role)) {
    out.push({
      level: "info",
      metricKey: null,
      message: "Tu rol no ve márgenes, costos ni CAC. El motor directamente no los calcula.",
    });
  }

  return out;
}

/* ------------------------------------------------------------- cohortes */

/**
 * Cohortes, retención y repago del CAC (§9.3).
 *
 * La matriz **no depende del período** que el usuario tenga elegido: una
 * cohorte se sigue por meses desde su alta, y recortarla a "los últimos 30
 * días" no significa nada. La ventana la fija el dato, no el selector.
 */
export const getCohorts = ({ role = "" } = {}) => {
  if (!canSeeCohorts(role)) {
    return { restricted: true, reason: "Cohortes y LTV los ven Admin, Dirección y Marketing." };
  }

  // `context.allOrders` es el universo completo, no el período: se puede pedir
  // con cualquier ventana.
  const base = buildFacts(resolvePeriod("last30"), {});
  const matrix = buildCohorts({
    orders: base.context.allOrders,
    firstOrderAt: base.context.firstOrderAt,
  });

  if (!matrix.rows.length) {
    return { restricted: false, matrix, window: null, curve: [], ltv: [], card: [], payback: null };
  }

  // Ventana que cubre la matriz: del primer mes de alta al último mes íntegro.
  const firstIdx = matrix.rows[0].index;
  const lastIdx = matrix.lastCompleteMonth;
  const lastDay = new Date(Math.floor(lastIdx / 12), (lastIdx % 12) + 1, 0);
  const windowPeriod = resolvePeriod("custom", {
    from: `${monthFromIndex(firstIdx)}-01`,
    to: `${monthFromIndex(lastIdx)}-${String(lastDay.getDate()).padStart(2, "0")}`,
  });
  const windowFacts = buildFacts(windowPeriod, {});

  const card = ["ltv_avg", "ltv_margin", "cac", "ltv_cac_ratio", "repeat_rate"]
    .map((key) => measure(key, { facts: windowFacts, compareFacts: null, compare: "none", role }))
    .filter(Boolean);

  const cacMeasure = card.find((c) => c.key === "cac");
  const marginPct = canSeeSensitive(role) ? getMetric("contribution_margin_pct").compute(windowFacts) : null;
  const curveLtv = ltvCurve(matrix);

  return {
    restricted: false,
    matrix,
    window: { ...windowPeriod, label: `${matrix.rows[0].label} → ${matrix.lastCompleteLabel}` },
    note: describeCohortWindow(matrix),
    curve: retentionCurve(matrix),
    ltv: curveLtv,
    card,
    marginPct,
    payback: cacMeasure?.restricted
      ? { restricted: true }
      : paybackMonths(curveLtv, cacMeasure?.value, marginPct),
  };
};

/* -------------------------------------------------------------- objetivos */

export const getTargets = () => ({ ..._targets });
export const getTarget = (metricKey) => targetFor(metricKey);

/**
 * Fija el objetivo de una métrica. `null` lo borra — y borrarlo es una opción
 * real: un objetivo inventado alimenta el panel "Qué mirar" con avisos que
 * nadie decidió.
 */
export const setTarget = (metricKey, value, { role = "" } = {}) => {
  if (!canEditTargets(role)) return { ok: false, error: "Sólo Admin y Dirección definen objetivos." };
  if (!getMetric(metricKey)) return { ok: false, error: "Esa métrica no existe en el diccionario." };

  if (value == null || value === "") {
    const next = { ..._targets };
    delete next[metricKey];
    _targets = next;
    return { ok: true, value: null };
  }

  const num = Number(value);
  if (!Number.isFinite(num)) return { ok: false, error: "El objetivo tiene que ser un número." };
  _targets = { ..._targets, [metricKey]: num };
  return { ok: true, value: num };
};

/* --------------------------------------------------------------- alertas */

let _alerts = JSON.parse(JSON.stringify(seedAlerts));
let _alertSeq = _alerts.length;

export const OPERATORS = [
  { value: "lt", label: "está por debajo de", hint: "Se dispara cuando el valor cae bajo el umbral" },
  { value: "gt", label: "está por encima de", hint: "Se dispara cuando el valor supera el umbral" },
];

const enrichAlert = (a) => {
  const metric = getMetric(a.metricKey);
  return {
    ...a,
    metric,
    label: metric?.label || a.metricKey,
    unit: metric?.unit || "integer",
    periodLabel: PERIODS.find((p) => p.value === a.period)?.label || a.period,
    operatorLabel: OPERATORS.find((o) => o.value === a.operator)?.label || a.operator,
  };
};

export const listAlerts = () => _alerts.map(enrichAlert);

export const saveAlert = (data, { role = "" } = {}) => {
  if (!canEditTargets(role)) return { ok: false, error: "Sólo Admin y Dirección definen alertas." };
  if (!getMetric(data.metricKey)) return { ok: false, error: "Esa métrica no existe en el diccionario." };
  const threshold = Number(data.threshold);
  if (!Number.isFinite(threshold)) return { ok: false, error: "El umbral tiene que ser un número." };

  if (data.id) {
    _alerts = _alerts.map((a) => (a.id === data.id ? { ...a, ...data, threshold } : a));
    return { ok: true, alert: enrichAlert(_alerts.find((a) => a.id === data.id)) };
  }

  const alert = {
    id: `AL-${String(++_alertSeq).padStart(2, "0")}`,
    metricKey: data.metricKey,
    operator: data.operator || "lt",
    threshold,
    period: data.period || "last30",
    enabled: data.enabled !== false,
    note: data.note || "",
  };
  _alerts = [..._alerts, alert];
  return { ok: true, alert: enrichAlert(alert) };
};

export const toggleAlert = (id, { role = "" } = {}) => {
  if (!canEditTargets(role)) return { ok: false, error: "Sólo Admin y Dirección definen alertas." };
  _alerts = _alerts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
  return { ok: true };
};

export const deleteAlert = (id, { role = "" } = {}) => {
  if (!canEditTargets(role)) return { ok: false, error: "Sólo Admin y Dirección definen alertas." };
  _alerts = _alerts.filter((a) => a.id !== id);
  return { ok: true };
};

/**
 * Evalúa las alertas encendidas.
 *
 * Se agrupan **por período** para no reconstruir la tabla de hechos una vez por
 * alerta: cinco alertas sobre "últimos 30 días" son una sola consulta.
 *
 * Una alerta sobre una métrica que el rol no puede ver **no se dispara ni se
 * calcula**: el motor devuelve `restricted` y la fila lo dice. Filtrar el
 * resultado después sería seguir calculando lo que no corresponde (§10).
 */
export const evaluateAlerts = ({ role = "", onlyEnabled = true } = {}) => {
  const list = (onlyEnabled ? _alerts.filter((a) => a.enabled) : _alerts).map(enrichAlert);
  if (!list.length) return [];

  const byPeriod = new Map();
  list.forEach((a) => {
    if (!byPeriod.has(a.period)) byPeriod.set(a.period, []);
    byPeriod.get(a.period).push(a);
  });

  const out = [];
  byPeriod.forEach((group, period) => {
    const result = query({
      metrics: [...new Set(group.map((a) => a.metricKey))],
      dimension: null, period, compare: "none", role,
    });

    group.forEach((alert) => {
      const m = result.totals.find((t) => t.key === alert.metricKey);

      if (!m || m.restricted) {
        out.push({ alert, label: alert.label, unit: alert.unit, periodLabel: alert.periodLabel, restricted: true, triggered: false });
        return;
      }

      const triggered = m.value != null
        && (alert.operator === "lt" ? m.value < alert.threshold : m.value > alert.threshold);

      out.push({
        alert,
        label: alert.label,
        unit: alert.unit,
        periodLabel: alert.periodLabel,
        value: m.value,
        sample: m.sample,
        lowSample: m.lowSample,
        restricted: false,
        triggered,
      });
    });
  });

  return out;
};

/* ------------------------------------------------------------ dashboards */

let _dashboards = JSON.parse(JSON.stringify(seedDashboards));
let _dashSeq = _dashboards.length;
let _widgetSeq = 100;

export const WIDGET_TYPES = [
  { value: "kpi", label: "KPI", hint: "Un número con su delta y su ficha", size: 1 },
  { value: "line", label: "Línea", hint: "Serie temporal: exige cortar por tiempo", size: 2 },
  { value: "bar", label: "Barras", hint: "Ranking: exige un corte que no sea tiempo", size: 1 },
  { value: "table", label: "Tabla", hint: "El corte completo, con totales", size: 3 },
  { value: "cohort", label: "Cohortes", hint: "La matriz de retención, sin período propio", size: 3 },
];

const enrichWidget = (w) => ({
  ...w,
  typeLabel: WIDGET_TYPES.find((t) => t.value === w.type)?.label || w.type,
  metricLabels: (w.query?.metrics || []).map((k) => getMetric(k)?.label || k),
});

const enrichDashboard = (d) => ({
  ...d,
  widgets: d.widgets.map(enrichWidget),
  widgetCount: d.widgets.length,
});

export const listDashboards = () => _dashboards.map(enrichDashboard);

export const getDashboard = (id) => {
  const d = _dashboards.find((x) => x.id === id);
  return d ? enrichDashboard(d) : null;
};

export const getDefaultDashboard = () => {
  const d = _dashboards.find((x) => x.isDefault) || _dashboards[0];
  return d ? enrichDashboard(d) : null;
};

export const createDashboard = (data = {}) => {
  const dashboard = {
    id: `DB-${String(++_dashSeq).padStart(2, "0")}`,
    name: data.name?.trim() || "Dashboard sin nombre",
    description: data.description || "",
    isDefault: false,
    system: false,
    // El autor sale del actor en contexto, no del literal "Vos".
    createdBy: data.createdBy || currentActor()?.name || "Sistema",
    createdAt: new Date().toISOString(),
    widgets: data.widgets ? JSON.parse(JSON.stringify(data.widgets)) : [],
  };
  _dashboards = [..._dashboards, dashboard];
  return enrichDashboard(dashboard);
};

export const updateDashboard = (id, data) => {
  _dashboards = _dashboards.map((d) => (d.id === id ? { ...d, ...data } : d));
  return getDashboard(id);
};

/** Uno solo por vez: el default es el que abre `/analytics/dashboards`. */
export const setDefaultDashboard = (id) => {
  _dashboards = _dashboards.map((d) => ({ ...d, isDefault: d.id === id }));
  return getDashboard(id);
};

export const deleteDashboard = (id) => {
  const d = _dashboards.find((x) => x.id === id);
  if (!d) return { ok: false, error: "El dashboard no existe." };
  if (d.system) return { ok: false, error: "Los dashboards de fábrica no se eliminan. Duplicalos y editá la copia." };
  _dashboards = _dashboards.filter((x) => x.id !== id);
  if (d.isDefault && _dashboards.length) _dashboards[0] = { ..._dashboards[0], isDefault: true };
  return { ok: true };
};

export const duplicateDashboard = (id) => {
  const d = _dashboards.find((x) => x.id === id);
  if (!d) return null;
  return createDashboard({ name: `${d.name} (copia)`, description: d.description, widgets: d.widgets });
};

/* ---------------------------------------------------------------- widgets */

const mutateWidgets = (dashboardId, fn) => {
  _dashboards = _dashboards.map((d) => (d.id === dashboardId ? { ...d, widgets: fn(d.widgets) } : d));
  return getDashboard(dashboardId);
};

export const addWidget = (dashboardId, { type = "kpi", title, query: q, size } = {}) => {
  const widget = {
    id: `W-${++_widgetSeq}`,
    type,
    size: size || WIDGET_TYPES.find((t) => t.value === type)?.size || 1,
    title: title || getMetric(q?.metrics?.[0])?.label || "Widget",
    query: JSON.parse(JSON.stringify(q || { metrics: ["revenue_net"], dimension: null, period: "last30", compare: "previous", filters: {} })),
  };
  return mutateWidgets(dashboardId, (ws) => [...ws, widget]);
};

/** Desde un reporte guardado: el widget hereda su consulta y su forma. */
export const addWidgetFromReport = (dashboardId, reportId) => {
  const report = getReport(reportId);
  if (!report) return null;
  const type = report.view === "table" ? "table" : report.view;
  return addWidget(dashboardId, { type, title: report.name, query: report.query });
};

export const updateWidget = (dashboardId, widgetId, patch) =>
  mutateWidgets(dashboardId, (ws) => ws.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)));

export const removeWidget = (dashboardId, widgetId) =>
  mutateWidgets(dashboardId, (ws) => ws.filter((w) => w.id !== widgetId));

/**
 * Reordenar con flechas, no arrastrando (§9.5): predecible y accesible con
 * teclado, igual que el outline del Store Builder.
 */
export const moveWidget = (dashboardId, widgetId, delta) =>
  mutateWidgets(dashboardId, (ws) => {
    const i = ws.findIndex((w) => w.id === widgetId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ws.length) return ws;
    const next = [...ws];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

/**
 * Ejecuta un widget. Un widget **es una consulta con forma**: pasa por el mismo
 * `query()` que el Explorador, así que nunca puede mostrar otro número.
 */
export const runWidget = (widget, { role = "" } = {}) => {
  if (widget.type === "cohort") return { type: "cohort", cohorts: getCohorts({ role }) };
  return { type: widget.type, result: query({ ...widget.query, role }) };
};

/* --------------------------------------------------- opciones de filtro */

/**
 * Valores posibles de cada filtro (§5). Salen de los módulos dueños de cada
 * taxonomía: Analytics no inventa listas.
 */
export const getFilterOptions = () => {
  const safe = (fn, fallback = []) => { try { return fn(); } catch { return fallback; } };

  return {
    categoryId: safe(listCategories).map((c) => ({ value: c.id, label: c.name })),
    brandId: safe(listBrands).map((b) => ({ value: b.id, label: b.name })),
    skuId: safe(() => listProducts({ onlyPublished: true })).map((p) => ({ value: p.sku, label: p.name })),
    zone: safe(listZones).map((z) => ({ value: z.name, label: z.name })),
    warehouseId: safe(listWarehouses).map((w) => ({ value: w.id, label: w.name })),
    channel: [
      { value: "Tienda web", label: "Tienda web" },
      { value: "Mayorista B2B", label: "Mayorista B2B" },
    ],
    accountType: [
      { value: "person", label: "Persona" },
      { value: "company", label: "Empresa" },
    ],
    paymentMethod: [
      { value: "MercadoPago", label: "MercadoPago" },
      { value: "Transferencia", label: "Transferencia bancaria" },
    ],
    discount: [
      { value: "with", label: "Con descuento" },
      { value: "without", label: "Sin descuento" },
      { value: "coupon", label: "Con cupón" },
    ],
  };
};

/** Cómo se llama cada filtro en la barra de chips. */
export const FILTER_LABELS = {
  categoryId: "Categoría",
  brandId: "Marca",
  skuId: "Producto",
  zone: "Zona",
  warehouseId: "Depósito",
  channel: "Canal",
  accountType: "Tipo de cuenta",
  paymentMethod: "Medio de pago",
  discount: "Descuento",
  minTicket: "Ticket mínimo",
  maxTicket: "Ticket máximo",
};

/* ---------------------------------------------------------------- reportes */

let _reports = JSON.parse(JSON.stringify(seedReports));
let _seq = _reports.length;

export const VIEWS = [
  { value: "table", label: "Tabla" },
  { value: "bar", label: "Barras" },
  { value: "line", label: "Línea" },
];

const enrichReport = (r) => ({
  ...r,
  metricLabels: r.query.metrics.map((k) => getMetric(k)?.label || k).filter(Boolean),
  dimensionLabel: r.query.dimension ? getDimension(r.query.dimension)?.label : "Total del período",
  periodLabel: PERIODS.find((p) => p.value === r.query.period)?.label || r.query.period,
  filterCount: Object.values(r.query.filters || {}).filter((v) => v != null && (!Array.isArray(v) || v.length)).length,
});

export const listReports = ({ search } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _reports
    .map(enrichReport)
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    .sort((a, b) => Number(b.system) - Number(a.system) || new Date(b.createdAt) - new Date(a.createdAt));
};

export const getReport = (id) => {
  const r = _reports.find((x) => x.id === id);
  return r ? enrichReport(r) : null;
};

export const createReport = (data = {}) => {
  const report = {
    id: `RP-${String(++_seq).padStart(2, "0")}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
    system: false,
    name: data.name?.trim() || "Reporte sin nombre",
    description: data.description || "",
    view: data.view || "table",
    query: JSON.parse(JSON.stringify(data.query || {})),
    createdBy: data.createdBy || currentActor()?.name || "Sistema",
    createdAt: new Date().toISOString(),
  };
  _reports = [..._reports, report];
  return enrichReport(report);
};

export const updateReport = (id, data) => {
  _reports = _reports.map((r) => (r.id === id ? { ...r, ...data } : r));
  return getReport(id);
};

export const duplicateReport = (id) => {
  const r = _reports.find((x) => x.id === id);
  if (!r) return null;
  return createReport({ ...JSON.parse(JSON.stringify(r)), name: `${r.name} (copia)`, system: false });
};

/** Los de fábrica no se borran: son la puerta de entrada al módulo. */
export const deleteReport = (id) => {
  const r = _reports.find((x) => x.id === id);
  if (!r) return { ok: false, error: "El reporte no existe." };
  if (r.system) return { ok: false, error: "Los reportes de fábrica no se eliminan. Duplicalo y editá la copia." };
  _reports = _reports.filter((x) => x.id !== id);
  return { ok: true };
};

/** Ejecuta un reporte guardado. */
export const runReport = (id, { role = "" } = {}) => {
  const report = getReport(id);
  if (!report) return null;
  return { report, result: query({ ...report.query, role }) };
};
