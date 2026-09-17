/**
 * Única puerta de Seguridad.
 *
 * **Los módulos del núcleo no importan este archivo**: para preguntar "¿puede?"
 * alcanza con `seguridad/lib/roles.js` y `lib/permissions.js`, que son hojas sin
 * dependencias. Este `api/` es para el shell (login, sesión) y para las
 * pantallas del propio módulo.
 *
 * F1 entrega identidad, roles y permisos. La auditoría (F2) y los grados de
 * control (F3) se apoyan en lo que se declara acá.
 */
import {
  PERMISSIONS, GRADES, SURFACES, PERMISSION_MODULES, THRESHOLDS, assertPermissions, getPermission,
  listPermissions, permissionsByModule, permissionsBySurface, coverage, getGrade,
  requiresReason, requiresApproval, requiresStepUp, isAudited, escalate,
} from "../lib/permissions";
import {
  ROLES, listRoles, getRole, can, explain, permissionsOf, rolePermissions,
  resolveRoleKey, roleOf, assertRoles, legacyRoleUses,
} from "../lib/roles";
import {
  ACCOUNT_STATES, getAccountState, PASSWORD_POLICY, checkPassword, LOCKOUT,
  isLocked, lockRemainingMinutes, GENERIC_LOGIN_ERROR, applyFailure, applySuccess,
} from "../lib/accounts";
import {
  SESSION_POLICY, SESSION_STATES, createSession, touch, sessionStatus, isExpired,
  markStepUp, stepUpValid, describeRemaining,
} from "../lib/sessions";
import {
  audit, activity, setActor, currentActor, withActor, listAudit, getEntry, auditFor,
  activityOf, auditSummary, droppedEntries,
} from "../lib/audit";
import { ACTOR_KINDS, getActorKind, userActor, describeActor } from "../lib/actors";
import { AUDITABLE, auditableFields, change, describeChange, formatValue } from "../lib/diff";
import {
  sensitive, inspect, GateError, MIN_REASON, checkReason,
  setStepUpCheck, setPrincipalResolver, setAlertSink,
} from "../lib/gate";
import {
  APPROVAL_STATES, getApprovalState, listApprovals, getApproval, countPendingApprovals,
  approveRequest, rejectRequest, approvalsSummary, segregationError,
} from "../lib/approvals";
import { users as seedUsers } from "../data/users.mock";
// El bus es una hoja: importarlo no puede crear un ciclo. Seguridad **sí** puede
// emitir eventos de dominio porque es el módulo dueño de la cola de aprobación;
// el portón, que es hoja, sólo avisa por un enchufe (§ misma regla que lo
// entrante de Integraciones: quien publica el evento es el módulo dueño).
import { emit } from "../../automatizaciones/lib/bus";

/* --------------------------------------------------------- contratos */

const brokenPermissions = assertPermissions();
const brokenRoles = assertRoles();
if ((brokenPermissions.length || brokenRoles.length) && import.meta.env?.DEV) {
  console.error("[seguridad] contratos incompletos:", [...brokenPermissions, ...brokenRoles]);
}
export const getBrokenContracts = () => [...brokenPermissions, ...brokenRoles];

/* ------------------------------------------------------- re-exports */

export {
  PERMISSIONS, GRADES, SURFACES, PERMISSION_MODULES, ROLES, ACCOUNT_STATES,
  SESSION_POLICY, SESSION_STATES, PASSWORD_POLICY, LOCKOUT, ACTOR_KINDS, AUDITABLE,
  APPROVAL_STATES,
};
export { GateError, MIN_REASON, checkReason, inspect, getApprovalState, segregationError };
export {
  can, explain, permissionsOf, rolePermissions, resolveRoleKey, roleOf, listRoles, getRole,
  getPermission, listPermissions, permissionsByModule, permissionsBySurface, coverage, getGrade,
  requiresReason, requiresApproval, requiresStepUp, isAudited, escalate, THRESHOLDS,
  getAccountState, checkPassword, describeRemaining, sessionStatus, stepUpValid,
  legacyRoleUses,
  getActorKind, describeActor, auditableFields, describeChange, formatValue, withActor,
};

/* ------------------------------------------------------------ estado */

