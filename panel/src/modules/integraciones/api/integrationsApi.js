/**
 * Única puerta de Integraciones.
 *
 * **Nadie del núcleo importa este archivo.** Los módulos sólo conocen
 * `lib/ports.js`, que no importa nada — por eso el grafo sigue siendo acíclico y
 * el panel funcionaría igual si este módulo no existiera (§1.4).
 *
 * **No hay ninguna integración concreta**: `providers/` sólo tiene un doble de
 * prueba para poder ejercitar el marco. Mientras un puerto no se habilite, corre
 * con la implementación local de su módulo — que no es un estado incompleto sino
 * el estado normal, y la UI lo dice así.
 */
import {
  PORTS, CATEGORIES, SENSITIVITY, getPort, listPorts, portsByCategory, wiredPorts,
} from "../lib/catalog";
import {
  activeProvider, statsOf, allStats, getCallLog, register, unregister, registeredPorts,
  setPipeline, hasPipeline, invoke,
} from "../lib/ports";
import { pipeline, subjectFromPayload } from "../lib/pipeline";
import {
  listCalls, getCall, chainOf, metricsFor, toCsv, rawRequestOf, CALL_STATUS, getCallStatus,
} from "../lib/traffic";
import {
  JOB_STATES, listJobs, getJob, dueJobs, patchJob, reschedule, resolveJob, cancelJob,
  queueSummary,
} from "../lib/retries";
import { listKeys as listIdempotencyKeys, guaranteeOf } from "../lib/idempotency";
import {
  receiveWebhook, listInbound, getInbound, inboundSummary, listDiscardReasons, DISCARD,
} from "../lib/inbound";
import { EFFECTS, getEffect } from "../lib/effects";
import { announce, announceStateChange, assertIntegrationEvents, INTEGRATION_EVENTS } from "../lib/events";
import {
  assertProviderContracts, listProviders, getProvider, providerCount, validateProvider,
  CONFIG_FIELD_TYPES,
} from "../lib/contracts";
import {
  CONNECTION_STATES, getState, runningIn, deriveState, localHealth, THRESHOLDS,
} from "../lib/health";
import { ERROR_TYPES, listErrorTypes, getErrorType, isRetryable, BACKOFF, idempotencyKey } from "../lib/errors";
import { redact, previewPayload, ALWAYS_REDACT } from "../lib/redact";
import { extractSecrets, missingSecrets, canGoLive, describeRef } from "../lib/secrets";
import { sampleFor, webhookSamples } from "../lib/samples";
import {
  canView, canViewTraffic, canConfigure, canEnable, canRetry, permissionsOf, PERMISSIONS, denial,
} from "../lib/rbac";
import { connections as seedConnections } from "../data/connections.mock";
// Hoja sin dependencias: registrar es del módulo dueño (MODULO-SEGURIDAD.md §2.7).
import { audit, activity } from "../../seguridad/lib/audit";
import { change } from "../../seguridad/lib/diff";
import { sensitive } from "../../seguridad/lib/gate";
// El doble de prueba se registra al importar. NO es una integración: ver el
// encabezado de ese archivo.
import "../providers/_demo";

/* --------------------------------------------------------- contratos */

const brokenProviders = assertProviderContracts();
if (brokenProviders.length && import.meta.env?.DEV) {
  console.error("[integraciones] proveedores con contrato incompleto:", brokenProviders);
}
export const getBrokenProviderContracts = () => brokenProviders;

// ⭐ Mismo criterio que los contratos de proveedor: si un evento que este módulo
// anuncia no está en el catálogo de Automatizaciones, no se podría automatizar y
// la promesa de §4 sería falsa. Se falla al cargar.
const brokenEvents = assertIntegrationEvents();
if (brokenEvents.length && import.meta.env?.DEV) {
  console.error("[integraciones] eventos sin contrato:", brokenEvents);
}
export const getBrokenEventContracts = () => brokenEvents;

/* ------------------------------------------------------- re-exports */

