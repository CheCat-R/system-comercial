/**
 * Los eventos del módulo (§4).
 *
 * ⭐ **No se crea un segundo bus ni un segundo catálogo.** Los seis eventos
 * `integracion.*` viven en `automatizaciones/lib/events.js`, con el mismo
 * contrato que cualquier otro, y salen por el mismo bus. Por eso *"si la
 * facturación electrónica se cae, abrime una tarea y avisá"* es una
 * automatización más, sin código nuevo.
 *
 * Este archivo es sólo el puente: quién los anuncia y con qué sujeto.
 */
import { emit } from "../../automatizaciones/lib/bus";
import { EVENTS } from "../../automatizaciones/lib/events";

/** El sujeto de todos ellos es la conexión, identificada por su puerto. */
const subjectOf = (connection) => ({ type: "connection", id: connection?.portKey || connection?.port || "sin" });

export const INTEGRATION_EVENTS = [
  "integracion.conectada",
  "integracion.degradada",
  "integracion.caida",
  "integracion.llamada.error",
  "integracion.webhook.recibido",
  "integracion.webhook.descartado",
];

/**
 * Mismo mecanismo que `assertEventContracts()` y `assertProviderContracts()`: si
 * un evento que este módulo anuncia no está declarado en el catálogo, no se
 * podría elegir en el builder y la promesa de §4 sería falsa. Se falla al
 * cargar, no cuando alguien intente automatizarlo.
 */
export const assertIntegrationEvents = () =>
  INTEGRATION_EVENTS.filter((key) => !EVENTS[key])
    .map((key) => `${key}: el módulo lo anuncia pero no está en el catálogo de Automatizaciones.`);

export const announce = (key, connection, payload = {}) =>
  emit(key, subjectOf(connection), {
    portKey: connection?.portKey || connection?.port || null,
    portLabel: connection?.port?.label || null,
    provider: connection?.providerKey || connection?.provider || null,
    ...payload,
  });

/**
 * Anuncia el **cambio** de estado, no el estado.
 *
 * Un evento por tick de salud sería ruido: lo que se automatiza es la
 * transición. Es la misma idea que el escáner por flanco de Automatizaciones —
 * "sigue caída" no despierta a nadie.
 */
export const announceStateChange = (previous, next, connection) => {
  if (previous === next) return null;
  if (next === "conectada") return announce("integracion.conectada", connection, { previous });
  if (next === "degradada") {
    return announce("integracion.degradada", connection, {
      previous,
      message: connection?.health?.message || null,
      latencyMs: connection?.health?.latencyMs ?? null,
    });
  }
  if (next === "caida") {
    return announce("integracion.caida", connection, {
      previous,
      message: connection?.health?.message || null,
      consecutiveFailures: connection?.health?.consecutiveFailures ?? null,
    });
  }
  return null;
};
