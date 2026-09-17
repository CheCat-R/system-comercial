/**
 * ⚠ NO ES UNA INTEGRACIÓN. Es un **doble de prueba**.
 *
 * No habla con ningún servicio, no tiene nombre de marca, no manda una request a
 * ningún lado. Existe para una sola cosa: poder **ejercitar el marco de punta a
 * punta** —el asistente, la prueba de conexión, el dry-run, los estados de
 * salud, la sustitución del fallback— sin traer una integración real, que es
 * justamente lo que este módulo tiene prohibido hasta que se pida.
 *
 * El archivo arranca con `_` y la UI lo marca en rojo por la misma razón: si
 * mañana alguien mira `providers/` de reojo, tiene que ver de una que acá no hay
 * ninguna integración concreta.
 *
 * Es el mismo recurso que el "emitir un evento a mano" de Automatizaciones o el
 * "simular disparo" de Marketing: una herramienta para probar, no una función
 * del producto.
 *
 * **Se puede borrar en cualquier momento**: es un archivo, nadie lo importa
 * salvo el registro de proveedores.
 */
import { defineProvider } from "../lib/contracts";
import { getPort } from "../lib/catalog";
import { IntegrationError } from "../lib/errors";

/** Un valor con la forma que el puerto declara, para poder cumplir cualquiera. */
const valueFor = (type, field) => ({
  string: `demo-${field}`,
  money: 12345,
  number: 1,
  decimal: 0.0123,
  boolean: true,
  date: new Date().toISOString().slice(0, 10),
  list: [],
  object: {},
}[type] ?? null);

/**
 * Arma la respuesta a partir del `output` del puerto. Así el doble **cumple el
 * contrato de cualquier puerto sin escribir uno por cada uno** — y de paso
 * demuestra que la validación de contrato sirve: si el puerto pide un campo, acá
 * aparece.
 */
const respond = (portKey) => {
  const port = getPort(portKey);
  const out = {};
  Object.entries(port?.output || {}).forEach(([k, t]) => { out[k] = valueFor(t, k); });
  return out;
};

/**
 * Firma de un webhook entrante.
 *
 * Un proveedor real firma con HMAC sobre el cuerpo crudo y una clave compartida;
 * acá alcanza con algo determinístico, porque lo que se está probando no es la
 * criptografía sino **que un webhook sin firma válida no se procesa**. El
 * inyector puede mandar la firma correcta o forzar una inválida.
 */
export const signFor = (raw) => `sig_${String(raw?.id || "").split("").reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100000, 7)}`;

/**
 * ⭐ Fallas que **no** aparecen en el chequeo de salud.
 *
 * Apareció probando F3 y dice algo verdadero: si el único modo de fallar fuera
 * que el `healthCheck` diera mal, no habría forma de ver la cola de reintentos,
 * porque el asistente **no deja habilitar sin una prueba exitosa**. Y es el caso
 * más común de la vida real: el proveedor contesta el ping y se le caen las
 * operaciones.
 */
const FALLAS_POR_PUERTO = 2;
const _fallas = new Map();
export const reiniciarIntermitencia = () => { _fallas.clear(); };