export {
  PORTS, CATEGORIES, SENSITIVITY, CONNECTION_STATES, ERROR_TYPES, THRESHOLDS,
  BACKOFF, CONFIG_FIELD_TYPES, ALWAYS_REDACT,
};
export { PERMISSIONS };
export {
  CALL_STATUS, JOB_STATES, DISCARD, EFFECTS, INTEGRATION_EVENTS,
  getCallStatus, listDiscardReasons, getEffect, guaranteeOf, listIdempotencyKeys,
  listCalls, getCall, chainOf, listInbound, getInbound, inboundSummary, webhookSamples,
  listJobs as listRetryJobs, getJob as getRetryJob, queueSummary,
  canView, canViewTraffic, canConfigure, canEnable, canRetry, permissionsOf,
  describeRef, canGoLive, missingSecrets, sampleFor,
  getPort, listPorts, portsByCategory, wiredPorts,
  getState, runningIn, deriveState,
  listErrorTypes, getErrorType, isRetryable, idempotencyKey,
  redact, previewPayload,
  listProviders, getProvider, providerCount, validateProvider,
  statsOf, allStats, getCallLog, activeProvider, registeredPorts,
};

/**
 * Traduce el `throw` del portón al `{ ok, error }` que devuelve este `api/`.
 *
 * ⭐ Fijate qué desapareció de las firmas de abajo: **el `{ role }` que la
 * pantalla pasaba a mano**. Que la UI le dijera al `api/` con qué rol lo llama
 * es exactamente lo que un portón evita — el actor lo pone el ambiente, no el
 * que llama.
 */
const gated = (fn, shape = (value) => ({ connection: value })) => {
  try {
    return { ok: true, ...shape(fn()) };
  } catch (err) {
    if (!err.gate) return { ok: false, error: err.message };
    return {
      ok: false,
      error: err.message,
      needsReason: Boolean(err.needsReason),
      needsStepUp: Boolean(err.needsStepUp),
      queued: Boolean(err.queued),
      approvalId: err.approvalId || null,
    };
  }
};

/* ------------------------------------------------------- conexiones */

let _connections = JSON.parse(JSON.stringify(seedConnections));

const enrich = (c) => {
  const port = getPort(c.port);
  const provider = c.provider ? getProvider(c.provider) : null;
  const health = c.provider ? c.health : localHealth();
  const state = deriveState(c, health);
  const stats = statsOf(c.port);

  return {
    ...c,
    port,
    portKey: c.port,
    provider,
    providerKey: c.provider,
    health,
    state,
    stateMeta: getState(state),
    running: runningIn(state),
    stats,
    // Qué está atendiendo el puerto **ahora mismo**, según el registro real y no
    // según lo que diga la conexión: si divergen, manda el registro.
    activeProvider: activeProvider(c.port),
  };
};

/** Una "conexión" por puerto, exista o no un proveedor. El catálogo es la UI. */
export const listConnections = ({ category, search } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return Object.values(PORTS)
    .map((p) => {
      const existing = _connections.find((c) => c.port === p.key);
      return enrich(existing || {
        id: `CX-${p.key}`,
        port: p.key,
        provider: null,
        mode: "simulado",
        config: {},
        secretsRef: null,
        enabled: false,
        health: null,
      });
    })
    .filter((c) => !category || c.port.category === category)
    .filter((c) => !q || c.port.label.toLowerCase().includes(q) || c.portKey.toLowerCase().includes(q));
};

export const getConnection = (portKey) =>
  listConnections().find((c) => c.portKey === portKey) || null;

/** El catálogo agrupado, que es como se ve la pantalla principal. */
export const getCatalog = ({ search } = {}) =>
  CATEGORIES.map((cat) => ({
    ...cat,
    connections: listConnections({ category: cat.key, search }),
  })).filter((c) => c.connections.length);

/* ----------------------------------------------------------- resumen */

export const getSummary = () => {
  const all = listConnections();
  const wired = wiredPorts();
  return {
    ports: all.length,
    categories: CATEGORIES.length,
    // ⭐ Se cuentan por separado: las integraciones reales siguen siendo 0, y la
    // pantalla tiene que poder decirlo aunque el marco tenga con qué probarse.
    providers: providerCount().real,
    demoProviders: providerCount().demo,
    connected: all.filter((c) => c.state === "conectada").length,
    degraded: all.filter((c) => ["degradada", "caida"].includes(c.state)).length,
    local: all.filter((c) => c.running === "local").length,
    wired: wired.length,
    declaredOnly: all.length - wired.length,
    syncOnly: Object.values(PORTS).filter((p) => p.syncOnly).length,
    calls: Object.values(allStats()).reduce((s, x) => s + x.total, 0),
    brokenContracts: brokenProviders.length,
  };
};

/**
 * Salud del módulo entero, para la tira de arriba del catálogo. En el caso
 * normal está vacía.
 */
