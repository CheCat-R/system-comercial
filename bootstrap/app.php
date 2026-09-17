<?php

use App\Http\Middleware\ExigirPermiso;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

/*
 * API pura: no hay rutas web ni vistas. Todo vive en `routes/api.php` bajo el
 * prefijo `/api`, y toda respuesta —incluidos los errores— es JSON.
 */
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sin sesión ni cookies: la credencial es el token en `Authorization: Bearer`.
        // No se usa statefulApi(): activaría CSRF para el panel en localhost.
        $middleware->alias([
            'permiso' => ExigirPermiso::class,
        ]);
        // Un cliente sin sesión recibe 401 en JSON, nunca una redirección a una pantalla de login.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Un cliente de API nunca tiene que recibir HTML, pida lo que pida en `Accept`.
        $exceptions->shouldRenderJsonWhen(fn (Request $request, Throwable $e) => true);

        /*
         * Mismo mensaje para "no hay token", "venció" y "el usuario se
         * desactivó": al que está afuera no se le cuenta en qué estado está la
         * credencial. El panel con esto ya sabe qué hacer — limpiar y volver al login.
         */
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            return response()->json(['message' => 'Tu sesión venció. Volvé a entrar.'], 401);
        });
    })->create();
