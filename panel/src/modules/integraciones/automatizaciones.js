/**
 * Lo que Integraciones le ofrece al motor de Automatizaciones.
 *
 * El sujeto se carga **en el momento de evaluar**, como todos: una conexión que
 * se cayó y ya se recuperó no tiene por qué seguir disparando la regla que la
 * esperaba caída.
 */
import { getConnection } from "./api/integrationsApi";
import { CONNECTION_STATES } from "./lib/health";
import { CATEGORIES } from "./lib/catalog";
import { ERROR_TYPES } from "./lib/errors";
import { registrarSujeto } from "../automatizaciones/lib/registry";
import { registrarCondiciones, ENUM_OPS } from "../automatizaciones/lib/conditions";

registrarSujeto("connection", {
  label: "Conexión",
  cargar: (id, { safe }) => {
    const connection = safe(() => getConnection(id));
    return connection ? { connection } : null;
  },
  describir: (subject, c) => c.connection?.port?.label || subject.id,
});

registrarCondiciones({
  "connection.state": {
    label: "Estado de la conexión", group: "Integración",
    subjectTypes: ["connection"], type: "enum", ops: ENUM_OPS,
    source: "integrationsApi — el estado se deriva de la salud, no se fija a mano",
    options: () => Object.values(CONNECTION_STATES).map((x) => ({ value: x.key, label: x.label })),
    get: (c) => c.connection?.state ?? null,
  },
  "connection.category": {
    label: "Categoría de la integración", group: "Integración",
    subjectTypes: ["connection"], type: "enum", ops: ENUM_OPS,
    source: "integraciones/lib/catalog.js",
    options: () => CATEGORIES.map((x) => ({ value: x.key, label: x.label })),
    get: (c) => c.connection?.port?.category ?? null,
  },
  "connection.sensitivity": {
    label: "Sensibilidad del puerto", group: "Integración",
    subjectTypes: ["connection"], type: "enum", ops: ENUM_OPS,
    source: "integraciones/lib/catalog.js — alta = ante error NO cae al fallback",
    options: () => [
      { value: "alta", label: "Alta" }, { value: "media", label: "Media" }, { value: "baja", label: "Baja" },
    ],
    get: (c) => c.connection?.port?.sensitivity ?? null,
  },
  "connection.errorType": {
    label: "Tipo de error de la llamada", group: "Integración",
    subjectTypes: ["connection"], type: "enum", ops: ENUM_OPS,
    source: "el payload del evento — sólo viene en «integracion.llamada.error»",
    hint: "Es la única condición que mira el evento y no el sujeto: el tipo de error es del intento, no de la conexión.",
    options: () => Object.values(ERROR_TYPES).map((x) => ({ value: x.key, label: x.label })),
    get: (c) => c.event?.payload?.errorType ?? null,
  },
});
