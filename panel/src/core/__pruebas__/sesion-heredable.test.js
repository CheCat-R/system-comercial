/**
 * el tope de 10 h de la copia heredable de la sesión (sesion.js,
 * HEREDABLE_MS) se RENUEVA en cada F5 de la pestaña dueña, porque
 * `actualizarSesion` (que corre en cada arranque desde
 * `authService.getCurrentUser`) vuelve a escribir la copia compartida con
 * `Date.now() + 10h` — incluso si ya había vencido. El token del servidor vence
 * por INACTIVIDAD (12 h, deslizante: api/app/Auth/Sesiones.php), así que sigue vivo.
 *
 * Resultado: la cajera entra 08:00, hace un F5 a las 21:30 y cierra el
 * navegador. A las 07:00 del día siguiente el que abre Chrome en esa PC entra
 * COMO ELLA sin login — justo lo que el tope dice evitar ("se puede heredar
 * durante un turno y después deja de servir").
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sesionDe } from './entorno.js';

const H = 60 * 60 * 1000;

test('la copia heredable vence 10 h después del LOGIN, no del último F5', async () => {
  const { guardarSesion, leerSesion, actualizarSesion } = await import('@core/auth/sesion.js');
  const t0 = Date.UTC(2026, 9, 8, 11, 0); // 08:00 en Buenos Aires (UTC-3)
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    // 08:00 — login de Carla en esta pestaña.
    guardarSesion(sesionDe({ usuarioId: 5, nombre: 'Carla', token: 'tok-carla' }));

    // 21:30 — F5 en la MISMA pestaña: el arranque refresca la sesión (getCurrentUser → actualizarSesion).
    mock.timers.setTime(t0 + 13.5 * H);
    actualizarSesion({ ...leerSesion() });

    // Cierra el navegador (se va el sessionStorage). 07:00 del día siguiente, otra persona lo abre.
    sessionStorage.clear();
    mock.timers.setTime(t0 + 23 * H);
    const deLaManana = leerSesion();

    assert.equal(
      deLaManana, null,
      `23 h después del login, una ventana nueva entró como "${deLaManana?.usuario?.nombre}" sin pedir contraseña.`,
    );
  } finally {
    mock.timers.reset();
  }
});
