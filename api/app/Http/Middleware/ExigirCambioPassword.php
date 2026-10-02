<?php

namespace App\Http\Middleware;

use App\Auth\Sesion;
use Closure;
use Illuminate\Http\Request;

/**
 * UNA CONTRASEÑA QUE LA PUSO OTRO NO SE USA PARA TRABAJAR.
 *
 * Mientras la persona no haya elegido la suya (`debe_cambiar_password`), la
 * sesión sirve para exactamente tres cosas: preguntar quién es, cambiar la
 * contraseña y salir. Todo lo demás da 403 con `codigo: cambiar_password`.
 *
 * Se exige ACÁ, en el servidor, y no solo en la pantalla: un modal que el panel
 * dibuja no frena a quien le pega a la API directo con el token.
 */
class ExigirCambioPassword
{
    /** Lo único que se puede hacer con una contraseña por cambiar. */
    private const PERMITIDAS = ['api/auth/yo', 'api/auth/password', 'api/auth/salir'];

    public function handle(Request $request, Closure $next)
    {
        if (app(Sesion::class)->debeCambiarPassword && ! $request->is(...self::PERMITIDAS)) {
            return response()->json([
                'message' => 'Tenés que elegir tu contraseña antes de seguir.',
                'codigo' => 'cambiar_password',
            ], 403);
        }

        return $next($request);
    }
}
