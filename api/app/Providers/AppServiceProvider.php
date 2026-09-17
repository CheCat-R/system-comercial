<?php

namespace App\Providers;

use App\Auth\Sesion;
use App\Auth\Sesiones;
use App\Models\SesionToken;
use App\Models\Usuario;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        /*
         * La sesión resuelta de la request, construida una sola vez y disponible
         * por inyección en controladores y middleware (`Sesion $sesion`). Sólo
         * existe detrás de `auth:sanctum`: pedirla sin usuario es un 401.
         */
        $this->app->scoped(Sesion::class, function ($app) {
            /** @var Request $request */
            $request = $app['request'];
            $usuario = $request->user();
            if (! $usuario instanceof Usuario || ! $usuario->currentAccessToken()) {
                throw new AuthenticationException('Tu sesión venció. Volvé a entrar.');
            }

            return Sesion::desde($usuario, $usuario->currentAccessToken());
        });
    }

    public function boot(): void
    {
        Sanctum::usePersonalAccessTokenModel(SesionToken::class);
        // Vencimiento por inactividad, refresco deslizante y baja inmediata de usuarios desactivados.
        Sanctum::authenticateAccessTokensUsing([Sesiones::class, 'validar']);
    }
}
