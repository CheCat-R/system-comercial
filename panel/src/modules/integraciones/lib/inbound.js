/**
 * ⭐ De webhook a evento de dominio (§5).
 *
 *   1. Recepción      firma verificada · id de evento del proveedor
 *   2. Deduplicación  ¿ya lo procesamos? (los proveedores reenvían)
 *   3. Traducción     payload externo → evento **del catálogo**
 *   4. Publicación    al bus de Automatizaciones
 *   5. Efecto         el módulo dueño escribe, por su api/
 *
 * Las cuatro reglas, y por qué cada una:
 *
 * 1. **Lo que no se puede traducir se descarta y se registra.** No se inventa un
 *    evento nuevo para acomodar a un proveedor: el catálogo de eventos es el
 *    vocabulario del panel, y estirarlo por cada integración lo vacía de
 *    significado. Un contracargo no existe hoy como hecho del dominio, así que
 *    un webhook de contracargo se descarta *con nombre y apellido*.
 * 2. **Se deduplica por el id del proveedor.** Reenviar es normal; procesar dos
 *    veces, no.
 * 3. **El efecto lo hace el módulo dueño** (ver `lib/effects.js`).
 * 4. **Sin backend no hay endpoint público.** Los webhooks se **simulan** con el
 *    inyector, y la pantalla lo dice. Es la misma honestidad que el reloj
 *    simulado de Automatizaciones: decir qué es simulado y hacerlo demostrable.
 */
import { EVENTS } from "../../automatizaciones/lib/events";
import { emit } from "../../automatizaciones/lib/bus";
import { getProvider } from "./contracts";
import { getPort } from "./catalog";
import { recordCall } from "./traffic";
import { announce } from "./events";
import { applyEffect, getEffect } from "./effects";
// ⭐ Cuando el cambio entra de afuera, **el actor es la conexión** — con la
// referencia del evento del proveedor, para poder ir del asiento del pedido a la
// llamada exacta en la consola de tráfico (MODULO-SEGURIDAD.md §3).
import { withActor } from "../../seguridad/lib/audit";
import { integrationActor } from "../../seguridad/lib/actors";

const LIMIT = 100;
let _inbound = [];
let _seq = 0;
/** `id del proveedor → id de la entrada que lo procesó`. */
let _seen = new Map();

export const DISCARD = {
  sin_conexion: { key: "sin_conexion", label: "Sin conexión", tone: "neutral", hint: "Ese puerto no tiene un proveedor configurado que pueda recibir." },
  sin_entrada: { key: "sin_entrada", label: "El proveedor no declara entrada", tone: "neutral", hint: "Su contrato no define cómo verificar ni cómo traducir lo que llega." },
  firma: { key: "firma", label: "Firma inválida", tone: "danger", hint: "No se pudo verificar que lo mandó quien dice. No se procesa." },
  duplicado: { key: "duplicado", label: "Duplicado", tone: "info", hint: "Ya se procesó ese id de evento. Reenviar es normal; procesar dos veces, no." },
  sin_traduccion: { key: "sin_traduccion", label: "Sin traducción", tone: "warning", hint: "No hay un evento del catálogo que signifique eso. No se inventa uno nuevo para acomodar al proveedor (§5, regla 1)." },
  evento_desconocido: { key: "evento_desconocido", label: "Evento fuera del catálogo", tone: "danger", hint: "El adaptador tradujo a un evento que no existe: es un bug del adaptador." },
};

export const listDiscardReasons = () => Object.values(DISCARD);

const step = (name, ok, detail) => ({ name, ok, detail });

const save = (row) => {
  const entry = { id: `IN-${String(++_seq).padStart(4, "0")}`, at: new Date().toISOString(), ...row };
  _inbound = [entry, ..._inbound].slice(0, LIMIT);
  return entry;
};

/**
 * Recibe un webhook simulado y lo hace recorrer las cinco etapas.
 *
 * Nunca tira: todo camino termina en una entrada registrada, porque el valor de
 * esta pantalla es poder ver **por qué no pasó nada**.
 */