let _users = JSON.parse(JSON.stringify(seedUsers));
let _session = null;

const SESSION_KEY = "checat_session";

const persist = () => {
  try {
    if (_session) localStorage.setItem(SESSION_KEY, JSON.stringify(_session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Un navegador con el almacenamiento bloqueado no debería impedir trabajar.
  }
};

/** Rehidrata la sesión guardada, **verificando que siga siendo válida**. */
const restore = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (isExpired(saved)) return null;
    // La sesión guarda un id, no un usuario: si al usuario le cambiaron el rol o
    // lo suspendieron mientras la pestaña estaba cerrada, manda el padrón.
    const user = _users.find((u) => u.id === saved.userId);
    if (!user || !getAccountState(user.status).canLogin) return null;
    return saved;
  } catch {
    return null;
  }
};

_session = restore();

// ⭐ Si había sesión guardada, el actor se restablece con ella: si no, la primera
// escritura después de recargar quedaría firmada como "Sistema".
if (_session) {
  // Se usa el registro crudo a propósito: `shape()` todavía no está inicializada en
  // este punto del módulo, y el actor sólo necesita id, nombre, rol y email.
  const restored = _users.find((u) => u.id === _session.userId);
  if (restored) setActor(userActor(restored));
}

/* -------------------------------------------------------- usuarios */

const shape = (user) => {
  if (!user) return null;
  const role = getRole(user.roleKey) || getRole("lectura");
  return {
    ...user,
    role: role.label,          // ⭐ puente: las pantallas viejas leen `user.role`
    roleKey: role.key,
    roleMeta: role,
    statusMeta: getAccountState(user.status),
    locked: isLocked(user),
    lockMinutes: lockRemainingMinutes(user),
    permissions: permissionsOf(user),
  };
};

export const listUsers = ({ roleKey, status, search } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _users
    .map(shape)
    .filter((u) => !roleKey || u.roleKey === roleKey)
    .filter((u) => !status || u.status === status)
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
};

export const getUser = (id) => shape(_users.find((u) => u.id === id));

const patch = (id, changes) => {
  _users = _users.map((u) => (u.id === id ? { ...u, ...changes } : u));
  return getUser(id);
};

/** ⭐ Nunca se puede dejar al panel sin administrador. */
const isLastAdmin = (id) => {
  const admins = _users.filter((u) => u.roleKey === "admin" && getAccountState(u.status).canLogin);
  return admins.length === 1 && admins[0].id === id;
};

/* ------------------------------------------------------ autenticación */

/**
 * ⭐ **Autentica contra el padrón, no contra una credencial.**
 *
 * Sin backend no hay hash ni verificación posible, así que esto valida lo que sí
 * puede validar: que la cuenta exista, que su estado permita entrar y que la
 * contraseña **cumpla la política**. Se dice en la pantalla de login en vez de
 * fingir una verificación que no ocurre (§10).
 *
 * Lo que sí es real: el mensaje de error **no revela si el email existe**, y los
 * intentos fallidos bloquean la cuenta.
 */
