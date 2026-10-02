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

let _snap = { hayNueva: false };
const _listeners = new Set();
let _aplicar = null;

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
        _snap = { hayNueva: true };
        publicar();
      },
      onRegisteredSW(_url, registro) {
        if (registro) setInterval(() => { registro.update().catch(() => { /* sin red: se reintenta */ }); }, INTERVALO_MS);
      },
    });
  } catch { /* navegador sin service worker */ }
}

export const actualizaciones = {
  /** `{ hayNueva }` — pensado para `useSyncExternalStore`. */
  estado: () => _snap,
  subscribe(listener) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
  /** Activa la versión nueva y recarga la página. */
  aplicar: () => _aplicar?.(true),
};
