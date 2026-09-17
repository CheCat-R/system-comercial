/**
 * ⭐ El portón de las acciones sensibles (§2.10) — lo que hace de F3 una capa de
 * control y no una capa de registro.
 *
 * F2 contestó *"¿quién lo hizo y qué cambió?"* **después**. Esto contesta
 * *"¿puede hacerlo, con qué motivo y quién más lo firma?"* **antes**.
 *
 *   pedidosApi.cancelOrder(id, { reason })
 *        │
 *        ▼
 *   sensitive({ action: "pedidos.cancelar", reason, run })
 *        │   ¿hay actor?  ¿tiene el permiso?  ¿escribió el motivo?
 *        │   ¿hace falta step-up?  ¿hace falta un segundo par de ojos?
 *        ▼
 *   run()  →  audit({ ..., reason })
 *
 * ── ⭐ El grado lo declara el catálogo, no la pantalla ──────────────────
 *
 * Nadie decide acá si una operación pide motivo: lo dice `PERMISSIONS[key].grade`.
 * Por eso dos pantallas no pueden tratar la misma operación con dos criterios, y
 * por eso llamarla desde otra pantalla tampoco lo saltea: **el control está en la
 * operación, no en el botón**.
 *
 * ── ⭐ Una automatización no puede saltear un grado ─────────────────────
 *
 * Es la regla de Automatizaciones (*"una automatización no puede hacer nada que
 * un usuario no pueda hacer a mano, por el mismo camino"*) leída desde el otro
 * lado. Si la operación exige aprobación, se la exige igual a la regla: no
 * ejecuta, encola. Antes eso lo decidía el motor; ahora lo decide la operación,
 * que es donde no se puede esquivar.
 *
 * ── Enchufes en vez de imports ──────────────────────────────────────────
 *
 * Este archivo lo importan los `api/` de los módulos del núcleo, así que no
 * puede importar a `securityApi` (sería un ciclo). Lo que necesita de la sesión
 * —el step-up, el usuario completo con sus excepciones, el bus para las
 * alertas— **se lo enchufa `securityApi` al cargar**, igual que Integraciones
 * enchufa su política de llamada con `setPipeline`.
 */
import { getPermission, getGrade, requiresStepUp } from "./permissions";
import { explain } from "./roles";
import { audit, currentActor } from "./audit";
import { enqueue } from "./approvals";

/* ------------------------------------------------------------ enchufes */

let _stepUpFresh = null;   // () => boolean
let _principal = null;     // () => usuario completo de la sesión
let _alert = null;         // ({ kind, ... }) => void

export const setStepUpCheck = (fn) => { _stepUpFresh = fn; return () => { _stepUpFresh = null; }; };
export const setPrincipalResolver = (fn) => { _principal = fn; return () => { _principal = null; }; };
export const setAlertSink = (fn) => { _alert = fn; return () => { _alert = null; }; };

const alert = (payload) => {
  // Una alerta que rompe la operación sería peor que no tener alertas.
  try { _alert?.(payload); } catch { /* silencio deliberado */ }
};

/* -------------------------------------------------------------- motivo */

/**
 * ⭐ Un motivo de tres letras es no poner motivo, con más pasos.
 * El mínimo es corto a propósito: el objetivo es que se escriba algo que sirva
 * dentro de seis meses, no ganarle a quien quiera escribir "asdfgh".
 */
export const MIN_REASON = 10;

export const checkReason = (reason) => {
  const text = String(reason || "").trim();
  if (!text) return "Esta operación pide un motivo escrito antes de ejecutarse.";
  if (text.length < MIN_REASON) {
    return `El motivo es demasiado corto (mínimo ${MIN_REASON} caracteres). Tiene que servirle a quien lo lea dentro de seis meses.`;
  }
  return null;
};

/* --------------------------------------------------------------- error */

/**
 * Un error tipado: la UI necesita distinguir *"no podés"* de *"falta el motivo"*
 * de *"quedó esperando una firma"*, y las tres son la misma llamada que no
 * ejecutó.
 */
export class GateError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.name = "GateError";
    this.gate = true;
    Object.assign(this, info);
  }
}

/* --------------------------------------------------------- la decisión */

/**
 * ¿Qué exige esta operación, para este actor, ahora? **Sin ejecutar nada.**
 * La usa la UI para pedir el motivo *antes* y para avisar que la operación va a
 * ir a una cola en vez de aplicarse.
 */