export const getHealthAlerts = () =>
  listConnections()
    .filter((c) => ["degradada", "caida"].includes(c.state))
    .map((c) => ({
      portKey: c.portKey,
      label: c.port.label,
      state: c.state,
      message: c.health?.message || c.stateMeta.hint,
    }));

/* =================================================== ciclo de vida */

export const MODES = [
  { value: "simulado", label: "Simulado", hint: "Corre la implementación local del módulo. Es como funciona el panel hoy." },
  { value: "sandbox", label: "Sandbox", hint: "Habla con el entorno de pruebas del proveedor." },
  { value: "produccion", label: "Producción", hint: "Habla con el entorno real." },
];

const upsert = (portKey, patch) => {
  const existing = _connections.find((c) => c.port === portKey);
  if (existing) {
    _connections = _connections.map((c) => (c.port === portKey ? { ...c, ...patch } : c));
  } else {
    _connections = [..._connections, {
      id: `CX-${portKey}`, port: portKey, provider: null, mode: "simulado",
      config: {}, secretsRef: null, enabled: false, health: null, ...patch,
    }];
  }
  return getConnection(portKey);
};

/**
 * Guarda proveedor + configuración. **No habilita nada**: el orden del asistente
 * no es decorativo — primero se configura, después se prueba, y recién ahí se
 * habilita (§9.3).
 *
 * ⭐ Los campos secretos **no se guardan**: `extractSecrets` los convierte en una
 * referencia y descarta el valor en el acto (§2.5).
 */
export const configureConnection = (portKey, { providerKey, values = {}, mode = "simulado" }, { role = "" } = {}) => {
  if (!canConfigure(role)) return { ok: false, error: denial("configurar una integración") };

  const provider = getProvider(providerKey);
  if (!provider) return { ok: false, error: `El proveedor «${providerKey}» no existe.` };

  const problems = validateProvider(provider);
  if (problems.length) return { ok: false, error: `Contrato incompleto: ${problems[0]}` };

  if (mode === "produccion") {
    const live = canGoLive(provider.config);
    if (!live.ok) return { ok: false, error: live.reason };
  }

  // ⭐ Los valores por defecto del schema se aplican acá, no en el formulario.
  // Si sólo se guardara lo que el usuario tocó, una conexión creada sin abrir un
  // campo quedaría sin configuración, y el proveedor recibiría `{}` en lugar de
  // los defaults que su propio contrato declara.
  const withDefaults = (provider.config || []).reduce(
    (acc, f) => (f.type === "secret" || f.default === undefined ? acc : { [f.key]: f.default, ...acc }),
    {}
  );
  const { config, secretsRef, provided } = extractSecrets({ ...withDefaults, ...values }, provider.config);

  // ⭐ Reconfigurar **desconecta**. Encontrado probando F3: sin esto la conexión
  // decía "hay que probarla de nuevo" mientras el registro seguía mandando las
  // llamadas al proveedor viejo — el peor estado posible, porque la pantalla y
  // lo que pasa de verdad dejan de coincidir.
  unregister(portKey);

  const connection = upsert(portKey, {
    provider: providerKey, mode, config, secretsRef,
    enabled: false, disabledAt: null, health: null,
  });

  audit({
    action: "integraciones.configurar",
    subject: { type: "connection", id: portKey, label: getPort(portKey)?.label || portKey },
    changes: [
      change("Proveedor", null, provider.label),
      change("Modo", null, mode),
      ...(provided > 0 ? [change("Secretos", null, `${provided} referencia(s) — el valor no se guarda`)] : []),
    ],
    requireActor: true,
  });

  return { ok: true, connection, secretsProvided: provided };
};

/**
 * Prueba de conexión: corre el `healthCheck` que declara el contrato y guarda el
 * resultado. **No habilita**: probar y habilitar son dos actos distintos.
 */