export const authenticate = (email, password) => {
  const found = _users.find((u) => u.email.toLowerCase() === String(email || "").toLowerCase().trim());

  // Sin usuario: mismo mensaje y mismo tiempo que con usuario. No se confirma
  // el padrón a alguien que está probando direcciones.
  if (!found) {
    // No hay actor todavía: queda como intento del sistema, con el email probado.
    activity({ action: "sesion.rechazada", meta: { email }, result: "rechazado", denial: "El email no está en el padrón." });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  if (isLocked(found)) {
    return {
      ok: false,
      error: `La cuenta está bloqueada por intentos fallidos. Volvé a intentar en ${lockRemainingMinutes(found)} minutos.`,
      locked: true,
    };
  }

  const state = getAccountState(found.status);
  if (!state.canLogin) {
    return { ok: false, error: `Esta cuenta está ${state.label.toLowerCase()}. Pedile a un administrador que la reactive.` };
  }

  const check = checkPassword(password, { email });
  if (!check.ok) {
    const after = patch(found.id, applyFailure(found));
    activity({
      action: "sesion.rechazada",
      subject: { type: "user", id: found.id, label: found.name },
      meta: { email, intentos: after.failedAttempts },
      result: "rechazado",
      denial: after.locked ? "Cuenta bloqueada por intentos fallidos." : "Credencial rechazada.",
    });
    return {
      ok: false,
      error: after.locked
        ? `Demasiados intentos fallidos: la cuenta queda bloqueada ${LOCKOUT.minutes} minutos.`
        : GENERIC_LOGIN_ERROR,
      attemptsLeft: Math.max(0, LOCKOUT.maxAttempts - (after.failedAttempts || 0)),
    };
  }

  const user = patch(found.id, { ...applySuccess(found), passwordSet: true });
  _session = createSession(user);
  persist();

  // ⭐ Desde acá, toda escritura del panel sabe quién la hizo.
  setActor(userActor(user));
  activity({ action: "sesion.iniciada", subject: { type: "user", id: user.id, label: user.name }, meta: { device: _session.device } });

  return { ok: true, user, session: _session };
};

export const logout = () => {
  const user = getCurrentUser();
  if (user) activity({ action: "sesion.cerrada", subject: { type: "user", id: user.id, label: user.name } });
  _session = null;
  setActor(null);
  persist();
  return { ok: true };
};

export const getCurrentUser = () => (_session ? getUser(_session.userId) : null);

/** El actor de quien está operando, para preguntar por la segregación en la UI. */
export const currentUserActor = () => userActor(getCurrentUser());

export const getSession = () => _session;

export const getSessionStatus = () => sessionStatus(_session);

/** Marca actividad. La llama el shell ante cualquier interacción. */
export const touchSession = () => {
  if (!_session) return null;
  _session = touch(_session);
  persist();
  return _session;
};

/**
 * ⭐ Step-up: volver a autenticarse para una acción crítica, aunque la sesión
 * esté viva. Es la diferencia entre "estás adentro" y "sos vos, ahora".
 */
export const reauthenticate = (password) => {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: "No hay sesión." };
  const check = checkPassword(password, { email: user.email });
  if (!check.ok) return { ok: false, error: GENERIC_LOGIN_ERROR };
  _session = markStepUp(_session);
  persist();
  return { ok: true, validUntilMinutes: SESSION_POLICY.stepUpMinutes };
};

export const hasFreshStepUp = () => stepUpValid(_session);

/* ================================================ los enchufes del portón */

/**
 * ⭐ El portón es una hoja y no puede importar este archivo (sería un ciclo con
 * los doce módulos que lo usan). Lo que necesita de la sesión se lo enchufa el
 * módulo dueño al cargar, igual que Integraciones enchufa su política de llamada
 * con `setPipeline`.
 *
 * Que esto viva acá y no dentro del portón tiene una consecuencia buena: si
 * alguien importa `gate.js` en un test sin Seguridad, el portón sigue frenando
 * por permiso y por motivo — sólo deja de exigir step-up, que es lo único que
 * depende de una sesión real.
 */
setStepUpCheck(() => stepUpValid(_session));
setPrincipalResolver(() => getCurrentUser());
setAlertSink((alert) => {
  if (alert.kind === "aprobacion_pendiente") {
    // ⭐ El portón **avisa**; el que publica el evento de dominio es el módulo
    // dueño. Traducir y además emitir desde la hoja despertaría al motor dos
    // veces, que es exactamente el error que Integraciones ya cometió una vez.
    emit("seguridad.aprobacion_pendiente", { type: "approval", id: alert.approvalId }, {
      approvalId: alert.approvalId,
      action: alert.action,
      requestedBy: alert.actor?.name || "—",
      reason: alert.reason || "",
    });
  }
});

/**
 * El guardián que usan las pantallas: junta permiso + step-up en una sola
 * respuesta, **con el motivo**, para que la UI muestre por qué en vez de un
 * botón muerto.
 */
export const check = (permissionKey, { user = getCurrentUser() } = {}) => {
  const verdict = explain(user, permissionKey);
  if (!verdict.allowed) return verdict;
  if (requiresStepUp(permissionKey) && !hasFreshStepUp()) {
    return {
      allowed: false,
      needsStepUp: true,
      reason: "Esta acción pide volver a autenticarse antes de ejecutarse.",
    };
  }
  return verdict;
};

