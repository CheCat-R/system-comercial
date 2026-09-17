/**
 * ⭐ La política de una llamada saliente.
 *
 * Es lo que el registro de puertos **no** puede hacer, porque el registro es una
 * hoja sin imports y esto necesita el catálogo, la taxonomía de errores, la
 * traza y el bus. El módulo la enchufa con `setPipeline()` al arrancar; sin
 * ella, el registro sigue funcionando como en F2.
 *
 * El orden importa y es todo el contenido de este archivo:
 *
 *   1. ¿Hay clave de idempotencia y ya la vimos?  → se devuelve el primer
 *      resultado y **no se vuelve a llamar** (§2.8).
 *   2. Se llama.
 *   3. ¿La respuesta es de negocio? → es un resultado, no una falla (§2.7).
 *   4. ¿Falló? → ⭐ **cae a la implementación local del módulo**, salvo en
 *      puertos de sensibilidad alta, donde caer sería inventar un cobro o un
 *      CAE: ahí la operación falla y se lo dice al usuario (§2.7).
 *   5. Lo que quedó sin hacer y puede andar más tarde va a la cola (§2.7).
 *
 * Todo lo demás —la traza, las métricas, el evento al bus— es consecuencia de
 * esos cinco pasos.
 */
import { getPort } from "./catalog";
import { note, noteError } from "./ports";
import { recordCall, newCorrelationId } from "./traffic";
import { recall, remember, keyFor } from "./idempotency";
import { retryDecision, enqueue } from "./retries";
import { announce } from "./events";

/**
 * De qué hecho del dominio estamos hablando.
 *
 * El módulo que llama lo puede decir (`meta.subject`); si no lo dice, se deduce
 * del payload por el nombre del identificador. **Es una convención de nombres,
 * no conocimiento del dominio**: el catálogo ya declara `orderId` o
 * `shipmentId` en el `input` de cada puerto, así que acá no se está inventando
 * nada — se está leyendo lo que el contrato ya dijo.
 */
const SUBJECT_FIELDS = [
  ["orderId", "order"],
  ["shipmentId", "shipment"],
  ["documentId", "document"],
  ["accountId", "account"],
  ["audienceId", "account"],
  ["skuId", "sku"],
];

export const subjectFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const hit = SUBJECT_FIELDS.find(([field]) => payload[field] != null);
  return hit ? { type: hit[1], id: String(payload[hit[0]]) } : null;
};

/** Una respuesta de negocio viene como resultado, no como excepción (§2.7). */
const isBusinessOutcome = (result) =>
  Boolean(result && typeof result === "object" && (result.businessOutcome || result.status === "rechazado"));

export const pipeline = (inv) => {
  const port = getPort(inv.portKey);
  const meta = inv.meta || {};
  const operation = meta.operation || inv.portKey;
  const subject = meta.subject || subjectFromPayload(inv.payload);
  const idemKey = keyFor(inv.payload, meta);
  const correlationId = meta.correlationId || newCorrelationId();
  const attempt = meta.attempt || 1;

  const base = {
    portKey: inv.portKey,
    connectionId: inv.connectionId,
    provider: inv.provider,
    mode: inv.mode || null,
    direction: "saliente",
    operation,
    subject,
    idempotencyKey: idemKey,
    correlationId,
    attempt,
    request: inv.payload,
  };

  /* ------------------------------------------------- 1. idempotencia */
  const seen = recall(idemKey);
  if (seen) {
    recordCall({
      ...base,
      status: "replay",
      response: seen.result,
      durationMs: 0,
      errorMessage: `Ya se ejecutó el ${new Date(seen.at).toLocaleString("es-AR")} (${seen.callId}). No se volvió a llamar.`,
    });
    return seen.result;
  }

  /* ---------------------------------------------------- 2. la llamada */
  const started = Date.now();
  let result;
  try {
    result = inv.run();
  } catch (err) {
    const durationMs = Date.now() - started;
    const errorType = err?.type || "remoto";
    noteError(inv.portKey);

    /* ------------------------------- 4. ¿se puede resolver local? */
    // En sensibilidad alta, no: un CAE simulado presentado como real es un
    // problema legal, y un cobro simulado es plata inventada.
    const sensitive = port?.sensitivity === "alta";
    const canFallBack = !sensitive && typeof inv.fallback === "function" && errorType !== "negocio";

    let localResult;
    let fellBack = false;
    if (canFallBack) {
      try {
        localResult = inv.fallback();
        fellBack = true;
        note(inv.portKey, "local");
      } catch {
        fellBack = false;
      }
    }

    const call = recordCall({
      ...base,
      status: fellBack ? "fallback" : "error",
      durationMs,
      errorType,
      errorMessage: err?.message || "Falló sin mensaje.",
      httpStatus: err?.httpStatus ?? null,
      response: fellBack ? localResult : null,
    });

    /* ------------------------------------ 5. ¿va a la cola? */
    const decision = retryDecision({ errorType, resolvedLocally: fellBack, attempt });
    if (decision.queue) {
      enqueue({
        portKey: inv.portKey, connectionId: inv.connectionId, provider: inv.provider,
        payload: inv.payload, meta, errorType, errorMessage: err?.message,
        attempt, correlationId, idempotencyKey: idemKey, subject, operation, callId: call.id,
      });
    } else {
      // Nadie va a volver a intentarlo solo: se anuncia para que se pueda
      // automatizar (abrir una tarea, avisar) y no quede sólo en un log.
      announce("integracion.llamada.error", { portKey: inv.portKey, port, providerKey: inv.provider }, {
        callId: call.id, errorType, message: err?.message || null,
        subject, operation, resolvedLocally: fellBack, reason: decision.reason,
      });
    }

    if (fellBack) return localResult;
    throw err;
  }

  /* --------------------------------- 3. ¿respuesta de negocio? */
  const durationMs = Date.now() - started;
  const business = isBusinessOutcome(result);
  const call = recordCall({
    ...base,
    status: business ? "negocio" : "ok",
    durationMs,
    response: result,
    errorType: business ? "negocio" : null,
    errorMessage: business ? "El proveedor contestó que no. Vuelve al módulo dueño como resultado." : null,
  });

  // Se recuerda el resultado, incluido el de negocio: un rechazo repetido con la
  // misma clave sigue siendo el mismo rechazo, y volver a preguntarlo es
  // volver a intentar el cobro.
  if (idemKey) remember(idemKey, { result, callId: call.id, portKey: inv.portKey });

  return result;
};
