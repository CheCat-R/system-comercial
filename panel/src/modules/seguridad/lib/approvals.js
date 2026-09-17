/**
 * ⭐ La cola de aprobación de Seguridad (§2.10, regla 2).
 *
 * **Un segundo par de ojos.** Reembolsar, anular un comprobante, cambiarle el rol
 * a alguien, pasar una integración a producción: cosas que mueven plata o dan
 * poder, y que no deberían depender de que una sola persona esté segura.
 *
 * ── ⭐ Por qué no es la cola de Automatizaciones ────────────────────────
 *
 * `automatizaciones/lib/approvals.js` resuelve el mismo problema una capa más
 * arriba: una **regla** propuso una acción del catálogo del motor y alguien la
 * confirma. Ésta vive una capa más abajo — en la operación misma — y por eso
 * atrapa también lo que **una persona** pide a mano, que la otra nunca ve.
 *
 * Se comparte lo que importa, que es el mecanismo, no el archivo:
 *
 *   propone → revalida al aprobar → ejecuta ahora, contra el estado de ahora
 *
 * Si el mundo cambió entre el pedido y la firma, la propuesta queda `obsoleta`
 * con el motivo. Aprobar **no** es reproducir una decisión vieja.
 *
 * ── ⭐ Quien aprueba no puede ser quien pidió ───────────────────────────
 *
 * Segregación mínima de funciones, y se verifica acá y no en la pantalla: un
 * botón deshabilitado se saltea llamando a la función.
 *
 * Hoja sin dependencias fuera de `seguridad/lib`.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

export const APPROVAL_STATES = {
  pendiente: { key: "pendiente", label: "Pendiente de un segundo par de ojos", tone: "warning" },
  aprobada: { key: "aprobada", label: "Aprobada y ejecutada", tone: "success" },
  rechazada: { key: "rechazada", label: "Rechazada", tone: "neutral" },
  obsoleta: { key: "obsoleta", label: "Obsoleta", tone: "neutral" },
  fallida: { key: "fallida", label: "Falló al ejecutarse", tone: "danger" },
};

export const getApprovalState = (key) => APPROVAL_STATES[key] || APPROVAL_STATES.pendiente;

let _queue = [];
let _seq = 0;

/**
 * `run` y `revalidate` son **cierres del módulo dueño**: Seguridad no sabe
 * cancelar un pedido ni quiere aprender. Guarda la intención y la vuelve a
 * ejecutar por el mismo camino que la habría ejecutado la persona.
 */
export const enqueue = ({
  action, subject, reason, preview = null, meta = null, ref = null,
  requestedBy, run, revalidate = null,
}) => {
  const item = {
    id: `APS-${String(++_seq).padStart(4, "0")}`,
    action, subject, reason, preview, meta, ref,
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: "pendiente",
    resolvedBy: null,
    resolvedAt: null,
    resolution: null,
    _run: run,
    _revalidate: revalidate,
  };
  _queue = [item, ..._queue];
  return item;
};

/** Los cierres del módulo dueño no salen de acá: la UI ve la intención, no el código. */
const strip = (item) => {
  const copy = { ...item };
  delete copy._run;
  delete copy._revalidate;
  return copy;
};

export const listApprovals = ({ status, action, requestedById } = {}) =>
  _queue
    .filter((p) => !status || p.status === status)
    .filter((p) => !action || p.action === action)
    .filter((p) => !requestedById || p.requestedBy?.id === requestedById)
    .map(strip);

export const getApproval = (id) => {
  const item = _queue.find((p) => p.id === id);
  return item ? strip(item) : null;
};

export const countPendingApprovals = () => _queue.filter((p) => p.status === "pendiente").length;

const patch = (id, changes) => {
  _queue = _queue.map((p) => (p.id === id ? { ...p, ...changes } : p));
  return getApproval(id);
};

/** ⭐ La segregación, dicha una sola vez y con el porqué. */
export const segregationError = (item, approver) => {
  if (!approver) return "No hay nadie identificado aprobando: la firma no valdría nada.";
  if (approver.kind !== "user") {
    return "Sólo una persona puede aprobar. Una automatización o una integración que se aprueba a sí misma no es un segundo par de ojos.";
  }
  if (item.requestedBy?.kind === "user" && item.requestedBy.id === approver.id) {
    return "Quien lo pidió no puede aprobarlo. Ése es el punto de pedir una aprobación.";
  }
  return null;
};

/**
 * Aprueba: revalida contra el estado de **ahora** y recién ahí ejecuta.
 *
 * @param {object} approver  el actor que firma
 * @returns {{ok:boolean, approval?:object, error?:string, value?:any}}
 */
export const approveRequest = (id, { approver, note = "" } = {}) => {
  const item = _queue.find((p) => p.id === id);
  if (!item) return { ok: false, error: "Esa solicitud no existe." };
  if (item.status !== "pendiente") return { ok: false, error: "Esa solicitud ya se resolvió." };

  const blocked = segregationError(item, approver);
  if (blocked) return { ok: false, error: blocked, segregation: true };

  // --- revalidación: ¿sigue siendo posible? ---
  const stale = item._revalidate ? item._revalidate() : null;
  if (stale) {
    patch(id, {
      status: "obsoleta", resolvedBy: approver, resolvedAt: new Date().toISOString(),
      resolution: stale,
    });
    return { ok: false, error: `Quedó obsoleta: ${stale}`, obsolete: true };
  }

  try {
    const value = item._run();
    const saved = patch(id, {
      status: "aprobada", resolvedBy: approver, resolvedAt: new Date().toISOString(),
      resolution: note.trim() || "Aprobada.",
    });
    return { ok: true, approval: saved, value };
  } catch (err) {
    patch(id, {
      status: "fallida", resolvedBy: approver, resolvedAt: new Date().toISOString(),
      resolution: err.message,
    });
    return { ok: false, error: err.message };
  }
};

export const rejectRequest = (id, { approver, note = "" } = {}) => {
  const item = _queue.find((p) => p.id === id);
  if (!item) return { ok: false, error: "Esa solicitud no existe." };
  if (item.status !== "pendiente") return { ok: false, error: "Esa solicitud ya se resolvió." };

  const blocked = segregationError(item, approver);
  if (blocked) return { ok: false, error: blocked, segregation: true };
  if (!note.trim()) return { ok: false, error: "Rechazar también necesita un motivo escrito." };

  patch(id, {
    status: "rechazada", resolvedBy: approver, resolvedAt: new Date().toISOString(),
    resolution: note.trim(),
  });
  return { ok: true, approval: getApproval(id) };
};

export const approvalsSummary = () => ({
  pending: _queue.filter((p) => p.status === "pendiente").length,
  approved: _queue.filter((p) => p.status === "aprobada").length,
  rejected: _queue.filter((p) => p.status === "rechazada").length,
  stale: _queue.filter((p) => p.status === "obsoleta").length,
  failed: _queue.filter((p) => p.status === "fallida").length,
  total: _queue.length,
});
