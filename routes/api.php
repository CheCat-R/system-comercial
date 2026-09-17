<?php

use Illuminate\Support\Facades\Route;

/*
 * Rutas de la API. Prefijo global `/api`.
 *
 * Lo público se declara explícitamente; todo lo demás va dentro del grupo
 * `auth:sanctum` (se agrega en el paso 2, con el módulo de autenticación).
 */

Route::get('/health', fn () => response()->json([
    'ok' => true,
    'app' => config('app.name'),
    'hora' => now()->toIso8601String(),
]));