export const demoProvider = defineProvider({
  key: "_demo",
  label: "Doble de prueba (no es una integración)",
  port: "*",
  demo: true,
  docsUrl: null,
  modes: ["simulado", "sandbox"],

  input: {},
  output: {},
  events: [],

  config: [
    { key: "etiqueta", type: "text", label: "Etiqueta", default: "demo", hint: "Sólo para reconocerlo en el log." },
    { key: "latenciaMs", type: "number", label: "Latencia simulada (ms)", default: 0, min: 0, max: 5000 },
    {
      key: "comportamiento", type: "select", label: "Cómo responde", default: "ok",
      options: [
        { value: "ok", label: "Responde bien" },
        { value: "lento", label: "Responde lento (deja la conexión degradada)" },
        { value: "transporte", label: "Falla de transporte (reintenta)" },
        { value: "auth", label: "Credencial inválida (no reintenta, cae)" },
        { value: "negocio", label: "Respuesta de negocio (no es una falla)" },
        { value: "intermitente", label: "El chequeo pasa pero las llamadas fallan las primeras 2 veces" },
      ],
      hint: "Sirve para ver cada rama de la taxonomía de errores sin depender de que un servicio real falle.",
    },
    { key: "verboso", type: "switch", label: "Registrar el payload completo", default: false },
    { key: "claveDemo", type: "secret", label: "Clave de ejemplo", required: false,
      hint: "No se guarda: sirve para ver cómo se maneja un secreto (§2.5)." },
  ],

  state: {
    healthCheck: (config = {}) => {
      const c = config.comportamiento || "ok";
      if (c === "auth") return { ok: false, message: "Credencial inválida (simulada).", latencyMs: 40 };
      if (c === "lento") return { ok: true, message: "Responde, pero lento.", latencyMs: 4200 };
      if (c === "transporte") return { ok: false, message: "Timeout (simulado).", latencyMs: 5000 };
      return { ok: true, message: "Doble de prueba respondiendo.", latencyMs: Number(config.latenciaMs) || 12 };
    },
  },

  errors: {
    timeout: "transporte",
    "401": "auth",
    "429": "limite",
    rechazado: "negocio",
  },

  logs: { redact: ["claveDemo"] },

  // ⭐ El doble NO soporta idempotencia nativa, y lo dice. Entonces el panel la
  // simula guardando el resultado por clave — una garantía **más débil**, que la
  // ficha muestra tal cual en vez de esconderla (§2.8).
  idempotent: false,

  /**
   * ⭐ La entrada (§5). El adaptador declara tres cosas y nada más:
   * cómo se verifica, cuál es el id del proveedor (para deduplicar) y **a qué
   * evento del catálogo traduce**. La traducción es el corazón del asunto: lo
   * que no tiene evento propio se descarta, no se acomoda.
   */
  inbound: {
    // El panel le pide la firma al adaptador para poder simular el envío: no
    // sabe firmar por él.
    signFor,
    verify: (raw, signature) => signature === signFor(raw),
    eventId: (raw) => raw?.id || null,
    translate: (raw) => {
      const data = raw?.data || {};
      switch (raw?.type) {
        case "payment.approved":
          return {
            event: "pedido.pagado",
            subject: { type: "order", id: String(data.orderId) },
            payload: { orderId: String(data.orderId), total: data.amount, last4: data.last4 },
          };
        case "payment.rejected":
          return {
            event: "pedido.pago_rechazado",
            subject: { type: "order", id: String(data.orderId) },
            payload: { orderId: String(data.orderId), reason: data.reason || "Rechazado por la pasarela" },
          };
        case "shipment.delivered":
          return {
            event: "envio.entregado",
            subject: { type: "shipment", id: String(data.shipmentId) },
            payload: { shipmentId: String(data.shipmentId), receivedBy: data.receivedBy || null },
          };
        default:
          // ⭐ Devolver null es la respuesta correcta, no una falta: significa
          // "esto no significa nada en el panel". Inventar un evento acá sería
          // meter el vocabulario del proveedor adentro del dominio.
          return null;
      }
    },
  },

  async: false,

  call: (payload, { portKey, config = {} } = {}) => {
    const c = config.comportamiento || "ok";
    if (c === "intermitente") {
      // Se cuenta **por puerto**: si el contador fuera del doble entero, probar
      // una capacidad dejaría a la siguiente sin fallas que mostrar.
      const restantes = _fallas.has(portKey) ? _fallas.get(portKey) : FALLAS_POR_PUERTO;
      if (restantes > 0) {
        _fallas.set(portKey, restantes - 1);
        throw new IntegrationError(
          "transporte",
          `Timeout simulado (${restantes - 1 === 1 ? "queda 1 falla" : `quedan ${restantes - 1} fallas`} antes de que ande).`,
          { portKey }
        );
      }
    }
    if (c === "transporte") throw new IntegrationError("transporte", "Timeout simulado por el doble de prueba.", { portKey });
    if (c === "auth") throw new IntegrationError("auth", "Credencial inválida (simulada).", { portKey });
    if (c === "negocio") {
      // ⭐ Una respuesta de negocio NO es una excepción: vuelve como resultado.
      return { ...respond(portKey), status: "rechazado", businessOutcome: "rechazado" };
    }
    return respond(portKey);
  },
});
