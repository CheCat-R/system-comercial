<?php

namespace App\Http\Middleware;

use App\Auth\PlanCatalogo;
use App\Services\LicenciaService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * `plan:clave1,clave2` — el endpoint exige que el PLAN de esta instalación
 * incluya ALGUNA de las claves (ver `PlanCatalogo`). Es un eje DISTINTO de
 * `permiso:`, que sigue corriendo aparte y sin cambios: `permiso:` pregunta
 * "¿el ROL de este usuario lo deja pasar?"; esto pregunta "¿lo que esta
 * empresa CONTRATÓ lo incluye?". Un Administrador con permiso de sobra en un
 * cliente Emprendedor sigue sin entrar a algo que su plan no trae.
 *
 * 403, mismo criterio que `ExigirPermiso`: la sesión está bien, lo que falta
 * es que el plan lo incluya — no es una sesión vencida.
 */
class ExigirPlan
{
    public function __construct(private readonly LicenciaService $licencia) {}

    public function handle(Request $request, Closure $next, string ...$claves)
    {
        if ($claves) {
            $plan = $this->licencia->plan();
            $incluido = false;
            foreach ($claves as $clave) {
                if (PlanCatalogo::incluye($plan, $clave)) {
                    $incluido = true;
                    break;
                }
            }
            if (! $incluido) {
                throw new AccessDeniedHttpException('Esta función no está incluida en el plan actual.');
            }
        }

        return $next($request);
    }
}
