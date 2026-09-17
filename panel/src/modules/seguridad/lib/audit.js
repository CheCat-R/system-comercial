/**
 * ⭐ La auditoría (§2.7) — la tercera hoja del panel.
 *
 * **Este archivo no importa nada, y no puede hacerlo nunca**, igual que
 * `automatizaciones/lib/bus.js` y `integraciones/lib/ports.js`. Los doce módulos
 * tienen que poder dejar constancia sin importar a Seguridad, o el grafo de
 * dependencias vuelve a tener ciclos.
 *
 *   pedidosApi · inventoryApi · financeApi · …
 *           │  audit({ action, subject, changes, reason })
 *           ▼
 *     seguridad/lib/audit.js      (hoja)
 *           ▲
 *           │  listAudit() · auditFor() · activityOf()
 *     securityApi ──────────────┘
 *
 * ── ⭐ Por qué no se cuelga del bus ─────────────────────────────────────
 *
 * Es tentador: los eventos ya están ahí. Pero un evento del bus dice *"se pagó
 * el pedido 10253"* y **no dice quién lo confirmó ni qué campos cambiaron**; y
 * su traza está acotada a 200 entradas **y se recorta sola**, porque es una
 * herramienta de diagnóstico. Una evidencia que se borra sola para hacer lugar
 * no es evidencia.
 *
 * ── ⭐ El actor es ambiente, no un parámetro más ────────────────────────
 *
 * Pasar `{ actor }` por las 178 funciones de escritura del panel sería tocar
 * todas las pantallas y olvidarse en la mitad. En vez de eso el shell fija quién
 * está operando (`setActor` al iniciar sesión) y quien actúa por dentro del
 * sistema abre su propio contexto:
 *
 *   withActor({ kind: "automation", id: "RULE-3" }, () => ejecutarAccion())
 *   withActor({ kind: "integration", id: "payments.charge" }, () => aplicarEfecto())
 *
 * Es la misma forma que `bus.withContext`. Y hace cumplible la regla dura:
 * **sin actor no hay escritura sensible** — `audit()` la rechaza.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

/* --------------------------------------------------------------- actor */

const ANON = null;
let _actor = ANON;

/** Lo fija el shell al iniciar sesión, y lo limpia al cerrarla. */
export const setActor = (actor) => { _actor = actor || ANON; };

export const currentActor = () => _actor;

/**
 * Corre `fn` con otro actor. Lo usan el motor de Automatizaciones y el puente de
 * Integraciones: **el sistema también es un actor**, y decir "sistema" a secas es
 * la forma elegante de decir *no sabemos*.
 */
export const withActor = (actor, fn) => {
  const previous = _actor;
  _actor = actor;
  try {
    return fn();
  } finally {
    _actor = previous;
  }
};

/* ------------------------------------------------------------- registro */

/**
 * Retención acotada — **y dicha**.
 *
 * El problema de la traza del bus no es el tope: es el silencio. Acá, cuando se
 * cae un asiento por antigüedad, **se cuenta y se muestra**, para que nadie crea
 * que está mirando todo lo que pasó.
 */
const LIMIT = 1000;

let _log = [];
let _seq = 0;
let _dropped = 0;

/** Cuántos asientos ya no están en memoria. La UI lo muestra. */
export const droppedEntries = () => _dropped;

const push = (entry) => {
  _log = [entry, ..._log];
  if (_log.length > LIMIT) {
    _dropped += _log.length - LIMIT;
    _log = _log.slice(0, LIMIT);
  }
  return entry;
};

/**
 * ⭐ Deja constancia de un hecho consumado.
 *
 * Se llama **después** de que la operación tuvo efecto, con el antes y el
 * después. Un intento rechazado también se registra, pero como intento
 * (`result: "rechazado"`), nunca confundido con un cambio.
 *
 * @param {string}  action   clave del catálogo de permisos (`inventario.ajustar`)
 * @param {object}  subject  `{ type, id, label }` — sobre qué se actuó
 * @param {array}   changes  `[{ field, label, before, after }]`
 * @param {string}  reason   obligatorio en los grados que lo exigen (F3)
 * @param {string}  result   `"ok"` | `"rechazado"`
 * @param {string}  ref      callId · runId · inboundId — el hilo hacia el otro módulo
 * @param {boolean} requireActor  si es true y no hay actor, **tira**
 */
