/**
 * ¿A DÓNDE SE PUEDE VOLVER DESPUÉS DE ENTRAR?
 * ============================================================================
 * Al entrar se hace `window.location.replace(destino)`. Si el destino fuera un
 * valor de afuera, `//sitio-malo.com` (o `/\sitio-malo.com`, que el navegador
 * convierte en lo mismo) sacaría a la persona del sistema justo después de
 * poner su contraseña. Hoy el destino lo arma el propio sistema, pero eso se
 * sostiene solo porque ninguna ruta protegida acepta un camino así: alcanza un
 * comodín mal puesto para abrirlo. Acá se cierra de una vez.
 *
 * Devuelve la ruta si es del propio sitio (empieza con UNA sola barra), o `null`.
 */
export function rutaInterna(ruta) {
  return typeof ruta === 'string' && /^\/(?![/\\])/.test(ruta) ? ruta : null;
}