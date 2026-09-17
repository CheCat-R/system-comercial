import "./StatusBadge.css";

// Mapeo de estados comunes (es/en) → tono visual
const statusToneMap = {
  // success
  activo: "success",
  activa: "success",
  "en producción": "success",
  completado: "success",
  completados: "success",
  aprobado: "success",
  pagado: "success",
  aceptada: "success",
  entregado: "success",
  despachado: "success",

  // warning
  "en revisión": "warning",
  "en diseño": "warning",
  pendiente: "warning",
  "pendiente de pago": "warning",
  "reembolso pendiente": "warning",
  pausado: "warning",
  borrador: "warning",
  "sin despachar": "warning",
  enviada: "warning",

  // danger
  inactivo: "danger",
  inactiva: "danger",
  cancelado: "danger",
  rechazado: "danger",
  eliminado: "danger",
  agotado: "danger",
  "sin stock": "danger",
  devuelto: "danger",
  perdida: "danger",
  reembolsado: "danger",

  // info
  "en desarrollo": "info",
  procesando: "info",
  nuevo: "info",
};

const ALIAS = { error: "danger", primary: "info" };

/**
 * Badge de estado reutilizable.
 * @param {string} status  - Nombre del estado (se mapea a un tono)
 * @param {string} tone    - Tono manual: success | warning | danger | info | neutral
 * @param {string} variant - Alias antiguo de `tone` (compatibilidad)
 * @param {string} label   - Etiqueta personalizada
 * @param {boolean} showDot - Muestra el punto (default: true)
 */
const StatusBadge = ({ status, tone, variant, label, showDot = true }) => {
  const displayLabel = label || status || "—";
  const normalized = (status || "").toLowerCase().trim();
  const raw = tone || variant || statusToneMap[normalized] || "neutral";
  const computed = ALIAS[raw] || raw;

  return (
    <span className={`status-badge status-badge--${computed}`}>
      {showDot && <span className="status-badge__dot" />}
      {displayLabel}
    </span>
  );
};

export default StatusBadge;