export const testConnection = (portKey, { role = "" } = {}) => {
  if (!canConfigure(role)) return { ok: false, error: denial("probar una integración") };

  const connection = getConnection(portKey);
  if (!connection?.providerKey) return { ok: false, error: "Elegí un proveedor antes de probar." };

  const provider = getProvider(connection.providerKey);
  let result;
  try {
    result = provider.state.healthCheck(connection.config || {});
  } catch (err) {
    result = { ok: false, message: err.message, latencyMs: null };
  }

  const health = {
    ok: Boolean(result.ok),
    message: result.message || (result.ok ? "Respondió bien." : "No respondió."),
    latencyMs: result.latencyMs ?? null,
    consecutiveFailures: result.ok ? 0 : (connection.health?.consecutiveFailures || 0) + 1,
    errorRate: result.ok ? 0 : 1,
    lastCheckAt: new Date().toISOString(),
  };

  const previous = connection.state;
  upsert(portKey, { health });
  const updated = getConnection(portKey);

  // ⭐ Se anuncia el **cambio**, no el estado: un evento por chequeo sería ruido
  // y lo que se automatiza es la transición.
  announceStateChange(previous, updated.state, updated);

  return { ok: true, health, connection: updated };
};

/**
 * ⭐ Dry-run: arma el payload y **muestra qué se mandaría, sin mandarlo**.
 *
 * Sobre una frontera que no controlamos, poder mirar antes de apretar vale más
 * que cualquier otra pantalla. Para los puertos que ya consume el núcleo el
 * ejemplo sale de **datos reales**: un dry-run sobre un objeto inventado prueba
 * que el código corre, uno sobre un pedido real prueba que la traducción sirve.
 */
export const dryRun = (portKey, { role = "" } = {}) => {
  if (!canConfigure(role)) return { ok: false, error: denial("simular una llamada") };

  const connection = getConnection(portKey);
  if (!connection?.providerKey) return { ok: false, error: "Elegí un proveedor antes de simular." };

  const provider = getProvider(connection.providerKey);
  const sample = sampleFor(portKey);
  if (!sample) return { ok: false, error: "No se pudo armar un payload de ejemplo." };

  const redactList = provider.logs?.redact || [];
  let response = null;
  let error = null;

  try {
    // Se ejecuta el handler del proveedor pero **fuera del registro**: no pasa
    // por `port()`, así que no cuenta como llamada ni toca al núcleo.
    response = provider.call(sample.payload, { portKey, config: connection.config || {} });
  } catch (err) {
    error = { type: err.type || "remoto", message: err.message };
  }

  return {
    ok: true,
    sample,
    request: redact(sample.payload, redactList),
    response: response ? redact(response, redactList) : null,
    error,
    note: "No se envió nada y el núcleo no se enteró: el dry-run no pasa por el registro de puertos.",
  };
};

/**
 * Habilitar: recién acá el puerto deja de resolverse local.
 *
 * **No se puede habilitar sin una prueba exitosa** — es la misma idea que "una
 * regla en borrador nunca ejecuta" en Automatizaciones.
 */
export const enableConnection = (portKey, { reason } = {}) => {
  const connection = getConnection(portKey);
  if (!connection?.providerKey) return { ok: false, error: "No hay proveedor configurado." };
  if (!connection.health?.ok) {
    return { ok: false, error: "Probá la conexión primero: no se habilita algo que no sabemos si responde." };
  }

  // ⭐ Habilitar cambia por dónde pasa la operación real del negocio: es un
  // cambio de configuración con consecuencias de dinero, y por eso pide motivo.
  return gated(() => sensitive({
    action: "integraciones.habilitar",
    subject: { type: "connection", id: portKey, label: connection.port.label },
    reason,
    preview: `${connection.port.label}: pasa a atenderla ${connection.providerKey} en modo ${connection.mode}`,
    run: () => {
      const provider = getProvider(connection.providerKey);
      register(portKey, {
        connectionId: connection.id, provider: connection.providerKey,
        call: provider.call, config: connection.config || {}, mode: connection.mode,
      });
      upsert(portKey, { enabled: true, disabledAt: null });
      const updated = getConnection(portKey);
      announceStateChange(connection.state, updated.state, updated);
      return {
        value: updated,
        changes: [change("Habilitada", "no · corría local", `sí · la atiende ${connection.providerKey}`)],
      };
    },
  }), (updated) => ({ connection: updated, running: "provider" }));
};

/**
 * Deshabilitar: **vuelve a la implementación local y no rompe nada**. Es la
 * prueba de la regla del módulo, así que es una operación de primera clase y no
 * un caso de borde.
 */