/* ------------------------------------------------ administración de usuarios */

const guard = (permissionKey, what) => {
  const verdict = check(permissionKey);
  if (!verdict.allowed) {
    return { ok: false, error: `No podés ${what}. ${verdict.reason}`, needsStepUp: verdict.needsStepUp };
  }
  return null;
};

/**
 * Traduce el `throw` del portón al `{ ok, error }` que devuelven las funciones de
 * este `api/`. La UI necesita distinguir *no podés* de *falta el motivo* de
 * *quedó esperando una firma*: las tres son la misma llamada que no ejecutó, y
 * las tres se dicen distinto en pantalla.
 */
const asResult = (fn, shape = (value) => ({ value })) => {
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

/** Alta **por invitación**: en un panel de gestión nadie se auto-registra. */
export const inviteUser = ({ name, email, roleKey = "lectura", title = "" }) => {
  const denied = guard("seguridad.usuarios", "invitar usuarios");
  if (denied) return denied;

  if (!name || !email) return { ok: false, error: "Nombre y email son obligatorios." };
  if (_users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "Ya hay una cuenta con ese email." };
  }
  if (!getRole(roleKey)) return { ok: false, error: `El rol «${roleKey}» no existe.` };

  const user = {
    id: `USR-${_users.length + 1}`,
    name, email, roleKey, title,
    status: "invitada",
    passwordSet: false,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    invitedBy: getCurrentUser()?.id || null,
    extraPermissions: [],
    deniedPermissions: [],
  };
  _users = [..._users, user];
  audit({
    action: "seguridad.usuarios",
    subject: { type: "user", id: user.id, label: name },
    changes: [change("Alta por invitación", null, `${name} · ${getRole(roleKey).label}`)],
    requireActor: true,
  });
  return { ok: true, user: getUser(user.id) };
};

export const updateUser = (id, { name, email, title }) => {
  const denied = guard("seguridad.usuarios", "editar usuarios");
  if (denied) return denied;
  if (!_users.some((u) => u.id === id)) return { ok: false, error: "Ese usuario no existe." };
  return { ok: true, user: patch(id, { name, email, title }) };
};

/**
 * ⭐ Cambiar un rol es cambiar permisos, y tiene sus tres reglas duras:
 * nadie edita el suyo, no se puede dejar al panel sin administrador, y hace
 * falta step-up porque es el permiso que otorga permisos.
 */
export const setUserRole = (id, roleKey, { reason } = {}) => {
  const me = getCurrentUser();
  if (me?.id === id) {
    return { ok: false, error: "Nadie puede editar su propio rol. Pedíselo a otro administrador." };
  }
  if (!getRole(roleKey)) return { ok: false, error: `El rol «${roleKey}» no existe.` };
  if (isLastAdmin(id) && roleKey !== "admin") {
    return { ok: false, error: "Es el último administrador activo: el panel no puede quedarse sin uno." };
  }

  const before = getUser(id);

  // ⭐ Las reglas duras se verifican ANTES de encolar: no tiene sentido pedirle
  // a alguien que firme algo que ya sabemos que no se puede hacer.
  return asResult(() => sensitive({
    action: "seguridad.permisos",
    subject: { type: "user", id, label: before.name },
    reason,
    preview: `${before.name}: ${before.roleMeta.label} → ${getRole(roleKey).label}`,
    meta: { rolAnterior: before.roleMeta.label, rolNuevo: getRole(roleKey).label },
    revalidate: () => {
      const now = getUser(id);
      if (!now) return "Esa cuenta ya no existe.";
      if (now.roleKey === roleKey) return `${now.name} ya tiene el rol ${getRole(roleKey).label}.`;
      if (now.roleKey !== before.roleKey) return `El rol de ${now.name} ya no es ${before.roleMeta.label} sino ${now.roleMeta.label}.`;
      if (isLastAdmin(id) && roleKey !== "admin") return "Quedó como último administrador activo.";
      return null;
    },
    run: () => {
      const after = patch(id, { roleKey });
      return {
        value: after,
        changes: [change("Rol", before.roleMeta.label, after.roleMeta.label)],
      };
    },
  }), (user) => ({ user, change: { field: "rol", before: before.roleMeta.label, after: getRole(roleKey).label } }));
};

