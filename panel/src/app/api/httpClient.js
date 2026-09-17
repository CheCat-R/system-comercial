/**
 * El ÚNICO cliente HTTP del panel. Toda llamada a la API pasa por acá: base
 * URL, token, timeout, errores normalizados. Cambiar de fetch a otra cosa es
 * editar este archivo.
 *
 * ACÁ VIAJA LA CREDENCIAL: el token de la sesión va en `Authorization: Bearer`.
 */
import { leerSesion, limpiarSesion } from "./sesion";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

const TIMEOUT_MS = 20000;

/** Los endpoints que la API abre a propósito: un 401 acá es "la contraseña está mal", no sesión vencida. */
const PUBLICOS = ["/auth/login", "/auth/opciones", "/health", "/terminales/actual"];

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, sinRespuesta = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    /**
     * NO LLEGÓ RESPUESTA, que no es lo mismo que "el servidor dijo que no". Si
     * el servidor rechazó, la operación NO existe; si no llegó la respuesta,
     * pudo haberse hecho igual. La pantalla tiene que decirlo distinto.
     */
    this.sinRespuesta = sinRespuesta;
  }

  /** Errores de validación por campo (422), si los hay. */
  get errores() {
    return this.data?.errors || null;
  }
}

/**
 * La sesión venció del lado del SERVIDOR. Se limpia lo local y se avisa: el
 * AuthContext escucha el evento y manda al login sin recargar la página.
 * El candado evita el bucle cuando varias llamadas fallan juntas.
 */
let yaAvisado = false;
const sesionVencida = () => {
  if (yaAvisado) return;
  yaAvisado = true;
  limpiarSesion();
  try { window.dispatchEvent(new CustomEvent("checat:sesion-vencida")); } catch { /* sin window */ }
  setTimeout(() => { yaAvisado = false; }, 1000);
};

const esPublico = (path) => PUBLICOS.some((p) => path.startsWith(p));

const armarQuery = (params) => {
  if (!params) return "";
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
};

async function request(method, path, { body, params, signal, sinRedirigir = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = leerSesion()?.token;
  if (token && !esPublico(path)) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}${armarQuery(params)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ApiError(
      err?.message === "timeout" ? "La API tardó demasiado en responder." : "No se pudo conectar con la API.",
      { sinRespuesta: true },
    );
  }
  clearTimeout(timer);

  const texto = await res.text();
  let data = null;
  try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }

  if (res.status === 401 && !esPublico(path) && !sinRedirigir) sesionVencida();

  if (!res.ok) {
    const message = (data && typeof data === "object" && data.message) || `Error ${res.status}`;
    throw new ApiError(message, { status: res.status, data });
  }
  return data;
}

export const httpClient = {
  get: (path, opts) => request("GET", path, opts),
  post: (path, body, opts) => request("POST", path, { ...opts, body: body ?? {} }),
  put: (path, body, opts) => request("PUT", path, { ...opts, body: body ?? {} }),
  patch: (path, body, opts) => request("PATCH", path, { ...opts, body: body ?? {} }),
  delete: (path, opts) => request("DELETE", path, opts),
};

export default httpClient;
