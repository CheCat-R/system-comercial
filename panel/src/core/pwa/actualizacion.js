/**
 * ACTUALIZACIÓN DE LA APP — avisa cuando hay una versión nueva y deja que la
 * persona elija CUÁNDO aplicarla.
 * ============================================================================
 * Antes la app se actualizaba sola (`registerType: 'autoUpdate'`): al detectar
 * una versión nueva recargaba la página sin preguntar. En un mostrador eso es
 * un riesgo real: un cobro a medio hacer, o un ticket armado sin conexión que
 * solo vive en la pantalla, se pierden con la recarga.
 *
 * Ahora la versión nueva se descarga en segundo plano y queda esperando
 * (`registerType: 'prompt'`): se muestra un aviso, y la recarga ocurre cuando
 * la persona toca "Actualizar" — entre una venta y otra.
 *
 * Mismo molde que `conectividad.js`: un módulo con su estado y `subscribe`,
 * para `useSyncExternalStore`. Además de esperar el aviso del navegador,
 * pregunta por una versión nueva cada media hora: un POS abierto todo el día
 * no vuelve a cargar la página, así que sin esto nunca se enteraría.
 */
import { registerSW } from 'virtual:pwa-register';

const INTERVALO_MS = 30 * 60 * 1000;

let _snap = { hayNueva: false, otraVentana: false };
const _listeners = new Set();
let _aplicar = null;
/** ¿Fue ESTA pestaña la que pidió actualizar? Solo esa se recarga sola. */
let _pidioAplicar = false;

function publicar() {
  _listeners.forEach((l) => l());
}

/** Se llama una vez al arrancar la app. Sin service worker (o sin soporte) no hace nada. */
export function iniciarActualizaciones() {
  if (_aplicar) return;
  try {
    _aplicar = registerSW({
      immediate: true,
      onNeedRefresh() {
        _snap = { ..._snap, hayNueva: true };
        publicar();
      },
      /*
       * El service worker nuevo tomó el control de TODAS las pestañas del navegador. Por defecto cada una se
       * recargaba sola, y con ella el POS que otra persona tenía a medio cobrar (un ticket offline vive solo en
       * memoria). Se recarga únicamente la que tocó "Actualizar"; las demás avisan y esperan.
       */
      onNeedReload() {
        if (_pidioAplicar) { window.location.reload(); return; }
        _snap = { hayNueva: false, otraVentana: true };
        publicar();
      },
      onRegisteredSW(_url, registro) {
        if (registro) setInterval(() => { registro.update().catch(() => { /* sin red: se reintenta */ }); }, INTERVALO_MS);
      },
    });
  } catch { /* navegador sin service worker */ }
}

export const actualizaciones = {
  /** `{ hayNueva, otraVentana }` — pensado para `useSyncExternalStore`. */
  estado: () => _snap,
  subscribe(listener) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
  /** Activa la versión nueva y recarga ESTA página. */
  aplicar() {
    _pidioAplicar = true;
    return _aplicar?.(true);
  },
  /** Recarga esta pestaña (la versión nueva ya la aplicó otra ventana). */
  recargar: () => window.location.reload(),
};
