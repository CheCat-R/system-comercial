/**
 * tocar "Actualizar" en UNA pestaña recarga TODAS las pestañas del
 * sistema en ese navegador — incluida la del POS con un ticket armado offline
 * (que vive solo en memoria) — aunque en esa pestaña nadie haya tocado nada,
 * o haya tocado "Después".
 *
 * Por qué: `actualizacion.js` llama a `registerSW` sin `onNeedReload`. El
 * register.js de vite-plugin-pwa (modo prompt), al ver un SW en espera, agrega
 * un oyente de `controlling` que hace `window.location.reload()` si
 * `event.isUpdate`. El Workbox real despacha `controlling` en CADA pestaña
 * cuando el SW nuevo toma el control (skipWaiting pedido por otra pestaña), con
 * `isUpdate` = "esta página ya tenía SW al cargar" → true en todas.
 *
 * Este test usa el register.js REAL de vite-plugin-pwa y un doble de
 * workbox-window que reproduce ese despacho (ver fakeWorkbox.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventana, drenar } from './entorno.js';

test('la pestaña del POS no se recarga sola porque OTRA pestaña aplicó la actualización', async () => {
  // Esta pestaña cargó con un SW ya instalado (el caso normal de un POS abierto todo el día).
  navigator.serviceWorker.controller = { scriptURL: '/sw.js' };

  const { instancias } = await import('workbox-window');
  const { iniciarActualizaciones, actualizaciones } = await import('@core/pwa/actualizacion.js');
  iniciarActualizaciones();
  await drenar();
  const wb = instancias[0];
  assert.ok(wb, 'se registró el service worker');

  // Otra pestaña encontró la versión nueva: acá llega como SW externo instalado y en espera.
  wb.emitir('installed', { isExternal: true });
  wb.emitir('waiting', { isExternal: true });
  assert.equal(actualizaciones.estado().hayNueva, true, 'esta pestaña muestra el aviso');

  // La cajera de ESTA pestaña no toca nada (o toca "Después"). En la OTRA pestaña tocan "Actualizar":
  // el SW nuevo hace skipWaiting y toma el control de todas las pestañas.
  assert.equal(wb.skipWaitingEnviado, false, 'esta pestaña no pidió actualizar');
  wb.emitirControllerChange({ isExternal: true });

  assert.equal(
    ventana.recargas, 0,
    `La pestaña se recargó ${ventana.recargas} vez/veces sin que nadie la tocara: el ticket en curso se pierde.`,
  );
});
