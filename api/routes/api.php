<?php

use App\Http\Controllers\Api\AuditoriaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\RolesController;
use App\Http\Controllers\Api\SucursalesController;
use App\Http\Controllers\Api\TerminalesController;
use App\Http\Controllers\Api\UsuariosController;
use Illuminate\Support\Facades\Route;

/*
 * Rutas de la API. Prefijo global `/api`.
 *
 * CERRADO POR DEFECTO: lo público se declara a mano en el primer bloque y es
 * poco (health, lo del login y la identidad de la terminal). Todo lo demás va
 * dentro de `auth:sanctum`, y lo que exige un permiso lo dice con `permiso:`.
 */

/* ---------------- Público ---------------- */

Route::get('/health', fn () => response()->json([
    'ok' => true,
    'app' => config('app.name'),
    'hora' => now()->toIso8601String(),
]));

Route::prefix('auth')->group(function () {
    Route::get('/opciones', [AuthController::class, 'opciones']);
    // Rate limit propio además del freno por usuario/IP: 30 por minuto por IP.
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
});

Route::post('/terminales/actual', [TerminalesController::class, 'actual'])->middleware('throttle:60,1');

/* ---------------- Con sesión ---------------- */

Route::middleware('auth:sanctum')->group(function () {

    Route::prefix('auth')->group(function () {
        Route::get('/yo', [AuthController::class, 'yo']);
        Route::post('/sucursal', [AuthController::class, 'cambiarSucursal']);
        Route::post('/salir', [AuthController::class, 'salir']);
    });

    // Sucursales: leer las ve cualquiera con sesión (todas las pantallas las necesitan).
    Route::get('/sucursales', [SucursalesController::class, 'index']);
    Route::get('/sucursales/{sucursal}', [SucursalesController::class, 'show']);
    Route::middleware('permiso:gerencia.usuarios')->group(function () {
        Route::post('/sucursales', [SucursalesController::class, 'store']);
        Route::patch('/sucursales/{sucursal}', [SucursalesController::class, 'update']);
        Route::delete('/sucursales/{sucursal}', [SucursalesController::class, 'destroy']);
    });

    // Usuarios y roles: repartir permisos es lo que más cerrado tiene que estar.
    Route::middleware('permiso:gerencia.usuarios')->group(function () {
        Route::get('/roles', [RolesController::class, 'index']);
        Route::get('/roles/permisos', [RolesController::class, 'permisos']);
        Route::post('/roles', [RolesController::class, 'store']);
        Route::patch('/roles/{rol}', [RolesController::class, 'update']);
        Route::delete('/roles/{rol}', [RolesController::class, 'destroy']);

        Route::get('/usuarios', [UsuariosController::class, 'index']);
        Route::post('/usuarios', [UsuariosController::class, 'store']);
        Route::patch('/usuarios/{usuario}', [UsuariosController::class, 'update']);
    });

    // Equipos: registrar uno decide en qué sucursal opera todo el que se siente ahí.
    Route::middleware('permiso:sistema.terminales')->group(function () {
        Route::get('/terminales', [TerminalesController::class, 'index']);
        Route::post('/terminales', [TerminalesController::class, 'store']);
        Route::patch('/terminales/{terminal}', [TerminalesController::class, 'update']);
        Route::delete('/terminales/{terminal}', [TerminalesController::class, 'destroy']);
    });

    Route::get('/auditoria', [AuditoriaController::class, 'index'])
        ->middleware('permiso:gerencia.auditoria,compras.proveedores,gastos.proveedores,proveedores.padron');
});
