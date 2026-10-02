<?php

namespace App\Http\Middleware;

use App\Services\LicenciaService;
use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;

/**
 * SIN LICENCIA VIGENTE, SOLO LECTURA.
 *
 * Cuando se exige licencia y no hay una que sirva (nunca se cargó, es de otra
 * instalación, o venció y ya pasó la gracia), el sistema deja de aceptar
 * CAMBIOS: ninguna venta, compra ni alta nueva. Se puede seguir mirando todo y
 * bajar los respaldos — los datos son del cliente y nunca se le esconden.
 *
 * Pasa todo lo que no modifica (GET, HEAD, OPTIONS) y dos grupos de rutas:
 *  - `auth/*`: entrar, salir, cambiar la contraseña.
 *  - `licencia/*`: cargar la clave nueva, que es justo lo que lo destraba.
 *
 * Durante la gracia (venció hace pocos días) NO se corta nada: funciona con el
 * aviso que muestra el panel.
 *
 * 403 con `codigo`, igual que `ExigirCambioPassword`: la sesión está bien, lo
 * que falta es la licencia.
 */
class ExigirLicencia
{
    public function __construct(private readonly LicenciaService $licencia) {}

    public function handle(Request $request, Closure $next)
    {
        if ($request->isMethodSafe() || $request->is('api/auth/*', 'api/licencia/*') || ! $this->licencia->exigida()) {
            return $next($request);
        }

        $e = $this->licencia->estado();
        if (! $e['restringido']) {
            return $next($request);
        }

        $vencida = $e['estado'] === 'vencida';

        return response()->json([
            'message' => $vencida
                ? 'La licencia venció el '.Carbon::parse($e['vence'])->format('d/m/Y').': el sistema quedó en modo solo lectura. Renovala en Sistema › Licencia (podés seguir viendo tus datos y bajar respaldos).'
                : 'Este sistema todavía no tiene una licencia activa, así que está en modo solo lectura. Cargá la clave de activación en Sistema › Licencia.',
            'codigo' => $vencida ? 'licencia_vencida' : 'sin_licencia',
        ], 403);
    }
}
