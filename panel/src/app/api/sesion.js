/**
 * La sesión del panel, POR PESTAÑA.
 *
 * Vive en memoria y se respalda en `sessionStorage` para sobrevivir un F5 —
 * nunca en `localStorage`: así dos pestañas pueden ser dos personas (la cajera
 * y la encargada en la misma máquina) y cerrar el navegador cierra la sesión.
 * El token es una credencial: cuanto menos viva, mejor.
 */
const CLAVE = "checat.sesion";
const CLAVE_TERMINAL = "checat.terminal";

let _sesion = null;

const leerAlmacen = () => {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const leerSesion = () => {
  if (_sesion === null) _sesion = leerAlmacen();
  return _sesion;
};

export const guardarSesion = (sesion) => {
  _sesion = sesion;
  try {
    if (sesion) sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
    else sessionStorage.removeItem(CLAVE);
  } catch { /* modo privado o storage bloqueado: queda en memoria */ }
};

export const actualizarSesion = (patch) => guardarSesion({ ...(leerSesion() || {}), ...patch });

export const limpiarSesion = () => guardarSesion(null);

export const tokenActual = () => leerSesion()?.token || null;

/**
 * El TOKEN DE TERMINAL sí va en `localStorage`: identifica al EQUIPO ("Caja 1
 * de Express Norte"), no a la persona, y tiene que sobrevivir al cierre del
 * navegador. No da privilegios: sólo fija la sucursal al entrar.
 */
export const leerTokenTerminal = () => {
  try { return localStorage.getItem(CLAVE_TERMINAL) || ""; } catch { return ""; }
};

export const guardarTokenTerminal = (token) => {
  try {
    if (token) localStorage.setItem(CLAVE_TERMINAL, token);
    else localStorage.removeItem(CLAVE_TERMINAL);
  } catch { /* sin storage */ }
};
