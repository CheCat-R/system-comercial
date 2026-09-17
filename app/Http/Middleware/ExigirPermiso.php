<?php

namespace App\Http\Middleware;

use App\Auth\Sesion;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * `permiso:clave1,clave2` — el endpoint exige ALGUNA de las claves (el
 * superadmin pasa siempre). Existe porque los permisos que sólo esconden
 * botones no protegen nada: la llamada que ese botón hace se podía hacer igual.
 *
 * 403 y no 401: la sesión está bien, lo que falta es el permiso. Con 401 el
 * panel lo trataría como sesión vencida y echaría a la cajera al login.
 */
class ExigirPermiso
{
    public function handle(Request $request, Closure $next, string ...$claves)
    {
        $sesion = app(Sesion::class);
        if ($claves && ! $sesion->puede(...$claves)) {
            throw new AccessDeniedHttpException('Tu rol no tiene permiso para esto.');
        }

        return $next($request);
    }
}