export const disableConnection = (portKey, { reason } = {}) =>
  gated(() => sensitive({
    action: "integraciones.habilitar",
    subject: { type: "connection", id: portKey, label: getPort(portKey)?.label || portKey },
    reason,
    preview: `${getPort(portKey)?.label || portKey}: vuelve a la implementación local`,
    run: () => {
      unregister(portKey);
      upsert(portKey, { enabled: false, disabledAt: new Date().toISOString() });
      return {
        value: getConnection(portKey),
        changes: [change("Habilitada", "sí", "no · volvió a la implementación local")],
      };
    },
  }), (connection) => ({ connection, running: "local" }));

/**
 * Cambiar de modo desactiva la conexión: sandbox y producción no son lo mismo.
 *
 * ⭐ **Pasar a producción es la única de las tres que pide un segundo par de
 * ojos** (§4.8): desde ese momento las operaciones del negocio salen de verdad
 * hacia afuera. Volver a sandbox no: desandar hacia lo seguro no necesita firma.
 */
export const setMode = (portKey, mode, { reason } = {}) => {
  const connection = getConnection(portKey);
  if (!connection?.providerKey) return { ok: false, error: "No hay proveedor configurado." };

  if (mode === "produccion") {
    const live = canGoLive(getProvider(connection.providerKey).config);
    if (!live.ok) return { ok: false, error: live.reason };
  }

  return gated(() => sensitive({
    action: mode === "produccion" ? "integraciones.produccion" : "integraciones.configurar",
    subject: { type: "connection", id: portKey, label: connection.port.label },
    reason,
    preview: `${connection.port.label}: modo ${connection.mode} → ${mode} (queda deshabilitada hasta volver a probarla)`,
    revalidate: () => {
      const now = getConnection(portKey);
      if (!now?.providerKey) return "La conexión ya no tiene proveedor configurado.";
      if (now.mode === mode) return `Ya está en modo ${mode}.`;
      return null;
    },
    run: () => {
      unregister(portKey);
      upsert(portKey, { mode, enabled: false, disabledAt: null, health: null });
      return {
        value: getConnection(portKey),
        changes: [
          change("Modo", connection.mode, mode),
          change("Habilitada", connection.enabled ? "sí" : "no", "no · hay que volver a probarla"),
        ],
      };
    },
  }), (connection2) => ({ connection: connection2 }));
};

/** Olvida la configuración entera y devuelve el puerto a su estado inicial. */
export const resetConnection = (portKey, { role = "" } = {}) => {
  if (!canConfigure(role)) return { ok: false, error: denial("desconectar una integración") };
  unregister(portKey);
  _connections = _connections.filter((c) => c.port !== portKey);
  audit({
    action: "integraciones.configurar",
    subject: { type: "connection", id: portKey, label: getPort(portKey)?.label || portKey },
    changes: [change("Conexión", "configurada", "olvidada")],
    requireActor: true,
  });
  return { ok: true, connection: getConnection(portKey) };
};

/* ======================================================= F3 · tráfico */

/**
 * ⭐ Arranca el módulo: instala la política de llamadas y el reloj de la cola.
 *
 * Igual que el motor de Automatizaciones, **se arranca con la app y no con su
 * pantalla**: una cola de reintentos que sólo corre cuando estás mirando la
 * consola no es una cola. Y como todo el panel, **nada corre con la pestaña
 * cerrada** — se dice en la pantalla en vez de fingir un worker.
 */
let _tick = null;
let _uninstall = null;

export const start = () => {
  if (!hasPipeline()) _uninstall = setPipeline(pipeline);
  if (!_tick) _tick = setInterval(() => { runDueRetries(); }, 1000);
  return { pipeline: true, tickMs: 1000 };
};

export const stop = () => {
  if (_tick) { clearInterval(_tick); _tick = null; }
  if (_uninstall) { _uninstall(); _uninstall = null; }
};

export const isRunning = () => ({ pipeline: hasPipeline(), ticking: Boolean(_tick) });

/* ------------------------------------------------------------ lectura */

export const getTraffic = (filters = {}, { role = "" } = {}) => {
  if (!canViewTraffic(role)) return { ok: false, error: denial("ver la consola de tráfico"), calls: [] };
  return { ok: true, calls: listCalls(filters) };
};

export const getConnectionMetrics = (portKey) => metricsFor(portKey);

export const getTrafficSummary = () => {
  const all = listCalls({ limit: 300 });
  const queue = queueSummary();
  return {
    calls: all.length,
    outbound: all.filter((c) => c.direction === "saliente").length,
    inbound: all.filter((c) => c.direction === "entrante").length,
    errors: all.filter((c) => c.status === "error").length,
    fallback: all.filter((c) => c.status === "fallback").length,
    replayed: all.filter((c) => c.status === "replay").length,
    business: all.filter((c) => c.status === "negocio").length,
    waiting: queue.waiting,
    exhausted: queue.exhausted,
    backoff: queue.backoff,
  };
};