export const receiveWebhook = ({ portKey, connection, raw, signature = null, forceBadSignature = false }) => {
  const port = getPort(portKey);
  const provider = connection?.providerKey ? getProvider(connection.providerKey) : null;
  const steps = [];

  const discard = (reason, detail) => {
    const entry = save({
      portKey, provider: connection?.providerKey || null, raw, signature,
      steps: [...steps, step("descartado", false, detail)],
      discarded: reason, translated: null, effect: null, providerEventId: null,
    });
    recordCall({
      portKey, direction: "entrante", operation: "webhook",
      connectionId: connection?.id || null, provider: connection?.providerKey || null,
      mode: connection?.mode || null, status: "error", errorType: "validacion",
      errorMessage: `${DISCARD[reason].label} — ${detail}`, request: raw, durationMs: 0,
    });
    announce("integracion.webhook.descartado", connection || { portKey, port }, {
      reason, detail, inboundId: entry.id,
    });
    return entry;
  };

  /* ------------------------------------------------------- 1. recepción */
  if (!connection?.providerKey) return discard("sin_conexion", "No hay proveedor configurado en este puerto.");
  if (!provider?.inbound) return discard("sin_entrada", `«${provider?.label || connection.providerKey}» no declara cómo recibir.`);
  steps.push(step("Recepción", true, `Entró por «${port?.label || portKey}» hacia ${provider.label}.`));

  // Se anuncia lo que llegó **antes de traducir**: si algo se descarta más
  // adelante, igual quedó dicho que entró.
  announce("integracion.webhook.recibido", connection, { raw, portKey });

  const signatureOk = !forceBadSignature && provider.inbound.verify(raw, signature, connection.config || {});
  if (!signatureOk) return discard("firma", forceBadSignature ? "Se forzó una firma inválida para probar el rechazo." : "La firma no coincide con la configuración de la conexión.");
  steps.push(step("Verificación de firma", true, "La firma coincide con la configuración de la conexión."));

  /* --------------------------------------------------- 2. deduplicación */
  const providerEventId = provider.inbound.eventId(raw);
  if (!providerEventId) return discard("sin_traduccion", "El payload no trae un id de evento con el que deduplicar.");
  const already = _seen.get(providerEventId);
  if (already) {
    const entry = save({
      portKey, provider: connection.providerKey, raw, signature, providerEventId,
      steps: [...steps, step("Deduplicación", false, `Ya se procesó como ${already}. No se vuelve a aplicar.`)],
      discarded: "duplicado", translated: null, effect: null,
    });
    recordCall({
      portKey, direction: "entrante", operation: "webhook", connectionId: connection.id,
      provider: connection.providerKey, mode: connection.mode, status: "replay",
      errorMessage: `Duplicado de ${already}`, request: raw, durationMs: 0,
    });
    announce("integracion.webhook.descartado", connection, { reason: "duplicado", detail: `Duplicado de ${already}`, inboundId: entry.id });
    return entry;
  }
  steps.push(step("Deduplicación", true, `Id del proveedor: ${providerEventId}. No se había visto.`));

  /* ------------------------------------------------------ 3. traducción */
  const translated = provider.inbound.translate(raw);
  if (!translated?.event) {
    return discard("sin_traduccion", `«${raw?.type || "sin tipo"}» no significa nada en el catálogo del panel. No se inventa un evento para acomodarlo.`);
  }
  if (!EVENTS[translated.event]) {
    return discard("evento_desconocido", `El adaptador tradujo a «${translated.event}», que no está en el catálogo.`);
  }
  steps.push(step("Traducción", true, `«${raw?.type}» → ${translated.event} sobre ${translated.subject?.type} ${translated.subject?.id}`));

  /* ---------------------------------------- 4 y 5. publicación y efecto */
  // ⭐ El orden real es al revés de como suena: **el efecto publica**. El `api/`
  // del módulo dueño emite su propio evento; si Integraciones lo emitiera
  // además, el motor despertaría dos veces por el mismo hecho.
  const effect = withActor(
    integrationActor(portKey, providerEventId),
    () => applyEffect(translated.event, translated)
  );
  let busEvent = null;

  if (effect.applied && effect.emits) {
    steps.push(step("Efecto", true, `${effect.message}. El evento lo publicó el módulo dueño, como siempre.`));
  } else if (effect.applied) {
    busEvent = emit(translated.event, translated.subject, translated.payload);
    steps.push(step("Efecto", true, `${effect.message}. El evento lo publicó el puente porque el api/ del dueño no emite.`));
  } else {
    // Sin efecto aplicado igual se publica: el hecho ocurrió afuera aunque el
    // panel no haya podido reflejarlo, y una automatización puede querer saberlo.
    busEvent = emit(translated.event, translated.subject, translated.payload);
    steps.push(step("Efecto", false, effect.message));
  }

  const entry = save({
    portKey, provider: connection.providerKey, raw, signature, providerEventId,
    steps, discarded: null, translated, effect, busEventId: busEvent?.id || null,
  });
  _seen.set(providerEventId, entry.id);

  recordCall({
    portKey, direction: "entrante", operation: `webhook · ${translated.event}`,
    connectionId: connection.id, provider: connection.providerKey, mode: connection.mode,
    status: effect.applied || !getEffect(translated.event) ? "ok" : "negocio",
    errorMessage: effect.applied ? null : effect.message,
    subject: translated.subject, request: raw, response: translated.payload, durationMs: 0,
  });

  return entry;
};

export const listInbound = ({ portKey, discarded } = {}) =>
  _inbound
    .filter((i) => !portKey || i.portKey === portKey)
    .filter((i) => discarded == null || Boolean(i.discarded) === discarded);

export const getInbound = (id) => _inbound.find((i) => i.id === id) || null;

export const inboundSummary = () => ({
  total: _inbound.length,
  accepted: _inbound.filter((i) => !i.discarded).length,
  discarded: _inbound.filter((i) => i.discarded).length,
  byReason: _inbound.reduce((acc, i) => (i.discarded ? { ...acc, [i.discarded]: (acc[i.discarded] || 0) + 1 } : acc), {}),
});

export const clearInbound = () => { _inbound = []; _seen = new Map(); _seq = 0; };
