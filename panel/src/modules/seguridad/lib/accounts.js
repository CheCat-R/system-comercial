/**
 * Seguridad de cuentas (§2.6). Funciones puras: el estado vive en el padrón.
 *
 * ⭐ **El panel no guarda contraseñas.** Ni en claro ni "hasheadas" con algo
 * inventado en el navegador, que sería peor porque parecería seguro. Se valida
 * la política, se marca la cuenta como verificada y se dice qué falta (§10) —
 * la misma honestidad que "el panel no guarda secretos" en Integraciones.
 */

export const ACCOUNT_STATES = {
  activa: {
    key: "activa", label: "Activa", tone: "success",
    canLogin: true, hint: "Puede entrar y operar según su rol.",
  },
  invitada: {
    key: "invitada", label: "Invitada", tone: "info",
    canLogin: true, hint: "Se creó por invitación y todavía no entró nunca.",
  },
  suspendida: {
    key: "suspendida", label: "Suspendida", tone: "warning",
    canLogin: false, hint: "Alguien la apagó a mano. Se puede reactivar sin perder el rastro.",
  },
  bloqueada: {
    key: "bloqueada", label: "Bloqueada", tone: "danger",
    canLogin: false, hint: "Demasiados intentos fallidos. Se desbloquea sola al vencer el plazo.",
  },
};

export const getAccountState = (key) => ACCOUNT_STATES[key] || ACCOUNT_STATES.suspendida;

/* ------------------------------------------------- política de contraseña */

export const PASSWORD_POLICY = {
  minLength: 10,
  forbidsCommon: true,
  forbidsEmail: true,
  hint: "Al menos 10 caracteres, que no sea una contraseña común y que no contenga tu email.",
};

/** Las que aparecen en cualquier lista de las más usadas. No pretende ser exhaustiva. */
const COMMON = [
  "password", "contrasena", "contraseña", "123456", "12345678", "123456789", "1234567890",
  "qwerty", "abc123", "admin", "administrador", "letmein", "welcome", "iloveyou",
  "monkey", "dragon", "football", "111111", "000000", "password1", "passw0rd",
];

/**
 * Valida y **puntúa mientras se escribe**. Devolver los problemas en vez de un
 * booleano es lo que permite mostrar la fuerza en vivo, en lugar de un error
 * después de enviar el formulario.
 */
export const checkPassword = (password = "", { email = "" } = {}) => {
  const value = String(password);
  const problems = [];

  if (value.length < PASSWORD_POLICY.minLength) {
    problems.push(`Le faltan ${PASSWORD_POLICY.minLength - value.length} caracteres.`);
  }
  if (COMMON.includes(value.toLowerCase())) {
    problems.push("Es una de las contraseñas más usadas del mundo.");
  }
  const local = String(email).split("@")[0].toLowerCase();
  if (local && local.length > 2 && value.toLowerCase().includes(local)) {
    problems.push("No puede contener tu email.");
  }

  // Puntaje sólo informativo: variedad y largo. No sustituye a la política.
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  const score = Math.min(4, Math.floor(value.length / 6) + variety - 1);

  return {
    ok: problems.length === 0,
    problems,
    score: Math.max(0, score),
    label: ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte"][Math.max(0, Math.min(4, score))],
  };
};

/* ---------------------------------------------------- intentos fallidos */

export const LOCKOUT = { maxAttempts: 5, minutes: 15 };

export const isLocked = (user, at = Date.now()) => {
  if (!user?.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > at;
};

export const lockRemainingMinutes = (user, at = Date.now()) => {
  if (!isLocked(user, at)) return 0;
  return Math.ceil((new Date(user.lockedUntil).getTime() - at) / 60000);
};

/**
 * ⭐ El mensaje es el mismo exista o no el email.
 *
 * Decir "ese usuario no existe" le confirma el padrón a cualquiera que pruebe
 * direcciones. Es la diferencia entre un error útil y un error que ayuda al que
 * no debería estar ahí.
 */
export const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos.";

/** Aplica un intento fallido y devuelve el parche para el usuario. */
export const applyFailure = (user, at = Date.now()) => {
  const failed = (user?.failedAttempts || 0) + 1;
  if (failed >= LOCKOUT.maxAttempts) {
    return {
      failedAttempts: 0,
      status: "bloqueada",
      lockedUntil: new Date(at + LOCKOUT.minutes * 60000).toISOString(),
    };
  }
  return { failedAttempts: failed };
};

/** El login exitoso limpia el contador y saca a la cuenta de «invitada». */
export const applySuccess = (user) => ({
  failedAttempts: 0,
  lockedUntil: null,
  status: user?.status === "invitada" ? "activa" : user?.status,
  lastLoginAt: new Date().toISOString(),
});
