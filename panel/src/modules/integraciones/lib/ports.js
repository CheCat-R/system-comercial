/**
 * ⭐ El registro de puertos.
 *
 * **Este archivo no importa nada, y no puede hacerlo nunca.** Es la pieza que
 * permite que el núcleo pida algo de afuera sin conocer a Integraciones
 * (docs/MODULO-INTEGRACIONES.md §1.4), igual que `automatizaciones/lib/bus.js`:
 *
 *   financeApi · billingApi · logisticaApi · …
 *            │  port("payments.fee", { fallback: calculoLocal })(payload)
 *            ▼
 *      integraciones/lib/ports.js   (hoja)
 *            ▲
 *            │  register("payments.fee", adaptador)
 *      integrationsApi ────────────────────────┘
 *
 * ── ⭐ El `fallback` lo pasa el módulo, no Integraciones ──────────────────
 *
 * Es lo que hace que la regla del módulo sea **estructural y no una promesa**:
 * la implementación local vive donde siempre vivió, y el registro sólo la
 * sustituye cuando hay un proveedor conectado. Si este módulo no existiera, el
 * panel funcionaría exactamente igual.
 *
 * Por eso `port()` sin proveedor **no es un error**: es el estado normal.
 *
 * ── ⭐ F3: el registro no decide política ────────────────────────────────
 *
 * Reintentos, idempotencia, traza rica y caída al fallback son **política del
 * panel**, y la política necesita el catálogo, la taxonomía de errores y el bus
 * — o sea, imports. Así que el registro no la implementa: expone un lugar donde
 * el módulo la enchufa (`setPipeline`), del mismo modo que el bus expone
 * `subscribe` y no sabe qué es una automatización.
 *
 * Sin pipeline instalada el registro se comporta como en F2. Es lo que corre en
 * un test que importe sólo esta hoja.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

/** `portKey → { connectionId, provider, call }`. Vacío = todo corre local. */
let _providers = new Map();

/** Contadores por puerto. Baratos: se actualizan en cada invocación. */
let _stats = new Map();

/** La política del módulo, si está instalada. Ver el encabezado. */
let _pipeline = null;

/**
 * Traza de llamadas. **Sólo se registran las que cruzan la frontera**: si no hay
 * proveedor no hay frontera que cruzar, y anotar cada cálculo local convertiría
 * el log en ruido — `orderPnl` sola pide la comisión una vez por pedido, cada
 * vez que Analytics arma su tabla de hechos.
 *
 * Con la pipeline instalada la traza la lleva ella (`lib/traffic.js`, con la
 * forma completa de §2.9) y acá no se anota nada: una llamada, una entrada.
 */
const LOG_LIMIT = 200;
let _log = [];
let _seq = 0;

const bump = (portKey, how) => {
  const s = _stats.get(portKey) || { total: 0, local: 0, provider: 0, errors: 0, lastAt: null };
  s.total += 1;
  s[how] += 1;
  s.lastAt = new Date().toISOString();
  _stats.set(portKey, s);
};

/** Para que la pipeline pueda contar lo que decide ella (fallback tras error). */
export const note = (portKey, how) => bump(portKey, how);

export const noteError = (portKey) => {
  const s = _stats.get(portKey);
  if (s) s.errors += 1;
};

/**
 * Devuelve la función que el módulo llama.
 *
 * @param {string} portKey  clave del catálogo (`payments.fee`)
 * @param {object} options  `{ fallback }` — la implementación local del módulo
 * @returns {(payload: object, meta?: object) => any}
 *
 * `meta` es opcional y lo usa la pipeline: `{ operation, subject,
 * idempotencyKey, correlationId, attempt }`. Un módulo que no la pasa funciona
 * igual — es lo que hace hoy el núcleo.
 */