export const exportTrafficCsv = (filters = {}, { role = "" } = {}) => {
  if (!canViewTraffic(role)) return { ok: false, error: denial("exportar el tráfico") };
  const rows = listCalls(filters);
  const describe = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
  // ⭐ Exportar el tráfico saca datos del panel: es una acción registrable.
  activity({
    action: "integraciones.trafico",
    meta: { exportadas: rows.length, filtros: describe || "ninguno" },
  });

  return { ok: true, csv: toCsv(rows, { filters: describe }), rows: rows.length };
};

/**
 * Cómo se está garantizando la idempotencia de este puerto, para poder decirlo
 * en la ficha en vez de prometerla.
 */
export const describeIdempotency = (portKey) => {
  const port = getPort(portKey);
  const connection = getConnection(portKey);
  const provider = connection?.providerKey ? getProvider(connection.providerKey) : null;
  const declares = Boolean(port && "idempotencyKey" in (port.input || {}));

  return {
    declares,
    guarantee: provider ? guaranteeOf(provider) : null,
    hint: declares
      ? "Este puerto declara la clave en su contrato: cada llamada es un hecho de dominio, y un reintento no lo repite."
      : "Este puerto no lleva clave, y no hace falta: es una consulta, no un hecho. Repetirla no duplica nada.",
  };
};

/* ----------------------------------------------------- el inyector */

/**
 * ⭐ Manda una llamada de verdad por el puerto, con el payload de ejemplo.
 *
 * No es el dry-run: **esto cruza la frontera**. Existe porque los puertos que
 * hoy consume el núcleo se llaman solos y desde una pantalla, y sin esto no
 * habría forma de ejercitar un error, un reintento o una clave de idempotencia
 * sin romper algo de verdad. Va **sin fallback** a propósito: caer al cálculo
 * local escondería justo lo que se está probando.
 */
export const sendSample = (portKey, { role = "" } = {}) => {
  if (!canRetry(role)) return { ok: false, error: denial("mandar una llamada de prueba") };

  const connection = getConnection(portKey);
  if (!connection?.enabled) {
    return { ok: false, error: "El puerto no tiene una conexión habilitada: no hay frontera que cruzar." };
  }

  const port = getPort(portKey);
  const sample = sampleFor(portKey);
  if (!sample) return { ok: false, error: "No se pudo armar un payload." };

  const subject = subjectFromPayload(sample.payload);
  const payload = { ...sample.payload };
  // La clave se agrega **sólo si el contrato del puerto la declara**: es lo que
  // separa un hecho de dominio de una consulta (§2.8).
  if (port && "idempotencyKey" in (port.input || {})) {
    payload.idempotencyKey = idempotencyKey(subject, portKey);
  }

  try {
    const result = invoke(portKey, payload, { operation: portKey, subject });
    return { ok: true, result, sample };
  } catch (err) {
    return { ok: true, failed: true, error: { type: err.type || "remoto", message: err.message }, sample };
  }
};

/* ----------------------------------------------------- reintentos */

const runJob = (job) => {
  patchJob(job.id, { state: "reintentando" });
  try {
    invoke(job.portKey, job.payload, {
      operation: job.operation,
      subject: job.subject,
      // ⭐ La misma clave del intento original. Derivarla de nuevo es la forma
      // más silenciosa de cobrar dos veces.
      idempotencyKey: job.idempotencyKey,
      correlationId: job.correlationId,
      attempt: job.nextAttempt,
    });
    resolveJob(job.id);
    return { ok: true };
  } catch (err) {
    const updated = reschedule(job.id, { errorType: err?.type || "remoto", errorMessage: err?.message });
    if (updated?.state === "agotado") {
      // Ya no lo va a intentar nadie más solo: se anuncia para que se pueda
      // automatizar (abrir una tarea, avisar) y no quede sólo en un log.
      announce("integracion.llamada.error", getConnection(job.portKey), {
        errorType: updated.errorType, message: updated.errorMessage,
        subject: job.subject, operation: job.operation, resolvedLocally: false,
        reason: `Se agotaron los ${updated.maxAttempts} intentos.`,
      });
    }
    return { ok: false, error: err?.message };
  }
};

