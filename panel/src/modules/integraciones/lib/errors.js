/**
 * ⭐ Taxonomía de errores y política de reintento (§2.7).
 *
 * Mezclar "la red se cayó" con "la tarjeta fue rechazada" es el error clásico de
 * esta capa: lleva a reintentar lo que nunca va a funcionar y a no reintentar lo
 * que sí.
 *
 * **La distinción que más importa es `negocio` contra el resto.** Una tarjeta
 * rechazada no es una falla de integración: es información de negocio que tiene
 * que volver al módulo dueño como resultado, no como excepción. Tratada como
 * falla, el panel reintenta un cobro que el banco ya contestó.
 */

export const ERROR_TYPES = {
  config: {
    key: "config",
    label: "Configuración incompleta",
    tone: "warning",
    retry: false,
    hint: "Falta un dato de la conexión. No se reintenta: no va a cambiar solo.",
    action: "Completar la configuración.",
  },
  auth: {
    key: "auth",
    label: "Credencial inválida",
    tone: "danger",
    retry: false,
    hint: "Token vencido o revocado. Reintentar sólo gasta cuota.",
    action: "Requiere intervención humana: la conexión pasa a caída.",
  },
  validacion: {
    key: "validacion",
    label: "Dato rechazado por el proveedor",
    tone: "danger",
    retry: false,
    hint: "Le mandamos algo que no acepta. Es un bug nuestro, no del proveedor.",
    action: "Queda en el log con el payload, para corregir el adaptador.",
  },
  transporte: {
    key: "transporte",
    label: "Falla de transporte",
    tone: "warning",
    retry: true,
    hint: "Timeout, DNS o 5xx de infraestructura. Puede andar en el próximo intento.",
    action: "Reintenta con backoff; si persiste, la conexión queda degradada.",
  },
  remoto: {
    key: "remoto",
    label: "Error del proveedor",
    tone: "warning",
    retry: true,
    hint: "El servicio devolvió un error propio.",
    action: "Reintenta acotado y cuenta para el estado degradado.",
  },
  negocio: {
    key: "negocio",
    label: "Respuesta de negocio",
    tone: "info",
    retry: false,
    hint: "⭐ NO es una falla de integración: es una respuesta válida (tarjeta rechazada, CUIT inexistente).",
    action: "Vuelve al módulo dueño como resultado, para que el dominio la procese.",
  },
  limite: {
    key: "limite",
    label: "Límite de uso",
    tone: "warning",
    retry: true,
    hint: "429 o cuota agotada.",
    action: "Encola respetando el Retry-After del proveedor.",
  },
};

export const listErrorTypes = () => Object.values(ERROR_TYPES);

export const getErrorType = (key) => ERROR_TYPES[key] || null;

/** ¿Se reintenta este tipo? */
export const isRetryable = (key) => Boolean(ERROR_TYPES[key]?.retry);

/**
 * Un error del módulo, con su tipo. Lo produce el adaptador traduciendo el error
 * del proveedor con el mapa que declara en su contrato.
 */
export class IntegrationError extends Error {
  constructor(type, message, { httpStatus = null, raw = null, portKey = null } = {}) {
    super(message);
    this.name = "IntegrationError";
    this.type = ERROR_TYPES[type] ? type : "remoto";
    this.httpStatus = httpStatus;
    this.raw = raw;
    this.portKey = portKey;
    this.retryable = isRetryable(this.type);
  }
}

/**
 * Backoff exponencial con tope. Se define acá y no en cada adaptador para que
 * la política sea del panel, no de quien la implemente.
 */
export const BACKOFF = { baseMs: 1000, factor: 3, maxMs: 5 * 60_000, maxAttempts: 4 };

export const nextDelayMs = (attempt) =>
  Math.min(BACKOFF.baseMs * BACKOFF.factor ** Math.max(0, attempt - 1), BACKOFF.maxMs);

/**
 * ⭐ Clave de idempotencia: se deriva del **hecho de dominio**, nunca del
 * intento (§2.8). Sin esto, el reintento automático de un cobro cobra dos veces.
 */
export const idempotencyKey = (subject, operation) =>
  `${subject?.type || "sin"}:${subject?.id || "sin"}:${operation}`;
