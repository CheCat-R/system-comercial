/**
 * AVISO DE RESPALDOS — cuántas cosas del respaldo piden atención.
 * ============================================================================
 * Alimenta la insignia del módulo Sistema en el menú: se prende cuando hace
 * 7 días o más que nadie baja una copia externa, o cuando la copia diaria
 * automática (Pymes y Corporativo) falló o dejó de generarse.
 *
 * Mismo molde que `ordenesWeb.js`: un poller que arranca recién cuando alguien
 * se suscribe, se apaga solo sin oyentes y tolera la API caída. Acá el ritmo
 * es lento (media hora): es un estado que cambia de a días, no de a minutos.
 *
 * El servidor le contesta "0" a quien no tiene el permiso de Respaldos (no un
 * 403), así que el módulo puede engancharse para cualquier usuario que vea
 * Sistema sin llenar la consola de errores.
 */
import { httpClient } from './httpClient.js';

const INTERVALO_MS = 30 * 60 * 1000;

let _count = 0;
let _timer = null;
const _listeners = new Set();

async function tick() {
  try {
    const r = await httpClient.get('/sistema/respaldos/estado');
    const n = Number(r?.problemas) || 0;
    if (n !== _count) {
      _count = n;
      _listeners.forEach((l) => l());
    }
  } catch { /* API caída: el próximo tick reintenta */ }
}

function asegurarPolling() {
  if (_timer) return;
  tick();
  _timer = setInterval(tick, INTERVALO_MS);
}

function detenerPolling() {
  if (!_timer) return;
  clearInterval(_timer);
  _timer = null;
}

export const respaldoAviso = {
  /** Cosas que piden atención según el último tick. */
  count: () => _count,
  subscribe(listener) {
    asegurarPolling();
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
      if (!_listeners.size) detenerPolling();
    };
  },
  /** Refresco inmediato (después de bajar una copia, sin esperar media hora). */
  refrescar: tick,
};
