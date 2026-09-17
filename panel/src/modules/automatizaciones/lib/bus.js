/**
 * ⭐ El bus de eventos.
 *
 * **Este archivo no importa nada, y no puede hacerlo nunca.** Es la pieza que
 * permite que Automatizaciones sea transversal sin romper el grafo de
 * dependencias del panel (docs/MODULO-AUTOMATIZACIONES.md §1.2):
 *
 *   pedidosApi · inventoryApi · logisticaApi · …  ──emit()──►  bus.js  (hoja)
 *                                                                 │
 *                                       automationsApi ──subscribe()┘
 *                                              └──► actúa llamando a esos mismos api/
 *
 * Si el bus importara cualquier `api/`, los módulos que lo importan quedarían en
 * un ciclo y Vite entregaría un módulo a medio inicializar — el peor tipo de
 * bug: intermitente y dependiente del orden de carga. Por eso acá no hay ni un
 * `import`, ni siquiera de `lib/time`.
 *
 * Los módulos **no saben qué es una automatización**: sólo anuncian lo que les
 * pasó. Si nadie escucha, `emit()` es casi gratis.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

/** Suscriptores. El motor se registra una vez; en tests puede haber más. */
let _subscribers = [];

/** Traza para la Bandeja de eventos (§9.5). Acotada: es una demo, no un log. */
const LOG_LIMIT = 200;
let _log = [];
let _seq = 0;

/**
 * Profundidad de la cadena en curso.
 *
 * Cuando el motor ejecuta una acción, esa acción llama a un `api/` que a su vez
 * emite su propio evento. Ese evento hereda `depth + 1` para que la salvaguarda
 * de profundidad (§2.6) pueda cortar las cascadas A→B→A. El motor abre y cierra
 * el contexto alrededor de cada acción; fuera de una acción la profundidad es 0.
 */
let _depth = 0;
let _origin = "bus";

/**
 * Emite un evento.
 *
 * @param {string} key      clave del catálogo, `modulo.hecho` (`pedido.pagado`)
 * @param {object} subject  `{ type, id }` — la entidad sobre la que se actúa
 * @param {object} payload  datos del hecho, según el contrato del evento
 * @returns {object} el evento emitido
 */
export const emit = (key, subject = null, payload = {}) => {
  const event = {
    id: `EV-${++_seq}`,
    key,
    subject,
    payload,
    at: new Date().toISOString(),
    depth: _depth,
    origin: _origin,
    // Lo completa el motor al procesarlo; la bandeja lo muestra.
    matchedRules: [],
  };

  _log = [event, ..._log].slice(0, LOG_LIMIT);

  // Un suscriptor que explota no puede tumbar la operación que emitió el
  // evento: confirmar un pago tiene que funcionar aunque el motor falle.
  _subscribers.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      if (import.meta.env?.DEV) console.error("[bus] suscriptor falló:", key, err);
    }
  });

  return event;
};

/**
 * Deja un evento en la traza **sin despacharlo** a los suscriptores.
 *
 * Lo usa el escáner: sus eventos son sintéticos y la regla que los produjo ya
 * tiene su trabajo encolado. Si además se emitieran, el suscriptor volvería a
 * encolar la misma regla y todo se ejecutaría dos veces.
 *
 * O sea: `emit` anuncia, `record` sólo deja rastro. Sin esto, la Bandeja de
 * eventos mostraría la mitad de lo que pasa — y un evento que no se puede ver
 * es exactamente lo que hace que nadie confíe en el motor.
 */
export const record = (event) => {
  // ⭐ El id lo pone el bus, y el que venga en el evento no lo pisa.
  //
  // Estaba al revés (`{ id: ..., ...event }`) y el escáner pasa sus eventos
  // sintéticos con `id: null` **esperando que el bus se lo asigne** —tanto que
  // después hace `{ ...event, id: logged.id }`—, así que todos los eventos
  // observados quedaban con `id: null`: la bandeja los renderizaba con la misma
  // clave (React podía duplicarlos u omitirlos) y el trabajo encolado no podía
  // volver a la entrada que lo originó. Encontrado verificando la F3 de Seguridad.
  const entry = { matchedRules: [], ...event, id: event?.id || `EV-${++_seq}` };
  _log = [entry, ..._log].slice(0, LOG_LIMIT);
  return entry;
};

/** @returns {Function} función para desuscribirse. */
export const subscribe = (fn) => {
  _subscribers = [..._subscribers, fn];
  return () => { _subscribers = _subscribers.filter((f) => f !== fn); };
};

/**
 * Corre `fn` marcando los eventos que emita como hijos de una acción.
 * Lo usa el motor para heredar la profundidad y el origen (§2.6).
 */
export const withContext = ({ depth = 0, origin = "accion" }, fn) => {
  const prevDepth = _depth;
  const prevOrigin = _origin;
  _depth = depth;
  _origin = origin;
  try {
    return fn();
  } finally {
    _depth = prevDepth;
    _origin = prevOrigin;
  }
};

export const currentDepth = () => _depth;

/** Últimos eventos, del más nuevo al más viejo. */
export const getEventLog = ({ limit = LOG_LIMIT, key, subjectType } = {}) =>
  _log
    .filter((e) => !key || e.key === key)
    .filter((e) => !subjectType || e.subject?.type === subjectType)
    .slice(0, limit);

/** Anota en la traza qué reglas despertó un evento (lo llama el motor). */
export const tagEvent = (eventId, ruleIds) => {
  _log = _log.map((e) => (e.id === eventId ? { ...e, matchedRules: ruleIds } : e));
};

export const clearLog = () => { _log = []; };
