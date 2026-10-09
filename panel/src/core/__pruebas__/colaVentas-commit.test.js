/* eslint-env node */
/**
 * HALLAZGO: `db.js` resuelve put/delete con el `success` del PEDIDO, no con el
 * `complete` de la TRANSACCIÓN. Según la especificación de IndexedDB, una
 * transacción readwrite puede abortar DESPUÉS de que el pedido dio success
 * (típico: QuotaExceededError al commitear, disco lleno, el navegador cerrando
 * la conexión). En ese caso `agregarVentaPendiente` ya devolvió el idLocal, el
 * POS dio la venta por cobrada y entregó el ticket provisorio, y la venta no
 * quedó en ningún lado: ni en el servidor ni en la cola.
 *
 * El IndexedDB del test es un doble en memoria que respeta ese orden de
 * eventos (ver entorno.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idb } from './entorno.js';

test('si la transacción que guarda la venta offline aborta al commitear, agregarVentaPendiente falla (no la da por guardada)', async () => {
  const { agregarVentaPendiente, contarPendientes } = await import('@core/offline/colaVentas.js');
  // Abre la base una vez (sin abortar) para que la prueba toque solo el put de la venta.
  await contarPendientes();

  idb.abortarProximoCommit = true;
  let resultado;
  let error = null;
  try {
    resultado = await agregarVentaPendiente({ sucursalId: 1, items: [{ productoId: 1, cantidad: 1 }], pagos: [{ medio: 'efectivo', importe: 726 }] });
  } catch (e) { error = e; }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const enCola = await contarPendientes();
  assert.ok(
    error || enCola === 1,
    `agregarVentaPendiente devolvió "${resultado}" (venta "guardada") pero la cola tiene ${enCola} filas: la venta cobrada se perdió sin aviso.`,
  );
});
