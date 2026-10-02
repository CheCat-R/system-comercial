/**
 * CONECTIVIDAD — ¿el sistema le puede hablar a SU API ahora mismo?
 * ============================================================================
 * Deliberadamente NO usa `navigator.onLine`: ese valor dice si la tarjeta de
 * red está conectada a ALGO (un wifi sin internet real sigue siendo "online"
 * para el navegador), no si nuestra API contesta. La señal de verdad es la
 * que ya calcula `httpClient` en cada pedido real: "no contestó nadie"
 * (`crm:sin-respuesta`) vs "contestó algo" (`crm:con-respuesta`, así sea un
 * 4xx — un rechazo del servidor prueba que la red funciona).
 *
 * Mismo molde que `cambiosPrecio.js` (store a mano + `useSyncExternalStore`),
 * pero los listeners del `window` quedan SIEMPRE prendidos, no solo mientras
 * alguien está suscripto: el modo offline del POS (la cola de ventas, más
 * adelante) necesita saber el estado real aunque nadie esté mirando el
 * cartel en ese momento.
 *
 * Mientras está offline, pinguea `/health` (público, sin auth, liviano) cada
 * `INTERVALO_PING_MS` — no para "arreglar" nada, sino para que la vuelta de
 * la conexión se note SOLA, sin que el cajero tenga que tocar nada para que
 * el sistema se entere.
 */
import { httpClient } from './httpClient.js';

const INTERVALO_PING_MS = 5000;

let _offline = false;
let _snap = { offline: false };
const _listeners = new Set();
let _timer = null;

function publicar() {
  _snap = { offline: _offline };
  _listeners.forEach((l) => l());
}

async function ping() {
  try {
    await httpClient.get('/health');
    // El éxito ya dispara 'crm:con-respuesta' desde httpClient → onConRespuesta() de abajo.
  } catch { /* sigue offline: el próximo ping reintenta */ }
}

function asegurarPing() {
  if (_timer) return;
  _timer = setInterval(ping, INTERVALO_PING_MS);
}

function detenerPing() {
  if (!_timer) return;
  clearInterval(_timer);
  _timer = null;
}

function onSinRespuesta() {
  if (_offline) return;
  _offline = true;
  publicar();
  asegurarPing();
}

function onConRespuesta() {
  if (!_offline) return;
  _offline = false;
  publicar();
  detenerPing();
}

try {
  window.addEventListener('crm:sin-respuesta', onSinRespuesta);
  window.addEventListener('crm:con-respuesta', onConRespuesta);
} catch { /* sin window (tests) */ }

export const conectividad = {
  /** `{ offline }` — pensado para `useSyncExternalStore`. */
  estado: () => _snap,
  subscribe(listener) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
};