/** Excepciones nominales: un permiso suelto **por encima o por debajo** del rol. */
const exceptionLabel = (user, permissionKey) => {
  if (user.extraPermissions?.includes(permissionKey)) return "permitido";
  if (user.deniedPermissions?.includes(permissionKey)) return "denegado";
  return "sin excepción";
};

export const setException = (id, permissionKey, mode, { reason } = {}) => {
  if (!getPermission(permissionKey)) return { ok: false, error: `El permiso «${permissionKey}» no existe.` };

  const user = _users.find((u) => u.id === id);
  if (!user) return { ok: false, error: "Ese usuario no existe." };

  const nextLabel = mode === "permitir" ? "permitido" : (mode === "denegar" ? "denegado" : "sin excepción");
  const beforeLabel = exceptionLabel(user, permissionKey);

  return asResult(() => sensitive({
    action: "seguridad.permisos",
    subject: { type: "user", id, label: user.name },
    reason,
    preview: `${user.name} · ${getPermission(permissionKey).label}: ${beforeLabel} → ${nextLabel}`,
    meta: { permiso: permissionKey },
    revalidate: () => {
      const now = _users.find((u) => u.id === id);
      if (!now) return "Esa cuenta ya no existe.";
      if (exceptionLabel(now, permissionKey) === nextLabel) return `La excepción ya está en «${nextLabel}».`;
      return null;
    },
    run: () => {
      const current = _users.find((u) => u.id === id);
      const extra = new Set(current.extraPermissions || []);
      const deniedSet = new Set(current.deniedPermissions || []);
      extra.delete(permissionKey);
      deniedSet.delete(permissionKey);
      if (mode === "permitir") extra.add(permissionKey);
      if (mode === "denegar") deniedSet.add(permissionKey);

      const updated = patch(id, { extraPermissions: [...extra], deniedPermissions: [...deniedSet] });
      return {
        value: updated,
        changes: [change(`Excepción · ${getPermission(permissionKey).label}`, beforeLabel, nextLabel)],
      };
    },
  }), (updated) => ({ user: updated }));
};

export const setUserStatus = (id, status) => {
  const denied = guard("seguridad.usuarios", "cambiar el estado de una cuenta");
  if (denied) return denied;
  if (!ACCOUNT_STATES[status]) return { ok: false, error: `Estado desconocido «${status}».` };

  const me = getCurrentUser();
  if (me?.id === id && !getAccountState(status).canLogin) {
    return { ok: false, error: "No podés suspender tu propia cuenta." };
  }
  if (isLastAdmin(id) && !getAccountState(status).canLogin) {
    return { ok: false, error: "Es el último administrador activo: no se puede desactivar." };
  }

  // ⭐ Se desactiva, no se borra: borrar al usuario dejaría huérfano su rastro.
  const before = getUser(id);
  const after = patch(id, { status, lockedUntil: null, failedAttempts: 0 });
  audit({
    action: "seguridad.usuarios",
    subject: { type: "user", id, label: after.name },
    changes: [change("Estado de la cuenta", before.statusMeta.label, after.statusMeta.label)],
    requireActor: true,
  });
  return { ok: true, user: after };
};

export const unlockUser = (id) => {
  const denied = guard("seguridad.usuarios", "desbloquear una cuenta");
  if (denied) return denied;
  const after = patch(id, { status: "activa", lockedUntil: null, failedAttempts: 0 });
  audit({
    action: "seguridad.usuarios",
    subject: { type: "user", id, label: after.name },
    changes: [change("Bloqueo", "bloqueada", "desbloqueada")],
    requireActor: true,
  });
  return { ok: true, user: after };
};

/* ------------------------------------------------------------- resumen */

export const getSecuritySummary = () => {
  const all = _users.map(shape);
  const cov = coverage();
  return {
    users: all.length,
    active: all.filter((u) => u.status === "activa").length,
    invited: all.filter((u) => u.status === "invitada").length,
    blocked: all.filter((u) => u.locked || u.status === "bloqueada").length,
    suspended: all.filter((u) => u.status === "suspendida").length,
    admins: all.filter((u) => u.roleKey === "admin").length,
    roles: listRoles().length,
    permissions: cov.total,
    wired: cov.wired,
    declared: cov.declared,
    sensitive: cov.sensitive,
    stepUp: cov.stepUp,
    exceptions: all.reduce((n, u) => n + (u.extraPermissions?.length || 0) + (u.deniedPermissions?.length || 0), 0),
    brokenContracts: getBrokenContracts().length,
    legacyRoleUses: legacyRoleUses(),
  };
};

