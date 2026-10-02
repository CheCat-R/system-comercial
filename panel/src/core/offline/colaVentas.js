/**
 * LA COLA DE VENTAS OFFLINE — cada fila es un ticket que el POS armó y cobró
 * SIN CONEXIÓN, esperando para mandarse al servidor (`/ventas/offline-lote`,
 * ver `VentasService::sincronizarOffline`) en cuanto vuelva internet.
 *
 * Vive en IndexedDB (no en memoria): si se cierra la pestaña o se recarga la
 * página a mitad del corte, la venta YA cobrada no se pierde.
 *
 * `payload` tiene la MISMA forma que ya arma el POS para confirmar una venta
 * en línea (items, pagos, clienteId, etc.) — nada nuevo que inventar ahí,
 * `sincronizarOffline` lo pasa tal cual a `VentasService::create()`.
 */
import { put, eliminar, listarTodo } from './db.js';

const CAJON = 'ventasPendientes';

function idLocalNuevo() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  // Navegador sin `randomUUID` (muy viejo): igual sirve, solo hace falta que sea único acá.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Guarda una venta recién cobrada offline. Devuelve el `idLocal` (el ticket provisorio se identifica con esto). */
export async function agregarVentaPendiente(payload) {
  const idLocal = idLocalNuevo();
  await put(CAJON, {
    idLocal, payload, creadoEn: Date.now(), estado: 'pendiente', ultimoError: null,
  });
  return idLocal;
}

/** Todas las pendientes, de la más vieja a la más nueva — el orden en que se cobraron. */
export async function listarPendientes() {
  const filas = await listarTodo(CAJON);
  return filas.sort((a, b) => a.creadoEn - b.creadoEn);
}

export async function contarPendientes() {
  return (await listarPendientes()).length;
}

/** El servidor ya la confirmó: sale de la cola, el registro real vive allá. */
export async function quitarVentaPendiente(idLocal) {
  await eliminar(CAJON, idLocal);
}

/**
 * El servidor la rechazó (no debería pasar si offline solo vende en
 * efectivo, pero puede — un dato mal formado, por ejemplo): queda en la cola
 * con el motivo, para que alguien la revise a mano en vez de perderla.
 */
export async function marcarError(idLocal, motivo) {
  const filas = await listarTodo(CAJON);
  const fila = filas.find((f) => f.idLocal === idLocal);
  if (!fila) return;
  await put(CAJON, { ...fila, estado: 'error', ultimoError: motivo });
}