export const inspect = (action) => {
  const permission = getPermission(action);
  if (!permission) {
    return { ok: false, reason: `El permiso «${action}» no existe en el catálogo, y lo que no está declarado se deniega.` };
  }
  const grade = getGrade(permission.grade);
  const actor = currentActor();
  const principal = actor?.kind === "user" ? (_principal?.() || actor) : actor;

  const base = {
    permission,
    grade,
    needsReason: grade.needsReason,
    needsApproval: grade.needsApproval,
    needsStepUp: requiresStepUp(action),
    stepUpFresh: _stepUpFresh ? _stepUpFresh() : true,
    actor,
  };

  if (!actor) {
    return { ...base, ok: false, noActor: true, reason: `«${permission.label}» exige saber quién la ejecuta, y no hay nadie identificado.` };
  }

  if (actor.kind === "user") {
    const verdict = explain(principal, action);
    if (!verdict.allowed) return { ...base, ok: false, denied: true, reason: verdict.reason };
  }

  if (base.needsStepUp && !base.stepUpFresh) {
    return { ...base, ok: false, stepUp: true, reason: "Antes de esto hay que volver a autenticarse: es de las que no se hacen con una sesión abierta hace tres horas." };
  }

  return { ...base, ok: true };
};

/* ------------------------------------------------------------ ejecución */

/**
 * ⭐ Ejecuta una operación sensible, o no la ejecuta y dice por qué.
 *
 * @param {string}   action      clave del catálogo de permisos — de ahí sale el grado
 * @param {object}   subject     `{ type, id, label }`
 * @param {string}   reason      el motivo, **ya escrito** por quien la pide
 * @param {Function} run         lo que hace el módulo dueño; devuelve `{ value, changes }`
 * @param {Function} revalidate  `() => string|null` — por qué ya no se puede (lo usa la cola)
 * @param {string}   preview     una línea legible de qué va a pasar
 * @returns el `value` que devolvió `run`
 * @throws  {GateError}
 */
export const sensitive = ({
  action, subject = null, reason = null, preview = null, meta = null, ref = null,
  run, revalidate = null,
}) => {
  const verdict = inspect(action);

  if (!verdict.ok) {
    // ⭐ Un intento rechazado también es evidencia, y se registra como intento
    // (`result: "rechazado"`), nunca confundido con un cambio.
    if (verdict.permission) {
      audit({ action, subject, result: "rechazado", denial: verdict.reason, reason, meta });
      alert({ kind: "denegada", action, subject, detail: verdict.reason, actor: verdict.actor });
    }
    throw new GateError(verdict.reason, {
      needsStepUp: Boolean(verdict.stepUp),
      denied: Boolean(verdict.denied),
      noActor: Boolean(verdict.noActor),
    });
  }

  // ⭐ El motivo se pide ANTES, y la operación no ocurre sin él. Un motivo
  // pedido después es una encuesta.
  if (verdict.needsReason) {
    const bad = checkReason(reason);
    if (bad) throw new GateError(bad, { needsReason: true, action, grade: verdict.grade.key });
  }

  // ⭐ Un segundo par de ojos: no ejecuta, encola. Vale igual para una persona,
  // una regla o una conexión.
  if (verdict.needsApproval) {
    const item = enqueue({
      action, subject, reason, preview, meta, ref,
      requestedBy: verdict.actor,
      run: () => {
        const result = run() || {};
        audit({
          action, subject, reason,
          changes: result.changes || [],
          ref,
          requireActor: true,
          // ⭐ La pregunta que F2 dejó abierta, contestada: el actor es **quien
          // ejecutó** (quien aprobó, que es cuando la cosa efectivamente pasó),
          // y quién lo pidió queda acá al lado. Son las dos cosas.
          meta: { ...(meta || {}), solicitadoPor: verdict.actor?.name, aprobacion: item?.id },
        });
        return result.value;
      },
      revalidate,
    });
    alert({ kind: "aprobacion_pendiente", action, subject, approvalId: item.id, actor: verdict.actor, reason });
    throw new GateError(
      `Quedó pendiente de aprobación (${item.id}). Esta operación necesita que la firme otra persona, y no puede ser la que la pidió.`,
      { queued: true, approvalId: item.id, action },
    );
  }

  /* --- ejecución directa --- */
  const result = run() || {};
  audit({
    action, subject, reason,
    changes: result.changes || [],
    ref, meta,
    requireActor: true,
  });
  if (verdict.grade.order >= 2) {
    alert({ kind: "sensible", action, subject, reason, actor: verdict.actor });
  }
  return result.value;
};
