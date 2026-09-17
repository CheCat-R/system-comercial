/**
 * El padrón de usuarios.
 *
 * Reemplaza al scaffold que vivía dentro de `modules/usuarios/Usuario.jsx`: un
 * `useState` con cuatro personas y roles de un equipo de desarrollo
 * (`Backend Developer`, `UX/UI Designer`) que no significaban nada para el
 * panel. Acá los roles **son** los del negocio, y son paquetes de permisos.
 *
 * ⭐ **No hay contraseñas.** Ni en claro ni "hasheadas" con algo inventado en el
 * navegador, que sería peor porque parecería seguro. Cada cuenta declara si
 * tiene contraseña definida; verificarla necesita un backend (§10).
 *
 * Los nombres son los que ya aparecen en el resto del panel (crean órdenes de
 * compra, cobran comisiones): el padrón describe a la gente que ya está
 * trabajando adentro del sistema, no a un elenco nuevo.
 */

const daysAgo = (n) => {
  const d = new Date("2026-09-09T09:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export const users = [
  {
    id: "USR-1",
    name: "Camila Ferreyra",
    email: "admin@checat.dev",
    roleKey: "admin",
    status: "activa",
    title: "Dueña del panel",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(0),
    createdAt: daysAgo(400),
    invitedBy: null,
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    /**
     * ⭐ El segundo administrador, agregado en F3 y no por gusto.
     *
     * Cambiar permisos es `con aprobación`, y **quien aprueba no puede ser quien
     * pidió**. Con un solo administrador esa regla no se puede cumplir: la
     * solicitud queda encolada para siempre porque no existe nadie habilitado a
     * firmarla. Un panel con un único administrador tampoco sobrevive a que esa
     * persona se vaya de vacaciones.
     */
    id: "USR-11",
    name: "Sofía Bianchi",
    email: "sofia.bianchi@checat.dev",
    roleKey: "admin",
    status: "activa",
    title: "Administración de sistemas",
    passwordSet: true,
    twoFactor: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(2),
    createdAt: daysAgo(300),
    invitedBy: "USR-1",
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    id: "USR-2",
    name: "Diego Alarcón",
    email: "diego.alarcon@checat.dev",
    roleKey: "direccion",
    status: "activa",
    title: "Dirección comercial",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(1),
    createdAt: daysAgo(380),
    invitedBy: "USR-1",
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    id: "USR-3",
    name: "Martín Sosa",
    email: "martin.sosa@checat.dev",
    roleKey: "operaciones",
    status: "activa",
    title: "Depósito y compras",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(0),
    createdAt: daysAgo(300),
    invitedBy: "USR-1",
    // ⭐ Excepción nominal: un permiso suelto por encima del rol, visible como
    // excepción en vez de diluido en un rol nuevo llamado "Operaciones 2".
    extraPermissions: ["inventario.ajustar_alto"],
    deniedPermissions: [],
  },
  {
    id: "USR-4",
    name: "Lucía Fernández",
    email: "lucia.fernandez@checat.dev",
    roleKey: "operaciones",
    status: "activa",
    title: "Logística",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(2),
    createdAt: daysAgo(240),
    invitedBy: "USR-1",
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    id: "USR-5",
    name: "Valeria Ortiz",
    email: "valeria.ortiz@checat.dev",
    roleKey: "finanzas",
    status: "activa",
    title: "Administración y finanzas",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(1),
    createdAt: daysAgo(210),
    invitedBy: "USR-1",
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    id: "USR-6",
    name: "María López",
    email: "maria.lopez@checat.dev",
    roleKey: "marketing",
    status: "activa",
    title: "Marketing y contenido",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(3),
    createdAt: daysAgo(180),
    invitedBy: "USR-2",
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    id: "USR-7",
    name: "Roberto Díaz",
    email: "roberto.diaz@checat.dev",
    roleKey: "soporte",
    status: "activa",
    title: "Atención al cliente",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(0),
    createdAt: daysAgo(120),
    invitedBy: "USR-2",
    extraPermissions: [],
    // Excepción al revés: se le sacó un permiso que su rol sí incluye.
    deniedPermissions: ["marketing.bajas"],
  },
  {
    id: "USR-8",
    name: "Estudio Contable Riquelme",
    email: "contable@riquelme.com.ar",
    roleKey: "lectura",
    status: "activa",
    title: "Externo · sólo lectura",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(12),
    createdAt: daysAgo(90),
    invitedBy: "USR-5",
    extraPermissions: ["finanzas.ver", "facturacion.ver"],
    deniedPermissions: [],
  },
  {
    id: "USR-9",
    name: "Nicolás Vera",
    email: "nicolas.vera@checat.dev",
    roleKey: "operaciones",
    status: "invitada",
    title: "Depósito · nunca entró",
    passwordSet: false,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: daysAgo(4),
    invitedBy: "USR-1",
    extraPermissions: [],
    deniedPermissions: [],
  },
  {
    id: "USR-10",
    name: "Paula Giménez",
    email: "paula.gimenez@checat.dev",
    roleKey: "marketing",
    status: "suspendida",
    title: "Marketing · licencia",
    passwordSet: true,
    twoFactor: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: daysAgo(45),
    createdAt: daysAgo(150),
    invitedBy: "USR-2",
    extraPermissions: [],
    deniedPermissions: [],
  },
];
