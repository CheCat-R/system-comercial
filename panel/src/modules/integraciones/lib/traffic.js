/**
 * ⭐ La traza de tráfico (§2.9).
 *
 * Una entrada **por intento**, no por hecho: un cobro que falló dos veces y
 * anduvo a la tercera son tres filas atadas por el mismo `correlationId`. Es la
 * diferencia entre "el pago entró" y "el pago entró después de que el proveedor
 * nos colgara dos veces", y la segunda es la que sirve para decidir si seguimos
 * con ese proveedor.
 *
 * Dos decisiones que valen más que el formato:
 *
 * 1. **Se guarda crudo y se redacta al leer.** Guardar ya redactado dejaría el
 *    reintento sin payload — y sin reintento, la consola es un museo. La lista
 *    de campos la declara el contrato del proveedor (§2.2 punto 7), no la UI.
 *
 * 2. **`negocio` no se cuenta como error.** Una tarjeta rechazada es una
 *    respuesta, y sumarla a la tasa de error deja la conexión degradada por
 *    hacer bien su trabajo.
 */
import { redact } from "./redact";
import { getPort } from "./catalog";
import { getProvider } from "./contracts";
import { ERROR_TYPES } from "./errors";

/** Acotada en memoria, igual que la traza del bus: es un panel, no un SIEM. */
const LIMIT = 300;

let _log = [];
let _seq = 0;
let _corr = 0;

export const newCorrelationId = () => `COR-${String(++_corr).padStart(4, "0")}`;

/** Estados de una entrada. `fallback` es un resultado, no un error a medias. */
export const CALL_STATUS = {
  ok: { key: "ok", label: "OK", tone: "success", hint: "El proveedor respondió." },
  replay: { key: "replay", label: "Repetida", tone: "info", hint: "Misma clave de idempotencia: se devolvió el resultado del primer intento, sin volver a llamar." },
  negocio: { key: "negocio", label: "Respuesta de negocio", tone: "info", hint: "El proveedor contestó que no, y eso es información del dominio: no es una falla." },
  fallback: { key: "fallback", label: "Resuelta local", tone: "warning", hint: "Falló la llamada y el puerto se resolvió con la implementación del módulo. La operación no se perdió." },
  error: { key: "error", label: "Error", tone: "danger", hint: "Falló y no había con qué resolverla local." },
};

export const getCallStatus = (key) => CALL_STATUS[key] || CALL_STATUS.ok;

/**
 * Anota un intento. Devuelve la entrada guardada (con su id), que es lo que la
 * pipeline necesita para atar el trabajo de reintento a la fila que lo produjo.
 */
export const recordCall = (entry) => {
  const row = {
    id: `CALL-${String(++_seq).padStart(4, "0")}`,
    at: new Date().toISOString(),
    direction: "saliente",
    attempt: 1,
    correlationId: null,
    idempotencyKey: null,
    subject: null,
    operation: null,
    mode: null,
    connectionId: null,
    provider: null,
    httpStatus: null,
    errorType: null,
    errorMessage: null,
    durationMs: null,
    request: null,
    response: null,
    ...entry,
  };
  _log = [row, ..._log].slice(0, LIMIT);
  return row;
};

/** Marca una entrada ya escrita (el reintento resolvió lo que ésta dejó abierto). */
export const tagCall = (id, patch) => {
  _log = _log.map((c) => (c.id === id ? { ...c, ...patch } : c));
  return _log.find((c) => c.id === id) || null;
};

/* ------------------------------------------------------------------ lectura */

const withRedaction = (row) => {
  if (!row) return null;
  const declared = getProvider(row.provider)?.logs?.redact || [];
  return {
    ...row,
    request: redact(row.request, declared),
    response: redact(row.response, declared),
    port: getPort(row.portKey),
    statusMeta: getCallStatus(row.status),
    errorMeta: row.errorType ? ERROR_TYPES[row.errorType] : null,
  };
};

