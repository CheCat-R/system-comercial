/**
 * Permisos del módulo (§10) — ahora **delegados** al catálogo central.
 *
 * **Se aplican en el `api/`, no escondiendo botones**: si la función se puede
 * llamar igual, el permiso no existe. Eso no cambió; lo que cambió es **dónde se
 * decide**: antes acá había una expresión regular propia sobre el texto del rol,
 * ahora cada función nombra un permiso del catálogo
 * (`seguridad/lib/permissions.js`).
 *
 * Acá el permiso pesa más que en otros módulos: configurar una integración es
 * decidir a qué servicio externo le entregamos datos de clientes y por dónde
 * sale la plata.
 */
import { can } from "../../seguridad/lib/roles";

/** Ver el catálogo y el estado: cualquiera que entre al panel. */
export const canView = (role) => can(role, "integraciones.ver");

/** Ver la consola de tráfico: puede contener datos de clientes. */
export const canViewTraffic = (role) => can(role, "integraciones.trafico");

/** Configurar y probar una conexión. */
export const canConfigure = (role) => can(role, "integraciones.configurar");

/** Habilitar o deshabilitar: cambia por dónde pasa la operación real. */
export const canEnable = (role) => can(role, "integraciones.habilitar");

/** Reintentar una llamada fallida o inyectar un webhook. */
export const canRetry = (role) => can(role, "integraciones.reintentar");

export const PERMISSIONS = [
  { key: "view", label: "Ver el catálogo y el estado", check: canView, permission: "integraciones.ver" },
  { key: "traffic", label: "Ver la consola de tráfico", check: canViewTraffic, permission: "integraciones.trafico" },
  { key: "configure", label: "Configurar y probar", check: canConfigure, permission: "integraciones.configurar" },
  { key: "enable", label: "Habilitar / deshabilitar", check: canEnable, permission: "integraciones.habilitar" },
  { key: "retry", label: "Reintentar una llamada", check: canRetry, permission: "integraciones.reintentar" },
];

export const permissionsOf = (role) =>
  PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: p.check(role) }), {});

export const denial = (what) =>
  `No tenés permiso para ${what}. Configurar integraciones está reservado a Admin (§10).`;
