/**
 * HALLAZGO (bajo): la guarda `_snap.sincronizando` se pone DESPUÉS de un
 * `await listarPendientes()`, así que dos disparos casi juntos en la misma
 * pestaña (el "volvió internet" + el `intentar()` del login, o el de "Reintentar")
 * pasan los dos la guarda y mandan el MISMO lote dos veces. El servidor no
 * duplica (candado + idempotencia_offline), pero uno de los dos recibe
 * "reintentar"/"yaExistia" y el resumen en pantalla cuenta las ventas dos veces.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { red, drenar, sesionDe } from './entorno.js';

test('dos disparos simultáneos del sincronizador mandan un solo lote', async () => {
  const { agregarVentaPendiente } = await import('@core/offline/colaVentas.js');
  await agregarVentaPendiente({ sucursalId: 1, items: [{ productoId: 1, cantidad: 1 }], pagos: [{ medio: 'efectivo', importe: 100 }] });
  red.responder = (url, init, body) => (url.endsWith('/ventas/offline-lote')
    ? { status: 200, body: { resultados: body.ventas.map((v) => ({ idLocal: v.idLocal, ok: true })), stockNegativo: [] } }
    : { status: 200, body: {} });

  const { sincronizadorOffline } = await import('@core/offline/sincronizador.js');
  await drenar();
  sessionStorage.setItem('crm_sesion', JSON.stringify(sesionDe()));

  await Promise.all([sincronizadorOffline.intentar(), sincronizadorOffline.intentar()]);
  await drenar();

  const lotes = red.llamadas.filter((l) => l.url.endsWith('/ventas/offline-lote')).length;
  assert.equal(lotes, 1, `Se mandó el mismo lote ${lotes} veces.`);
});