export const audit = ({
  action,
  subject = null,
  changes = [],
  reason = null,
  result = "ok",
  denial = null,
  ref = null,
  meta = null,
  requireActor = false,
} = {}) => {
  if (!_actor && requireActor) {
    // La regla dura, aplicada donde se puede aplicar: si nadie sabe quién lo
    // hizo, no se hace. Es lo que el `createdBy = "Vos"` volvía imposible.
    throw new Error(`«${action}» exige saber quién la ejecuta, y no hay actor en contexto.`);
  }

  return push({
    id: `AUD-${String(++_seq).padStart(5, "0")}`,
    at: new Date().toISOString(),
    actor: _actor || { kind: "sistema", id: "sistema", name: "Sistema" },
    action,
    subject,
    changes,
    reason,
    result,
    denial,
    ref,
    meta,
  });
};

/**
 * Actividad que **no cambia nada** pero igual importa: entrar, salir, exportar,
 * mirar un dato sensible. Es lo que separa el *activity log* del *registro de
 * cambios* (§2.8) — y exportar datos de clientes es exactamente esto.
 */
export const activity = ({ action, subject = null, meta = null, result = "ok", denial = null }) =>
  push({
    id: `AUD-${String(++_seq).padStart(5, "0")}`,
    at: new Date().toISOString(),
    actor: _actor || { kind: "sistema", id: "sistema", name: "Sistema" },
    action,
    subject,
    changes: [],
    reason: null,
    result,
    denial,
    ref: null,
    meta,
    readOnly: true,
  });

/* ------------------------------------------------------------- lectura */

/**
 * No hay `update` ni `delete`, y no es un olvido: **la auditoría es inmutable y
 * no se puede borrar desde el panel**, ni por un administrador. Una auditoría
 * borrable no prueba nada, y el permiso de borrarla sería el único que habría
 * que auditar de verdad.
 */
export const listAudit = ({
  actorId, actorKind, subjectType, subjectId, action, module, result, search,
  onlyChanges = false, from, to, limit = 200,
} = {}) => {
  const q = (search || "").toLowerCase().trim();
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(to).getTime() : null;

  return _log
    .filter((e) => !actorId || e.actor?.id === actorId)
    .filter((e) => !actorKind || e.actor?.kind === actorKind)
    .filter((e) => !subjectType || e.subject?.type === subjectType)
    .filter((e) => !subjectId || e.subject?.id === subjectId)
    .filter((e) => !action || e.action === action)
    .filter((e) => !module || e.action?.split(".")[0] === module)
    .filter((e) => !result || e.result === result)
    .filter((e) => !onlyChanges || e.changes.length > 0)
    .filter((e) => !fromMs || new Date(e.at).getTime() >= fromMs)
    .filter((e) => !toMs || new Date(e.at).getTime() <= toMs)
    .filter((e) => !q
      || e.action.toLowerCase().includes(q)
      || String(e.actor?.name || "").toLowerCase().includes(q)
      || String(e.subject?.label || "").toLowerCase().includes(q)
      || String(e.subject?.id || "").toLowerCase().includes(q)
      || String(e.reason || "").toLowerCase().includes(q))
    .slice(0, limit);
};

export const getEntry = (id) => _log.find((e) => e.id === id) || null;

/** ⭐ La lente por **entidad**: "¿quién tocó este pedido?". */
export const auditFor = (subjectType, subjectId, { limit = 50 } = {}) =>
  listAudit({ subjectType, subjectId, limit });

/** ⭐ La lente por **actor**: "¿qué hizo Fulana hoy?" — incluye lo que sólo miró. */
export const activityOf = (actorId, { limit = 100 } = {}) =>
  listAudit({ actorId, limit });

export const auditSummary = () => {
  const all = _log;
  const byKind = {};
  const byModule = {};
  all.forEach((e) => {
    byKind[e.actor?.kind || "sistema"] = (byKind[e.actor?.kind || "sistema"] || 0) + 1;
    const m = e.action?.split(".")[0] || "otros";
    byModule[m] = (byModule[m] || 0) + 1;
  });

  return {
    total: all.length,
    changes: all.filter((e) => e.changes.length > 0).length,
    reads: all.filter((e) => e.readOnly).length,
    rejected: all.filter((e) => e.result === "rechazado").length,
    withReason: all.filter((e) => e.reason).length,
    dropped: _dropped,
    limit: LIMIT,
    byKind,
    byModule,
    lastAt: all[0]?.at || null,
  };
};