/** Cuántos usuarios por rol, para la pantalla de roles. */
export const usersByRole = () =>
  listRoles().map((role) => ({
    ...role,
    users: _users.filter((u) => u.roleKey === role.key).map(shape),
    permissionCount: rolePermissions(role.key).length,
  }));

/* ================================================= F2 · auditoría */

/**
 * ⭐ Ver quién hizo qué **es, en sí mismo, ver datos sensibles**: el rastro
 * incluye importes, clientes y motivos. Por eso la lectura de la auditoría es un
 * permiso propio, y como todo en el panel, se aplica en el `api/`.
 */
export const getAuditLog = (filters = {}, { role = getCurrentUser() } = {}) => {
  const verdict = explain(role, "seguridad.auditoria");
  if (!verdict.allowed) return { ok: false, error: verdict.reason, entries: [] };
  return { ok: true, entries: listAudit(filters) };
};

/** La lente por **entidad**: se lee dentro del pedido, del SKU, de la conexión. */
export const getEntityAudit = (subjectType, subjectId, { limit = 20 } = {}) =>
  auditFor(subjectType, subjectId, { limit });

/** La lente por **actor**: qué hizo esta persona (o esta regla, o esta conexión). */
export const getActivityOf = (actorId, options = {}) => activityOf(actorId, options);

export const getAuditEntry = (id) => getEntry(id);

export const getAuditSummary = () => ({ ...auditSummary(), dropped: droppedEntries() });

/** Quiénes aparecen en la traza, para poder filtrar por actor sin escribir el id. */
export const auditActors = () => {
  const seen = new Map();
  listAudit({ limit: 1000 }).forEach((e) => {
    if (!e.actor) return;
    const key = `${e.actor.kind}:${e.actor.id}`;
    const row = seen.get(key) || { ...e.actor, entries: 0, lastAt: e.at };
    row.entries += 1;
    seen.set(key, row);
  });
  return [...seen.values()].sort((a, b) => b.entries - a.entries);
};

/* ------------------------------------------------------------ export */

const CSV_COLUMNS = [
  ["at", "Cuándo"], ["actorName", "Quién"], ["actorKind", "Tipo de actor"],
  ["action", "Acción"], ["subjectLabel", "Sobre"], ["changes", "Qué cambió"],
  ["reason", "Motivo"], ["result", "Resultado"], ["ref", "Referencia"],
];

