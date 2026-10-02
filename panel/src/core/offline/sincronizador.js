/**
 * SINCRONIZADOR DE VENTAS OFFLINE — manda la cola local al servidor apenas
 * vuelve la conexión, sin que nadie tenga que tocar nada.
 * ============================================================================
 * Pega directo a `/ventas/offline-lote` con `httpClient` (igual que
 * `cambiosPrecio.js` pega a `/precios/ultimo-cambio`): es infraestructura del
 * CORE, no del módulo Ventas — por eso vive acá y no se apoya en `ventasApi`
 * (el core no importa de `@modules`, ver `app.config.js`).
 *
 * Se dispara en dos momentos:
 *  - Al cargar la página, por si ya hay ventas pendientes de una visita
 *    anterior que quedó offline y se cerró la pestaña sin sincronizar.
 *  - Cada vez que `conectividad` pasa de offline a online.
 *
 * Si la sincronización se corta a mitad de camino (se cae la conexión de
 * nuevo), no se borra nada de la cola: el próximo "volvió internet" reintenta
 * desde cero, y el `idempotencia_offline` del servidor (ver
 * `VentasService::sincronizarOffline`) garantiza que lo ya procesado no se
 * duplique.
 */
import { httpClient } from '../services/httpClient.js';
import { conectividad } from '../services/conectividad.js';
import { listarPendientes, quitarVentaPendiente, marcarError } from './colaVentas.js';

let _snap = { sincronizando: false, ultimoResultado: null };
const _listeners = new Set();

function publicar() {
  _listeners.forEach((l) => l());
}

async function sincronizar() {
  if (_snap.sincronizando) return;
  const pendientes = await listarPendientes();
  if (!pendientes.length) return;

  _snap = { sincronizando: true, ultimoResultado: null };
  publicar();

  try {
    const { resultados, stockNegativo } = await httpClient.post('/ventas/offline-lote', {
      ventas: pendientes.map((f) => ({ idLocal: f.idLocal, ...f.payload })),
    });
    let sincronizadas = 0;
    let fallidas = 0;
    for (const r of resultados) {
      if (r.ok) { await quitarVentaPendiente(r.idLocal); sincronizadas += 1; } else { await marcarError(r.idLocal, r.motivo); fallidas += 1; }
    }
    _snap = { sincronizando: false, ultimoResultado: { sincronizadas, fallidas, stockNegativo, en: Date.now() } };
  } catch {
    // Se cortó de nuevo a mitad de la sincronización: la cola queda intacta
    // (nada se borró todavía) y el próximo "volvió internet" reintenta solo.
    _snap = { sincronizando: false, ultimoResultado: null };
  }
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
};
