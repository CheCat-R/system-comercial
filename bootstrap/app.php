<?php

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
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Un cliente de API nunca tiene que recibir HTML, pida lo que pida en `Accept`.
        $exceptions->shouldRenderJsonWhen(fn (Request $request, Throwable $e) => true);
    })->create();
