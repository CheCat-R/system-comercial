/**
 * SINCRONIZADOR DE VENTAS OFFLINE — manda la cola local al servidor apenas
 * vuelve la conexión, sin que nadie tenga que tocar nada.
 * ============================================================================
 * Pega directo a `/ventas/offline-lote` con `httpClient` (igual que
 * `cambiosPrecio.js` pega a `/precios/ultimo-cambio`): es infraestructura del
 * CORE, no del módulo Ventas — por eso vive acá y no se apoya en `ventasApi`
 * (el core no importa de `@modules`, ver `app.config.js`).
 *
 * Se dispara cuando hay CONEXIÓN Y SESIÓN (sin sesión el servidor contesta 401,
 * y con una cola pendiente eso recargaba el login sin parar):
 *  - Al cargar la página, por si ya hay ventas pendientes de una visita
 *    anterior que quedó offline y se cerró la pestaña sin sincronizar.
 *  - Cada vez que `conectividad` pasa de offline a online.
 *  - Al iniciar sesión (`intentar`).
 *  - Cada minuto, mientras haya ventas esperando algo (por ejemplo, que se abra la caja).
 *
 * Las filas con error (el servidor las rechazó) NO se reenvían solas: quedan
 * para que alguien las mire (ver `OfflineAlert`).
 *
 * Si la sincronización se corta a mitad de camino (se cae la conexión de
 * nuevo), no se borra nada de la cola: el próximo "volvió internet" reintenta
 * desde cero, y el `idempotencia_offline` del servidor (ver
 * `VentasService::sincronizarOffline`) garantiza que lo ya procesado no se
 * duplique.
 */
import { httpClient } from '../services/httpClient.js';
import { conectividad } from '../services/conectividad.js';
import { leerSesion } from '../auth/sesion.js';
import { listarPendientes, quitarVentaPendiente, marcarError, esDeLaSucursal } from './colaVentas.js';

const REINTENTO_MS = 60_000;
/** Espera máxima entre intentos cuando el servidor rechaza el lote entero (500, 403 de licencia, red caída). */
const REINTENTO_MAX_MS = 10 * 60_000;
/** El servidor acepta hasta 200 ventas por pedido (SincronizarOfflineRequest). */
const TANDA = 200;

let _snap = { sincronizando: false, ultimoResultado: null, fallo: false };
const _listeners = new Set();

function publicar() {
  _listeners.forEach((l) => l());
}

let _reintento = null;
let _fallos = 0;
/** La corrida en curso: dos disparos casi juntos (volvió internet + login) comparten UN envío. */
let _enCurso = null;

function sincronizar() {
  if (_enCurso) return _enCurso;
  _enCurso = enviar().finally(() => { _enCurso = null; });
  return _enCurso;
}

async function enviar() {
  const sesion = leerSesion();
  if (!sesion?.token) return;
  // Solo las de ESTA sucursal: el servidor graba cada venta en la sucursal de la sesión que sincroniza, así que
  // una cobrada en la 2 mandada con una sesión de la 3 descontaría el stock y entraría al turno de la 3.
  const sucursalId = sesion.sucursal?.id ?? null;
  const pendientes = (await listarPendientes()).filter((f) => f.estado !== 'error' && esDeLaSucursal(f, sucursalId));
  if (!pendientes.length) return;

  _snap = { sincronizando: true, ultimoResultado: null, fallo: false };
  publicar();

  let sincronizadas = 0;
  let fallidas = 0;
  let esperando = 0;
  let stockNegativo = [];
  let fallo = false;
  try {
    for (let i = 0; i < pendientes.length; i += TANDA) {
      const tanda = pendientes.slice(i, i + TANDA);
      // `sinRedirigir`: un 401 acá (la sesión venció con la cola llena) no recarga la pantalla.
      // eslint-disable-next-line no-await-in-loop
      const res = await httpClient.post('/ventas/offline-lote', {
        ventas: tanda.map((f) => ({ idLocal: f.idLocal, ...f.payload })),
      }, { sinRedirigir: true });
      stockNegativo = stockNegativo.concat(res.stockNegativo ?? []);
      for (const r of res.resultados) {
        /* eslint-disable no-await-in-loop */
        if (r.ok) { await quitarVentaPendiente(r.idLocal); sincronizadas += 1; } else if (r.reintentar) { esperando += 1; } else { await marcarError(r.idLocal, r.motivo); fallidas += 1; }
        /* eslint-enable no-await-in-loop */
      }
    }
  } catch {
    // El lote entero falló (se cortó la red, 500, 403 de licencia): nada se borró, así que se reintenta solo con espera creciente.
    fallo = true;
  }

  _fallos = fallo ? _fallos + 1 : 0;
  _snap = {
    sincronizando: false,
    fallo,
    ultimoResultado: sincronizadas || fallidas ? { sincronizadas, fallidas, stockNegativo, en: Date.now() } : null,
  };
  // Las que esperan algo (caja cerrada, otro equipo procesándolas) y los lotes que fallaron se vuelven a intentar solos.
  clearTimeout(_reintento);
  if (fallo) _reintento = setTimeout(sincronizar, Math.min(REINTENTO_MS * 2 ** (_fallos - 1), REINTENTO_MAX_MS));
  else if (esperando) _reintento = setTimeout(sincronizar, REINTENTO_MS);
  publicar();
}

try {
  conectividad.subscribe(() => { if (!conectividad.estado().offline) sincronizar(); });
  sincronizar();
} catch { /* sin window (tests) */ }

export const sincronizadorOffline = {
  /** `{ sincronizando, ultimoResultado }` — pensado para `useSyncExternalStore`. */
  estado: () => _snap,
  subscribe(listener) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
  /** Para llamar al iniciar sesión o después de reintentar las rechazadas. */
  intentar: () => sincronizar(),
};