/** El tick. Toma sólo los vencidos: el backoff lo decide `lib/errors.js`. */
export const runDueRetries = () => {
  const due = dueJobs();
  due.forEach(runJob);
  return { ran: due.length };
};

/**
 * Reintento **a mano** desde la consola (§9.4).
 *
 * Va con la misma clave de idempotencia y el mismo `correlationId` que el
 * intento original: los reintentos de un hecho tienen que poder leerse juntos.
 */
export const retryCall = (callId, { role = "" } = {}) => {
  if (!canRetry(role)) return { ok: false, error: denial("reintentar una llamada") };

  const call = getCall(callId);
  if (!call) return { ok: false, error: "Esa llamada ya no está en la traza." };
  if (call.direction !== "saliente") return { ok: false, error: "Lo entrante no se reintenta: se vuelve a inyectar." };
  if (call.errorType === "negocio") {
    return { ok: false, error: "Es una respuesta de negocio, no una falla: reintentarla sería volver a pedir el mismo rechazo (§2.7)." };
  }

  const payload = rawRequestOf(callId);
  if (!payload) return { ok: false, error: "No quedó el payload original de esa llamada." };

  const connection = getConnection(call.portKey);
  if (!connection?.enabled) return { ok: false, error: "El puerto ya no tiene un proveedor habilitado." };

  try {
    const result = invoke(call.portKey, payload, {
      operation: call.operation,
      subject: call.subject,
      idempotencyKey: call.idempotencyKey,
      correlationId: call.correlationId,
      attempt: (call.attempt || 1) + 1,
    });
    // Si había un trabajo esperando por este mismo hecho, ya no hace falta.
    listJobs({ state: "esperando" })
      .filter((j) => j.correlationId === call.correlationId)
      .forEach((j) => resolveJob(j.id));
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: `Volvió a fallar: ${err.message}`, errorType: err.type || "remoto" };
  }
};

export const retryJobNow = (jobId, { role = "" } = {}) => {
  if (!canRetry(role)) return { ok: false, error: denial("reintentar una llamada") };
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "Ese trabajo ya no está en la cola." };
  if (!["esperando", "agotado"].includes(job.state)) return { ok: false, error: `El trabajo está ${job.state}.` };
  const result = runJob(job);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
};

export const cancelRetry = (jobId, { role = "" } = {}) => {
  if (!canRetry(role)) return { ok: false, error: denial("cancelar un reintento") };
  const job = cancelJob(jobId);
  return job ? { ok: true, job } : { ok: false, error: "Ese trabajo ya no está en la cola." };
};

/* ------------------------------------------------------- entrantes */

/**
 * La firma que mandaría el proveedor. **Sale del propio adaptador**: el panel no
 * sabe firmar por él, sólo sabe pedirle la firma para poder simular el envío.
 */
const providerSignature = (provider, raw) => {
  try {
    return provider?.inbound?.signFor ? provider.inbound.signFor(raw) : null;
  } catch {
    return null;
  }
};

/**
 * ⭐ Inyecta un webhook simulado (§5, regla 4).
 *
 * **Sin backend no hay endpoint público**, así que lo entrante se simula — y se
 * dice, igual que el reloj simulado de Automatizaciones. Lo que sí es real es
 * todo lo que pasa después: la verificación, la deduplicación, la traducción, la
 * publicación al bus y el efecto sobre el módulo dueño por su propio `api/`.
 */
export const injectWebhook = (portKey, { raw, badSignature = false } = {}, { role = "" } = {}) => {
  if (!canConfigure(role)) return { ok: false, error: denial("inyectar un webhook") };
  if (!raw) return { ok: false, error: "No hay payload que inyectar." };

  const connection = getConnection(portKey);
  const provider = connection?.providerKey ? getProvider(connection.providerKey) : null;
  const signature = providerSignature(provider, raw);

  const entry = receiveWebhook({ portKey, connection, raw, signature, forceBadSignature: badSignature });
  return { ok: true, entry };
};

/** Los puertos que pueden recibir: los que tienen un proveedor que declara entrada. */
export const inboundCapablePorts = () =>
  listConnections()
    .filter((c) => c.providerKey && getProvider(c.providerKey)?.inbound)
    .map((c) => ({ portKey: c.portKey, label: c.port.label, enabled: c.enabled, provider: c.providerKey }));