const cell = (value) => {
  const text = value == null ? "" : String(value);
  return /[",;\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
};

/**
 * ⭐ Exportar la auditoría **también se audita**: sacar el rastro del panel es
 * una acción registrable, con la cantidad de filas y los filtros aplicados.
 * Cabecera de contexto igual que en Analytics: un CSV sin decir de dónde salió
 * es un número suelto.
 */
export const exportAuditCsv = (filters = {}) => {
  const verdict = explain(getCurrentUser(), "seguridad.auditoria");
  if (!verdict.allowed) return { ok: false, error: verdict.reason };

  const rows = listAudit({ ...filters, limit: 1000 }).map((e) => ({
    at: e.at,
    actorName: e.actor?.name,
    actorKind: e.actor?.kind,
    action: e.action,
    subjectLabel: e.subject ? `${e.subject.type} ${e.subject.id}` : "",
    changes: e.changes.map(describeChange).join(" · "),
    reason: e.reason,
    result: e.result,
    ref: e.ref,
  }));

  const describe = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(" · ");
  const csv = [
    "# Auditoría — CheCAT Panel",
    `# Exportado: ${new Date().toISOString()} por ${getCurrentUser()?.name || "—"}`,
    `# Filtros: ${describe || "ninguno"}`,
    `# ${rows.length} asiento(s). La retención en memoria es acotada: ver el aviso del panel.`,
    "",
    CSV_COLUMNS.map(([, label]) => label).join(","),
    ...rows.map((r) => CSV_COLUMNS.map(([key]) => cell(r[key])).join(",")),
  ].join("\n");

  activity({
    action: "seguridad.auditoria",
    meta: { exportadas: rows.length, filtros: describe || "ninguno" },
  });

  return { ok: true, csv, rows: rows.length };
};

/**
 * Para que otros módulos puedan registrar sin importar este `api/`: no lo
 * necesitan —importan la hoja `lib/audit.js` directamente— pero el shell sí usa
 * esto al abrir y cerrar sesión.
 */
export { audit, activity, currentActor };

/* ==================================== la cola de aprobación (F3) */

/**
 * ⭐ Quién podría firmar esto.
 *
 * No es decorado: **una operación `con aprobación` que nadie puede firmar es una
 * operación imposible**, y es mejor decirlo en la pantalla que dejarla esperando
 * para siempre. Es también el motivo por el que el padrón tiene dos
 * administradores: con uno solo, cambiar permisos no se podía cerrar nunca.
 */
export const whoCanApprove = (action, { exclude = null } = {}) =>
  listUsers()
    .filter((u) => getAccountState(u.status).canLogin)
    .filter((u) => u.id !== exclude)
    .filter((u) => can(u, action));

const enrichApproval = (item) => {
  if (!item) return null;
  const permission = getPermission(item.action);
  return {
    ...item,
    permission,
    grade: getGrade(permission?.grade),
    stateMeta: getApprovalState(item.status),
    // Se calcula al leer, no al encolar: el padrón pudo cambiar en el medio.
    eligible: whoCanApprove(item.action, { exclude: item.requestedBy?.kind === "user" ? item.requestedBy.id : null }),
  };
};

export const listApprovalRequests = (filters = {}) => listApprovals(filters).map(enrichApproval);

export const getApprovalRequest = (id) => enrichApproval(getApproval(id));

export const getPendingApprovalCount = () => countPendingApprovals();

export const getApprovalsSummary = () => approvalsSummary();

/**
 * ⭐ Firmar o rechazar.
 *
 * Tres controles, en este orden y por este motivo:
 *   1. **Permiso** — firmar un reembolso exige poder aprobar reembolsos. Que
 *      alguien tenga acceso a esta pantalla no lo habilita a firmar cualquier cosa.
 *   2. **Step-up**, si la operación lo pide: es plata saliendo o permisos que se
 *      otorgan; "estás adentro" no alcanza, hace falta "sos vos, ahora".
 *   3. **Segregación** — quien pidió no firma. Se verifica en `lib/approvals.js`,
 *      no acá: un botón deshabilitado se saltea llamando a la función.
 */
export const resolveApproval = (id, { approve = true, note = "" } = {}) => {
  const item = getApproval(id);
  if (!item) return { ok: false, error: "Esa solicitud no existe." };

  const me = getCurrentUser();
  const verdict = check(item.action, { user: me });
  if (!verdict.allowed) {
    audit({
      action: item.action,
      subject: item.subject,
      result: "rechazado",
      denial: `No pudo firmar la solicitud ${id}: ${verdict.reason}`,
      meta: { aprobacion: id },
    });
    return { ok: false, error: `No podés firmar esto. ${verdict.reason}`, needsStepUp: verdict.needsStepUp };
  }

  const approver = userActor(me);
  const result = approve
    ? approveRequest(id, { approver, note })
    : rejectRequest(id, { approver, note });

  if (!result.ok) return result;

  // Rechazar no ejecuta nada, así que el portón no dejó asiento: lo deja acá,
  // porque **decidir que algo NO se haga también es una decisión con autor**.
  if (!approve) {
    audit({
      action: item.action,
      subject: item.subject,
      result: "rechazado",
      denial: note.trim(),
      reason: item.reason,
      meta: { aprobacion: id, solicitadoPor: item.requestedBy?.name },
    });
  }

  const saved = getApprovalRequest(id);
  emit("seguridad.aprobacion_resuelta", { type: "approval", id }, {
    approvalId: id,
    action: item.action,
    status: saved.status,
    resolvedBy: me?.name || "—",
  });

  return { ok: true, approval: saved, detail: result.value ?? null };
};
