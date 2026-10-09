/**
 * el poller de órdenes web le pega a /presupuestos/ordenes/pendientes
 * cada 30 s a TODOS los usuarios (OrdenesWebAlert se monta en MainLayout y se
 * suscribe antes de mirar `webHabilitado`, `esAdmin` o el permiso), y un 403
 * no lo detiene nunca. En plan Emprendedor (no incluye ventas.presupuestos ni
 * ventas.ordenes → middleware `plan:` da 403) o con un rol sin esas claves
 * (fraccionador), son 120 rechazos por hora por pestaña, para siempre.
 * `gastosPendientes.js` ya resolvió esto mismo cortando el reloj en el 403.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { red, drenar, sesionDe } from './entorno.js';

test('después de un 403, el poller de órdenes web deja de pedir', async () => {
  sessionStorage.setItem('crm_sesion', JSON.stringify(sesionDe()));
  red.responder = (url) => (url.includes('/presupuestos/ordenes/pendientes')
    ? { status: 403, body: { message: 'Tu plan no incluye esto.' } }
    : { status: 200, body: {} });

  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const { ordenesWeb } = await import('@core/services/ordenesWeb.js');
    const baja = ordenesWeb.subscribe(() => {});
    await drenar();
    for (let i = 0; i < 4; i += 1) {
      mock.timers.tick(30_000);
      await drenar(); // eslint-disable-line no-await-in-loop
    }
    const pedidos = red.llamadas.filter((l) => l.url.includes('/presupuestos/ordenes/pendientes')).length;
    baja();
    assert.equal(pedidos, 1, `Siguió pidiendo después del 403: ${pedidos} pedidos en 2 minutos.`);
  } finally {
    mock.timers.reset();
  }
});
