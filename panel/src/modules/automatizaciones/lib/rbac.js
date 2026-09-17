/**
 * ⭐ Permisos del módulo (§10) — ahora **delegados** al catálogo central.
 *
 * Antes este archivo resolvía el rol con su propia expresión regular
 * (`/admin|direcci/i`), igual que Analytics e Integraciones con las suyas: tres
 * archivos decidiendo lo mismo por separado, que es como dos pantallas terminan
 * discrepando sobre el mismo rol.
 *
 * Ahora cada función es **una línea que nombra un permiso del catálogo**
 * (`seguridad/lib/permissions.js`). Las firmas no cambiaron, así que el motor y
 * las pantallas siguen llamando exactamente lo mismo.
 *
 * ⭐ Y desde la inversión del registro **ni siquiera se importa Seguridad**: se
 * la pregunta por el enchufe (`registry.js`). Al nivel de archivos nunca hubo
 * ciclo —`lib/roles.js` es hoja—, pero al nivel de **módulos** sí lo había, y
 * era parte de lo que impedía llevarse un módulo solo a otro proyecto.
 *
 * Si nadie enchufa Seguridad, `puede()` **niega**. Un panel sin control de
 * acceso tiene que decirlo explícitamente, no obtenerlo por descuido.
 */
import { seguridad } from "./registry";

const can = (role, permiso) => seguridad().puede(role, permiso);

/** Ver reglas, historial y bandeja de eventos. */
export const canView = (role) => can(role, "automatizaciones.ver");

/** Crear y editar automatizaciones (siempre como borrador). */
export const canEdit = (role) => can(role, "automatizaciones.editar");

/** Publicar y pausar: poner una regla a correr sobre datos reales. */
export const canPublish = (role) => can(role, "automatizaciones.publicar");

/** Usar acciones **sensibles** dentro de una regla. */
export const canUseSensitive = (role) => can(role, "automatizaciones.sensibles");

/** Aprobar o descartar la cola de acciones sensibles. */
export const canApprove = (role) => can(role, "automatizaciones.aprobar");

/** Avanzar el reloj simulado — cambia lo que el motor ejecuta. */
export const canAdvanceClock = (role) => can(role, "automatizaciones.reloj");

export const PERMISSIONS = [
  { key: "view", label: "Ver reglas e historial", check: canView, permission: "automatizaciones.ver" },
  { key: "edit", label: "Crear y editar", check: canEdit, permission: "automatizaciones.editar" },
  { key: "publish", label: "Publicar y pausar", check: canPublish, permission: "automatizaciones.publicar" },
  { key: "sensitive", label: "Usar acciones sensibles", check: canUseSensitive, permission: "automatizaciones.sensibles" },
  { key: "approve", label: "Aprobar acciones sensibles", check: canApprove, permission: "automatizaciones.aprobar" },
  { key: "clock", label: "Avanzar el reloj", check: canAdvanceClock, permission: "automatizaciones.reloj" },
];

/** Qué puede hacer este rol, para que la UI muestre el porqué en vez de un botón muerto. */
export const permissionsOf = (role) =>
  PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: p.check(role) }), {});

/** Mensaje único, para no escribir doce variantes del mismo "no podés". */
export const denial = (what) => `No tenés permiso para ${what}. Está reservado a Admin y Dirección (§10).`;
