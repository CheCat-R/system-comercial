/**
 * HALLAZGO: la cola offline es UNA por navegador y se manda con la sesión que
 * esté abierta, sin mirar en qué sucursal se cobró cada venta.
 *
 * El servidor IGNORA a propósito el `sucursalId` de la fila (lo decide la
 * sesión: SincronizarOfflineRequest::DEL_SERVIDOR, VentasService.php:892), así
 * que una venta cobrada offline en la sucursal 2 que se sincroniza con una
 * sesión de la sucursal 3 se graba en la 3: su stock, su turno de caja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { red, drenar, sesionDe } from './entorno.js';

test('una venta cobrada offline en la sucursal 2 NO se manda con una sesión parada en la sucursal 3', async () => {
  const { agregarVentaPendiente, contarPendientes } = await import('@core/offline/colaVentas.js');

  // Carla cobró sin conexión en la sucursal 2 (lo que guarda CobroModal.confirmarOffline).
  await agregarVentaPendiente({
    sucursalId: 2,
    cajaSesionId: 77,
    items: [{ productoId: 10, cantidad: 1, precioUnitario: 600 }],
    pagos: [{ medio: 'efectivo', importe: 726 }],
    cobradaEn: new Date().toISOString(),
    cobradoPor: 'Carla',
  });

  red.responder = (url, init, body) => {
    if (url.endsWith('/ventas/offline-lote')) {
      return { status: 200, body: { resultados: body.ventas.map((v) => ({ idLocal: v.idLocal, ok: true })), stockNegativo: [] } };
    }
    return { status: 200, body: {} };
  };

  // Sin sesión al cargar (no sincroniza todavía)...
  const { sincronizadorOffline } = await import('@core/offline/sincronizador.js');
  await drenar();

  // ...y entra Marta, en ESTE navegador, en la sucursal 3 (otra pestaña, o la PC al día siguiente).
  sessionStorage.setItem('crm_sesion', JSON.stringify(sesionDe({ usuarioId: 9, nombre: 'Marta', sucursalId: 3, token: 'tok-marta' })));
  await sincronizadorOffline.intentar();
  await drenar();

  const lotes = red.llamadas.filter((l) => l.url.endsWith('/ventas/offline-lote'));
  const mandadasConSesionAjena = lotes.flatMap((l) => l.body.ventas).filter((v) => v.sucursalId === 2);

  assert.equal(
    mandadasConSesionAjena.length, 0,
    `Se mandaron ${mandadasConSesionAjena.length} venta(s) de la sucursal 2 con la sesión de la sucursal 3: `
    + 'el servidor las graba en la 3 (stock y caja equivocados).',
  );
  assert.equal(await contarPendientes(), 1, 'la venta de la sucursal 2 debería seguir esperando una sesión de la 2');
});
