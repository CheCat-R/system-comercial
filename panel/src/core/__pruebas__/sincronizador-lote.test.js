/**
 * HALLAZGO: el sincronizador manda TODA la cola en un solo POST. El servidor
 * acepta como máximo 200 filas (SincronizarOfflineRequest: 'ventas' max:200) y
 * con 201+ contesta 422 al lote entero. El `catch` del sincronizador se lo
 * traga: nada se marca, nada se reintenta solo, y OfflineAlert no muestra nada
 * con conexión. Las ventas quedan trabadas para siempre y el cierre de caja
 * queda bloqueado ("Esperá a que se sincronicen").
 *
 * Mismo agujero con cualquier rechazo del lote ENTERO (500, 403 de licencia
 * en solo lectura, etc.): no hay reintento programado ni aviso.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { red, drenar, sesionDe } from './entorno.js';

function servidorConTopeDe200() {
  red.responder = (url, init, body) => {
    if (!url.endsWith('/ventas/offline-lote')) return { status: 200, body: {} };
    if (body.ventas.length > 200) {
      return { status: 422, body: { message: 'El campo ventas no debe tener más de 200 elementos.' } };
    }
    return { status: 200, body: { resultados: body.ventas.map((v) => ({ idLocal: v.idLocal, ok: true })), stockNegativo: [] } };
  };
}

test('con 201 ventas offline en cola, la sincronización las termina mandando (en tandas de hasta 200)', async () => {
  const { agregarVentaPendiente, contarPendientes } = await import('@core/offline/colaVentas.js');
  for (let i = 0; i < 201; i += 1) {
     
    await agregarVentaPendiente({ sucursalId: 1, items: [{ productoId: 1, cantidad: 1 }], pagos: [{ medio: 'efectivo', importe: 100 }] });
  }
  servidorConTopeDe200();

  const { sincronizadorOffline } = await import('@core/offline/sincronizador.js');
  await drenar();
  sessionStorage.setItem('crm_sesion', JSON.stringify(sesionDe({ sucursalId: 1 })));
  await sincronizadorOffline.intentar();
  await drenar();

  const pendientes = await contarPendientes();
  const estado = sincronizadorOffline.estado();
  assert.equal(
    pendientes, 0,
    `Quedaron ${pendientes} ventas cobradas sin registrar; el servidor rechazó el lote entero (422) `
    + `y el estado que ve la pantalla es ${JSON.stringify(estado)} (sin aviso).`,
  );
});

test('si el lote falla con un 500, se vuelve a intentar solo (hoy queda quieto hasta un F5 o un login)', async () => {
  const { agregarVentaPendiente, listarPendientes } = await import('@core/offline/colaVentas.js');
  // Vaciar lo que haya dejado el test anterior.
  const { quitarVentaPendiente } = await import('@core/offline/colaVentas.js');
  for (const f of await listarPendientes()) await quitarVentaPendiente(f.idLocal);  
  await agregarVentaPendiente({ sucursalId: 1, items: [{ productoId: 1, cantidad: 1 }], pagos: [{ medio: 'efectivo', importe: 100 }] });

  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let intentos = 0;
    red.responder = (url, init, body) => {
      if (!url.endsWith('/ventas/offline-lote')) return { status: 200, body: {} };
      intentos += 1;
      if (intentos === 1) return { status: 500, body: { message: 'Server Error' } };
      return { status: 200, body: { resultados: body.ventas.map((v) => ({ idLocal: v.idLocal, ok: true })), stockNegativo: [] } };
    };
    const { sincronizadorOffline } = await import('@core/offline/sincronizador.js');
    await sincronizadorOffline.intentar();
    await drenar();

    // Pasan 10 minutos con conexión (la red nunca se cortó: no hay "volvió internet" que la dispare).
    for (let i = 0; i < 10; i += 1) {
      mock.timers.tick(60_000);
      await drenar();  
    }
    assert.ok(intentos >= 2, `Después de un 500 hubo ${intentos} intento(s) en 10 minutos: la venta quedó trabada sin aviso.`);
  } finally {
    mock.timers.reset();
  }
});
