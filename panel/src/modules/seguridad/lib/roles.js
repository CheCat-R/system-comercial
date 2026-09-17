/**
 * ⭐ Roles: paquetes de permisos con nombre (§2.3).
 *
 * Un rol no es una etiqueta que cada módulo interpreta: **es un conjunto de
 * permisos**. Antes de esto el rol era texto libre y tres archivos distintos lo
 * resolvían con expresiones regulares propias; agregar un rol obligaba a tocar
 * código en varios módulos y dos módulos podían discrepar sobre el mismo rol.
 *
 * Acá se resuelve una vez y **no se toca código para agregar un rol**.
 *
 * ── ⭐ El puente con lo viejo ────────────────────────────────────────────
 *
 * Las pantallas del panel llaman `canConfigure(user.role)` con una **cadena**
 * (`"Administradora"`). Romper eso de golpe sería reescribir doce módulos en la
 * misma fase. Así que `resolveRoleKey()` acepta tres cosas: la clave del rol, su
 * etiqueta, o el texto libre de siempre — y el texto libre queda marcado como
 * **puente**, para poder listar lo que falta migrar en vez de olvidarlo.
 */
import { PERMISSIONS, getPermission } from "./permissions";
import { getAccountState } from "./accounts";

/* ------------------------------------------------------------- catálogo */

export const ROLES = {
  admin: {
    key: "admin",
    label: "Administrador",
    hint: "Todo, incluida la administración de usuarios, permisos e integraciones.",
    tone: "danger",
    // ⭐ El único con comodín total. Que sea explícito y único hace que se pueda
    // contar cuántas personas lo tienen, que es el número que importa.
    permissions: "*",
  },

  direccion: {
    key: "direccion",
    label: "Dirección",
    hint: "Ve todo, incluidas métricas sensibles y tráfico. Aprueba lo sensible. No administra permisos.",
    tone: "warning",
    permissions: [
      "*.ver",
      "analytics.*",
      "integraciones.trafico",
      "finanzas.aprobar_reembolso", "finanzas.rechazar_reembolso",
      "automatizaciones.aprobar",
      "seguridad.auditoria",
    ],
  },

  operaciones: {
    key: "operaciones",
    label: "Operaciones",
    hint: "Pedidos, logística, inventario y abastecimiento. Escribe en su terreno.",
    tone: "info",
    permissions: [
      "*.ver",
      "pedidos.*",
      "logistica.*",
      "inventario.*",
      "abastecimiento.*",
      "clientes.editar",
    ],
    // Lo que el paquete deja afuera aunque el comodín lo alcance.
    except: ["logistica.tarifas", "inventario.ajustar_alto"],
  },

  finanzas: {
    key: "finanzas",
    label: "Finanzas",
    hint: "Gastos, comisiones, reembolsos y comprobantes. La única que aprueba dinero.",
    tone: "success",
    permissions: [
      "*.ver",
      "finanzas.*",
      "facturacion.*",
      "analytics.sensibles", "analytics.cohortes", "analytics.exportar",
      "logistica.tarifas",
    ],
  },

  marketing: {
    key: "marketing",
    label: "Marketing",
    hint: "Campañas, promociones, audiencias y contenido. No ve costos ni margen.",
    tone: "info",
    permissions: [
      "*.ver",
      "marketing.*",
      "tienda.*",
      "clientes.segmentos", "clientes.editar",
      "analytics.cohortes",
      "automatizaciones.ver", "automatizaciones.editar",
    ],
    // ⭐ Excluido a propósito: el margen y el costo no son de Marketing.
    except: ["analytics.sensibles"],
  },

  soporte: {
    key: "soporte",
    label: "Soporte / CX",
    hint: "Lectura amplia y escritura acotada: abrir una incidencia, pedir una devolución.",
    tone: "neutral",
    permissions: [
      "*.ver",
      "logistica.incidencias",
      "pedidos.devolucion",
      "clientes.editar",
      "marketing.bajas",
    ],
    except: ["analytics.sensibles", "integraciones.trafico"],
  },

  lectura: {
    key: "lectura",
    label: "Sólo lectura",
    hint: "Ve el panel y no escribe. No accede a datos sensibles.",
    tone: "neutral",
    permissions: ["*.ver"],
    except: ["analytics.sensibles", "integraciones.trafico"],
  },
};

export const listRoles = () => Object.values(ROLES);
export const getRole = (key) => ROLES[key] || null;

/* ------------------------------------------------------- el puente viejo */

/**
 * Texto libre → rol. **Es un puente, no el mecanismo.** Cada pantalla que pase a
 * mandar el usuario en vez de la cadena deja de usar esto; `legacyRoleUses()`
 * permite ver cuánto queda.
 */
const LEGACY = [
  [/admin/i, "admin"],
  [/direcci|gerenc|ceo/i, "direccion"],
  [/finanz|contab|tesor/i, "finanzas"],
  [/marketing|comunicac/i, "marketing"],
  [/operac|log[ií]stic|dep[oó]sito|almac[eé]n/i, "operaciones"],
  [/soporte|cx|atenci[oó]n|mesa/i, "soporte"],
];

let _legacyUses = 0;

/** Cuántas veces se resolvió un rol por texto libre en esta sesión. */
export const legacyRoleUses = () => _legacyUses;
export const resetLegacyCount = () => { _legacyUses = 0; };