export const port = (portKey, { fallback } = {}) => (payload, meta = {}) => {
  const active = _providers.get(portKey);

  if (!active) {
    bump(portKey, "local");
    if (typeof fallback !== "function") {
      throw new Error(`El puerto «${portKey}» no tiene proveedor ni implementación local.`);
    }
    return fallback(payload);
  }

  bump(portKey, "provider");

  // El handler recibe el contexto: qué puerto lo llamó y con qué configuración
  // quedó la conexión. Un mismo adaptador puede atender varios puertos y
  // necesita saber cuál.
  const ctx = { portKey, config: active.config, connectionId: active.connectionId };
  const invocation = {
    portKey,
    payload,
    meta,
    connectionId: active.connectionId,
    provider: active.provider,
    mode: active.mode,
    config: active.config,
    // La implementación local, ya cerrada sobre el payload: la pipeline puede
    // caer a ella ante un error sin saber nada del módulo dueño (§2.7).
    fallback: typeof fallback === "function" ? () => fallback(payload) : null,
    run: () => active.call(payload, ctx),
  };

  if (_pipeline) return _pipeline(invocation);

  /* ------------------ sin pipeline: el comportamiento mínimo del registro */
  const started = Date.now();
  try {
    const result = invocation.run();
    record({ portKey, connectionId: active.connectionId, provider: active.provider, payload, result, ms: Date.now() - started });
    return result;
  } catch (err) {
    noteError(portKey);
    record({ portKey, connectionId: active.connectionId, provider: active.provider, payload, error: err, ms: Date.now() - started });
    // El error se propaga: qué hacer con él lo decide `lib/errors.js` y el
    // módulo dueño, no el registro.
    throw err;
  }
};

/**
 * Llama a un puerto **sin fallback**: si no hay proveedor conectado, falla.
 *
 * Es lo que necesita un reintento y lo que necesita el inyector de la consola:
 * los dos quieren ejercitar la frontera de verdad, no la implementación local
 * — caer al fallback ahí escondería justo lo que se está probando.
 */
export const invoke = (portKey, payload, meta = {}) => {
  if (!_providers.has(portKey)) {
    throw new Error(`El puerto «${portKey}» no tiene ningún proveedor conectado.`);
  }
  return port(portKey, {})(payload, meta);
};

/** Instala la política del módulo. Devuelve la función para desinstalarla. */
export const setPipeline = (fn) => {
  _pipeline = fn;
  return () => { _pipeline = null; };
};

export const hasPipeline = () => Boolean(_pipeline);

/* --------------------------------------------------------------- registro */

export const register = (portKey, { connectionId, provider, call, config = {}, mode = null }) => {
  if (typeof call !== "function") throw new Error(`El proveedor de «${portKey}» no expone call().`);
  _providers.set(portKey, { connectionId, provider, call, config, mode });
};

export const unregister = (portKey) => { _providers.delete(portKey); };

/** Quién atiende un puerto ahora. `null` = la implementación local del módulo. */
export const activeProvider = (portKey) => _providers.get(portKey) || null;

export const registeredPorts = () => [..._providers.keys()];

/* ------------------------------------------------------------ estadística */

export const statsOf = (portKey) =>
  _stats.get(portKey) || { total: 0, local: 0, provider: 0, errors: 0, lastAt: null };

export const allStats = () => Object.fromEntries(_stats);

export const resetStats = () => { _stats = new Map(); };

/* ------------------------------------------------------------------ traza */

function record(entry) {
  _log = [{
    id: `CALL-${++_seq}`,
    at: new Date().toISOString(),
    portKey: entry.portKey,
    connectionId: entry.connectionId,
    provider: entry.provider,
    ms: entry.ms,
    status: entry.error ? "error" : "ok",
    errorMessage: entry.error?.message || null,
    // El payload y el resultado se guardan crudos acá; la **redacción se aplica
    // al leerlos** (`lib/redact.js`), con el mapa que declara el contrato del
    // proveedor. Guardar ya redactado impediría reintentar la llamada.
    payload: entry.payload,
    result: entry.result,
  }, ..._log].slice(0, LOG_LIMIT);
}

export const getCallLog = ({ portKey, limit = LOG_LIMIT } = {}) =>
  _log.filter((c) => !portKey || c.portKey === portKey).slice(0, limit);

export const clearCallLog = () => { _log = []; };