export const listCalls = ({
  portKey, status, errorType, direction, correlationId, subjectId, search, limit = LIMIT,
} = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _log
    .filter((c) => !portKey || c.portKey === portKey)
    .filter((c) => !status || c.status === status)
    .filter((c) => !errorType || c.errorType === errorType)
    .filter((c) => !direction || c.direction === direction)
    .filter((c) => !correlationId || c.correlationId === correlationId)
    .filter((c) => !subjectId || c.subject?.id === subjectId)
    .filter((c) => !q
      || c.portKey.toLowerCase().includes(q)
      || String(c.operation || "").toLowerCase().includes(q)
      || String(c.subject?.id || "").toLowerCase().includes(q)
      || String(c.idempotencyKey || "").toLowerCase().includes(q))
    .slice(0, limit)
    .map(withRedaction);
};

export const getCall = (id) => withRedaction(_log.find((c) => c.id === id));

/**
 * El payload **sin redactar**, que es lo único que sirve para reintentar. No
 * sale a la UI: lo consume la pipeline.
 */
export const rawRequestOf = (id) => _log.find((c) => c.id === id)?.request ?? null;

/** Todos los intentos de un mismo hecho, del primero al último. */
export const chainOf = (correlationId) =>
  _log.filter((c) => c.correlationId === correlationId).slice().reverse().map(withRedaction);

/* ----------------------------------------------------------------- métricas */

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

/**
 * Métricas de una conexión. **`negocio` y `replay` no cuentan como error**, y
 * `fallback` se cuenta aparte: es la métrica que dice cuánto se está apoyando
 * la operación en la implementación local mientras el proveedor no responde.
 */
export const metricsFor = (portKey) => {
  const rows = _log.filter((c) => !portKey || c.portKey === portKey);
  const outbound = rows.filter((c) => c.direction === "saliente");
  const failed = outbound.filter((c) => c.status === "error");
  const fellBack = outbound.filter((c) => c.status === "fallback");
  const durations = outbound.map((c) => c.durationMs).filter((n) => typeof n === "number");

  const byError = {};
  outbound.forEach((c) => {
    if (!c.errorType) return;
    byError[c.errorType] = (byError[c.errorType] || 0) + 1;
  });

  return {
    total: rows.length,
    outbound: outbound.length,
    inbound: rows.length - outbound.length,
    ok: outbound.filter((c) => c.status === "ok").length,
    replayed: outbound.filter((c) => c.status === "replay").length,
    business: outbound.filter((c) => c.status === "negocio").length,
    fallback: fellBack.length,
    errors: failed.length,
    errorRate: outbound.length ? (failed.length + fellBack.length) / outbound.length : 0,
    avgMs: durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : null,
    p95Ms: percentile(durations, 95),
    byError,
    lastAt: rows[0]?.at || null,
  };
};

/* --------------------------------------------------------------------- CSV */

const CSV_COLUMNS = [
  ["at", "Cuándo"], ["direction", "Sentido"], ["portKey", "Puerto"], ["provider", "Proveedor"],
  ["mode", "Modo"], ["operation", "Operación"], ["status", "Resultado"], ["errorType", "Tipo de error"],
  ["errorMessage", "Mensaje"], ["attempt", "Intento"], ["correlationId", "Correlación"],
  ["idempotencyKey", "Clave de idempotencia"], ["durationMs", "ms"],
];

const cell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",;\n]/.test(s) ? `"${s.split('"').join('""')}"` : s;
};

/**
 * Exporta con la **misma cabecera de contexto que Analytics**: un CSV sin decir
 * de dónde salió es un número suelto.
 */
export const toCsv = (rows, { title = "Tráfico de integraciones", filters = "" } = {}) => {
  const head = [
    `# ${title}`,
    `# Exportado: ${new Date().toISOString()}`,
    `# Filtros: ${filters || "ninguno"}`,
    "# Los payloads no se exportan: pueden contener datos de clientes (§2.9).",
    "",
  ];
  const header = CSV_COLUMNS.map(([, label]) => label).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map(([key]) => cell(r[key])).join(","));
  return [...head, header, ...body].join("\n");
};

export const clearTraffic = () => { _log = []; _seq = 0; };