/**
 * Acepta la clave (`"admin"`), la etiqueta (`"Administrador"`) o el texto libre
 * de siempre (`"Administradora"`). Lo que no matchea cae en `lectura`: **lo que
 * no está permitido, está denegado** (§2.2).
 */
export const resolveRoleKey = (input) => {
  if (!input) return "lectura";
  if (typeof input === "object") return resolveRoleKey(input.roleKey || input.role);

  const raw = String(input).trim();
  if (ROLES[raw]) return raw;

  const byLabel = listRoles().find((r) => r.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return byLabel.key;

  const hit = LEGACY.find(([re]) => re.test(raw));
  _legacyUses += 1;
  return hit ? hit[1] : "lectura";
};

export const roleOf = (input) => ROLES[resolveRoleKey(input)];

/* --------------------------------------------------------- la resolución */

const matches = (pattern, key) => {
  if (pattern === "*") return true;
  if (pattern === key) return true;
  if (pattern.endsWith(".*")) return key.startsWith(`${pattern.slice(0, -1)}`);
  // `*.ver` — la misma acción en todos los módulos. Es lo que hace que "ver
  // todo" no sea una lista de catorce líneas que se desactualiza sola.
  if (pattern.startsWith("*.")) return key.endsWith(pattern.slice(1));
  return false;
};

const grantedByRole = (role, key) => {
  if (!role) return false;
  if (role.except?.some((p) => matches(p, key))) return false;
  if (role.permissions === "*") return true;
  return (role.permissions || []).some((p) => matches(p, key));
};

/**
 * ⭐ La única función que contesta "¿puede?".
 *
 * @param {object|string} actor  usuario, o el rol en texto (puente)
 * @param {string} permissionKey
 *
 * Deniega si: el permiso no existe (lo desconocido es *no*), la cuenta no está
 * activa, o el rol no lo incluye y no hay excepción nominal.
 */
export const can = (actor, permissionKey) => explain(actor, permissionKey).allowed;

/**
 * Lo mismo, pero diciendo **por qué**. La UI usa esto: una acción sin permiso se
 * muestra deshabilitada **con el motivo**, nunca desaparecida (§2.2).
 */
export const explain = (actor, permissionKey) => {
  const permission = getPermission(permissionKey);
  if (!permission) {
    return { allowed: false, reason: `El permiso «${permissionKey}» no existe en el catálogo, y lo que no está declarado se deniega.` };
  }

  const user = typeof actor === "object" && actor ? actor : null;

  // ⭐ Bloquea el ESTADO que impide entrar, no "cualquier estado que no sea
  // activa": una cuenta **invitada** puede entrar y tiene que poder trabajar.
  // Encontrado probando: invitada + rol Finanzas daba 0 permisos efectivos, o
  // sea alguien que entra a un panel vacío sin que nadie le explique por qué.
  if (user?.status && !getAccountState(user.status).canLogin) {
    return { allowed: false, reason: `La cuenta está ${getAccountState(user.status).label.toLowerCase()}.`, blockedAccount: true };
  }

  // ⭐ Excepción nominal: un permiso suelto por encima del rol. Queda visible
  // como excepción en vez de diluirse en un rol nuevo llamado "Operaciones 2".
  if (user?.deniedPermissions?.includes(permissionKey)) {
    return { allowed: false, reason: `«${permission.label}» está revocado para esta cuenta como excepción.`, exception: true };
  }
  if (user?.extraPermissions?.includes(permissionKey)) {
    return { allowed: true, reason: `Permitido como excepción nominal sobre el rol.`, exception: true };
  }

  const role = roleOf(user || actor);
  if (grantedByRole(role, permissionKey)) {
    return { allowed: true, reason: `Incluido en el rol ${role.label}.`, role: role.key };
  }

  return {
    allowed: false,
    role: role.key,
    reason: `«${permission.label}» no está incluido en el rol ${role.label}.`,
  };
};

/** Todos los permisos de un actor, resueltos. Para la matriz y la ficha. */
export const permissionsOf = (actor) =>
  Object.keys(PERMISSIONS).filter((key) => can(actor, key));

/** Qué puede este rol, para pintar la matriz sin pasar por un usuario. */
export const rolePermissions = (roleKey) => {
  const role = getRole(roleKey);
  return Object.keys(PERMISSIONS).filter((key) => grantedByRole(role, key));
};

/* --------------------------------------------------------- validación */

/**
 * Un rol que nombra un permiso inexistente es un permiso que alguien cree tener.
 * Se falla al cargar, igual que con los contratos de eventos y proveedores.
 */
export const assertRoles = () => {
  const broken = [];
  listRoles().forEach((role) => {
    const declared = role.permissions === "*" ? [] : role.permissions || [];
    [...declared, ...(role.except || [])].forEach((pattern) => {
      if (pattern.includes("*")) {
        const hits = Object.keys(PERMISSIONS).some((key) => matches(pattern, key));
        if (!hits) broken.push(`${role.key}: el patrón «${pattern}» no alcanza a ningún permiso.`);
        return;
      }
      if (!PERMISSIONS[pattern]) broken.push(`${role.key}: nombra el permiso inexistente «${pattern}».`);
    });
  });
  return broken;
};
