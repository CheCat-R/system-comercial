/**
 * ⭐ El catálogo de acciones.
 *
 * **La regla que define el módulo** (§1.1): *una automatización no puede hacer
 * nada que un usuario no pueda hacer a mano, por el mismo camino.* Por eso cada
 * acción declara `calls` —la función real del `api/` dueño— y su `run()` no
 * hace otra cosa que llamarla. Ninguna acción escribe en un `data/*.mock.js`,
 * ninguna saltea una validación, ninguna inventa una transición.
 *
 * Y cuando el módulo dueño rechaza algo, **el error se propaga textual**: si
 * Logística dice "el envío no está listo para despachar", eso es lo que queda
 * en el historial, no un "algo salió mal".
 *
 * ── Los tres niveles (§5.3) ───────────────────────────────────────────────
 *   safe       estado interno del panel: tareas, etiquetas, notas → directo
 *   contact    sale hacia el cliente → directo, pero respetando las bajas de
 *              canal que Marketing ya valida
 *   sensitive  plata o estados irreversibles → **no se ejecuta sola**: queda
 *              como propuesta a aprobar
 *
 * ── ⭐ Qué quedó acá y qué se fue ─────────────────────────────────────────
 *
 * Acá viven **sólo las acciones que el motor puede cumplir solo**: la tarea y la
 * notificación, que escriben en las bandejas de este mismo módulo. No dependen
 * de ningún módulo de negocio, así que existen en cualquier panel.
 *
 * Las otras seis —anotar en el CRM, etiquetar, recuperar un carrito, abrir una
 * incidencia, cancelar o reembolsar un pedido— **las declara su módulo dueño**
 * y se registran con `registrarAccion()`. Un panel sin Logística no tiene
 * «abrir incidencia» en el selector, y no hay que tocar este archivo para eso.
 */
import { interpolate } from "./subjects";
import { nowIso } from "./clock";
import { registrarAcciones, accion, acciones } from "./registry";

/* ------------------------------------------- bandejas internas del panel */

let _tasks = [];
let _notifications = [];
let _seq = 0;

export const listTasks = ({ done } = {}) =>
  _tasks.filter((t) => done == null || t.done === done);

export const toggleTask = (id) => {
  _tasks = _tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  return _tasks.find((t) => t.id === id) || null;
};

export const listNotifications = () => [..._notifications];
export const clearNotifications = () => { _notifications = []; };

/* ------------------------------------------------------------- niveles */

export const ACTION_TIERS = {
  safe: { key: "safe", label: "Segura", tone: "success", hint: "Sólo estado interno del panel" },
  contact: { key: "contact", label: "De contacto", tone: "warning", hint: "Sale hacia el cliente" },
  sensitive: { key: "sensitive", label: "Sensible", tone: "danger", hint: "Toca plata o es irreversible: requiere aprobación" },
};

/* ------------------------------------ las acciones propias del motor */

registrarAcciones({
  "task.create": {
    label: "Crear una tarea", group: "Panel", tier: "safe",
    subjectTypes: null,
    calls: "interno (bandeja de tareas del panel)",
    params: [
      { key: "title", label: "Título", type: "text", required: true, default: "Revisar {{subject.id}}",
        hint: "Admite {{order.total}}, {{account.name}}, {{sku.name}}…" },
      { key: "assignee", label: "Responsable", type: "text", default: "Sin asignar" },
    ],
    preview: (ctx, p) => `Crear la tarea «${interpolate(p.title, ctx)}» para ${p.assignee || "Sin asignar"}`,
    run: (ctx, p) => {
      const task = {
        id: `TSK-${++_seq}`,
        title: interpolate(p.title, ctx),
        assignee: p.assignee || "Sin asignar",
        subject: ctx.subject,
        done: false,
        at: nowIso(),
      };
      _tasks = [task, ..._tasks];
      return { ok: true, detail: `Tarea ${task.id} creada`, ref: task.id };
    },
  },

  "notify.panel": {
    label: "Notificar en el panel", group: "Panel", tier: "safe",
    subjectTypes: null,
    calls: "interno (centro de notificaciones)",
    params: [
      { key: "level", label: "Nivel", type: "select", default: "info",
        options: [
          { value: "info", label: "Informativa" },
          { value: "warning", label: "Aviso" },
          { value: "error", label: "Urgente" },
        ] },
      { key: "message", label: "Mensaje", type: "text", required: true, default: "{{subject.id}} necesita atención" },
    ],
    preview: (ctx, p) => `Notificar (${p.level}): «${interpolate(p.message, ctx)}»`,
    run: (ctx, p) => {
      const n = { id: `NTF-${++_seq}`, level: p.level || "info", message: interpolate(p.message, ctx), subject: ctx.subject, at: nowIso() };
      _notifications = [n, ..._notifications].slice(0, 100);
      return { ok: true, detail: "Notificación publicada", ref: n.id };
    },
  },
});

/* -------------------------------------------------------------- lectura */

export const getAction = (key) => accion(key);

/** Todas las registradas: las de acá más las que trajo cada módulo del proyecto. */
export const allActions = () => acciones();

export const appliesTo = (action, subjectType) =>
  !action?.subjectTypes || action.subjectTypes.includes(subjectType);

/** Por qué una acción no se puede colgar de esta regla — se muestra, no se oculta. */
export const actionRejection = (action, subjectType) => {
  if (!action) return "Elegí una acción.";
  if (appliesTo(action, subjectType)) return null;
  return `«${action.label}» sólo aplica a: ${action.subjectTypes.join(", ")}. El sujeto de esta regla es «${subjectType}».`;
};

export const listActions = (subjectType) =>
  acciones().map((a) => ({ ...a, rejection: actionRejection(a, subjectType) }));

/** Valores por defecto de los parámetros de una acción. */
export const defaultParams = (actionKey) => {
  const action = getAction(actionKey);
  if (!action) return {};
  return (action.params || []).reduce((acc, p) => ({ ...acc, [p.key]: p.default ?? "" }), {});
};

export const resetInboxes = () => { _tasks = []; _notifications = []; };
