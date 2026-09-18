<?php

use App\Http\Controllers\Api\ArcaController;
use App\Http\Controllers\Api\AuditoriaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CajaController;
use App\Http\Controllers\Api\CatalogosController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\ClientesController;
use App\Http\Controllers\Api\CobranzasController;
use App\Http\Controllers\Api\ConfiguracionController;
use App\Http\Controllers\Api\ConteosController;
use App\Http\Controllers\Api\IncidenciasController;
use App\Http\Controllers\Api\InventarioController;
use App\Http\Controllers\Api\ListasController;
use App\Http\Controllers\Api\OfertasController;
use App\Http\Controllers\Api\PreciosController;
use App\Http\Controllers\Api\PresupuestosController;
use App\Http\Controllers\Api\ProductosController;
use App\Http\Controllers\Api\ProveedoresController;
use App\Http\Controllers\Api\RolesController;
use App\Http\Controllers\Api\SucursalesController;
use App\Http\Controllers\Api\TerminalesController;
use App\Http\Controllers\Api\TransferenciasController;
use App\Http\Controllers\Api\UsuariosController;
use App\Http\Controllers\Api\VentasController;
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

    /* ---------------- Catálogo ---------------- */

    // Lo lee todo el sistema (el POS necesita los precios); los importes se recortan por permiso en el controlador.
    Route::get('/bootstrap', [InventarioController::class, 'bootstrap']);
    Route::get('/productos', [ProductosController::class, 'index']);
    Route::get('/productos/siguiente-codigo', [ProductosController::class, 'siguienteCodigo']);
    Route::get('/productos/siguiente-ean', [ProductosController::class, 'siguienteEan']);
    Route::get('/productos/sugerencias/archivado', [ProductosController::class, 'sugerenciasArchivado']);
    Route::get('/productos/{producto}', [ProductosController::class, 'show']);
    Route::middleware('permiso:compras.productos')->group(function () {
        Route::post('/productos', [ProductosController::class, 'store']);
        Route::post('/productos/archivar-lote', [ProductosController::class, 'archivarLote']);
        Route::patch('/productos/{producto}', [ProductosController::class, 'update']);
        Route::delete('/productos/{producto}', [ProductosController::class, 'destroy']);
        Route::post('/productos/{producto}/estado', [ProductosController::class, 'cambiarEstado']);
        Route::put('/productos/{producto}/presentaciones', [ProductosController::class, 'setPresentaciones']);
        Route::put('/productos/{producto}/formatos-compra', [ProductosController::class, 'setFormatosCompra']);
    });
    Route::patch('/productos/{producto}/cartel', [ProductosController::class, 'cartel'])->middleware('permiso:compras.productos,ventas.cambios');
    Route::middleware('permiso:precios,ventas.listas')->group(function () {
        Route::put('/productos/{producto}/listas', [ProductosController::class, 'setListas']);
        Route::put('/productos/presentaciones/{presId}/listas', [ProductosController::class, 'setListasPresentacion']);
    });

    Route::get('/catalogos', [CatalogosController::class, 'index']);
    Route::middleware('permiso:compras.catalogos')->group(function () {
        Route::post('/catalogos/{tipo}', [CatalogosController::class, 'store']);
        Route::patch('/catalogos/{tipo}/{id}', [CatalogosController::class, 'update']);
        Route::delete('/catalogos/{tipo}/{id}', [CatalogosController::class, 'destroy']);
        Route::post('/catalogos/{tipo}/{id}/fusionar', [CatalogosController::class, 'fusionar']);
    });

    Route::get('/proveedores', [ProveedoresController::class, 'index']);
    Route::get('/proveedores/{proveedor}', [ProveedoresController::class, 'show']);
    Route::middleware('permiso:compras.proveedores,gastos.proveedores,proveedores.padron')->group(function () {
        Route::post('/proveedores', [ProveedoresController::class, 'store']);
        Route::patch('/proveedores/{proveedor}', [ProveedoresController::class, 'update']);
        Route::delete('/proveedores/{proveedor}', [ProveedoresController::class, 'destroy']);
    });

    /* ---------------- Formato de venta ---------------- */

    Route::get('/listas', [ListasController::class, 'catalogo']);
    Route::get('/listas/reglas-marca', [ListasController::class, 'reglas']);
    Route::middleware('permiso:ventas.listas,precios')->group(function () {
        Route::post('/listas/modalidades', [ListasController::class, 'crearModalidad']);
        Route::patch('/listas/modalidades/{modalidad}', [ListasController::class, 'editarModalidad']);
        Route::delete('/listas/modalidades/{modalidad}', [ListasController::class, 'borrarModalidad']);
        Route::post('/listas/reglas-marca', [ListasController::class, 'crearRegla']);
        Route::patch('/listas/reglas-marca/{regla}', [ListasController::class, 'editarRegla']);
        Route::delete('/listas/reglas-marca/{regla}', [ListasController::class, 'borrarRegla']);
        Route::post('/listas', [ListasController::class, 'crear']);
        Route::patch('/listas/{lista}', [ListasController::class, 'editar']);
        Route::delete('/listas/{lista}', [ListasController::class, 'borrar']);
    });

    /* ---------------- Precios ---------------- */

    Route::prefix('precios')->middleware('permiso:precios')->group(function () {
        Route::get('/ultimo-cambio', [PreciosController::class, 'ultimoCambio']);
        Route::get('/evolucion', [PreciosController::class, 'evolucion']);
        Route::get('/historial', [PreciosController::class, 'historial']);
        Route::post('/costos', [PreciosController::class, 'costos']);
        Route::post('/margenes', [PreciosController::class, 'margenes']);
        Route::post('/activar-proveedor', [PreciosController::class, 'activarProveedor']);
        Route::post('/revertir/{lote}', [PreciosController::class, 'revertir']);
    });

    /* ---------------- Inventario ---------------- */

    Route::get('/stock', [InventarioController::class, 'existencias'])->middleware('permiso:almacen.existencias,compras.productos');
    Route::get('/movimientos', [InventarioController::class, 'movimientos'])->middleware('permiso:almacen.operaciones,compras.historial');

    Route::prefix('operaciones')->middleware('permiso:almacen.existencias')->group(function () {
        Route::post('/venta', [InventarioController::class, 'venta'])->middleware('permiso:inventario');
        Route::post('/fraccionar', [InventarioController::class, 'fraccionar'])->middleware('permiso:fraccionar');
        Route::post('/corregir-fraccionado', [InventarioController::class, 'corregirFraccionado'])->middleware('permiso:fraccionar');
        Route::post('/movimiento', [InventarioController::class, 'movimiento'])->middleware('permiso:inventario,merma,defectuoso');
    });

    Route::prefix('transferencias')->middleware('permiso:almacen.transferencias')->group(function () {
        Route::get('/', [TransferenciasController::class, 'index']);
        Route::get('/{id}', [TransferenciasController::class, 'show'])->whereNumber('id');
        Route::middleware('permiso:pedidos')->group(function () {
            Route::post('/borrador', [TransferenciasController::class, 'borrador']);
            Route::put('/{id}/borrador', [TransferenciasController::class, 'guardarBorrador']);
            Route::post('/{id}/enviar', [TransferenciasController::class, 'enviarBorrador']);
            Route::delete('/{id}/borrador', [TransferenciasController::class, 'descartarBorrador']);
            Route::post('/{id}/recibir', [TransferenciasController::class, 'recibir']);
            Route::post('/', [TransferenciasController::class, 'store']);
        });
        Route::middleware('permiso:preparar')->group(function () {
            Route::post('/{id}/avanzar', [TransferenciasController::class, 'avanzar']);
            Route::patch('/{id}/items/{itemId}', [TransferenciasController::class, 'editarItem']);
            Route::post('/{id}/items', [TransferenciasController::class, 'agregarItem']);
            Route::delete('/{id}/items/{itemId}', [TransferenciasController::class, 'quitarItem']);
            Route::post('/{id}/lista', [TransferenciasController::class, 'confirmarLista']);
            Route::post('/{id}/cancelar', [TransferenciasController::class, 'cancelar']);
        });
    });

    Route::prefix('incidencias')->middleware('permiso:almacen.incidencias')->group(function () {
        Route::get('/', [IncidenciasController::class, 'index']);
        Route::post('/', [IncidenciasController::class, 'store'])->middleware('permiso:incidencia_crear');
        Route::post('/{id}/avanzar', [IncidenciasController::class, 'avanzar'])->middleware('permiso:incidencia_crear');
        Route::post('/{id}/resolver', [IncidenciasController::class, 'resolver'])->middleware('permiso:inventario');
    });

    Route::prefix('conteos')->middleware('permiso:almacen.conteos')->group(function () {
        Route::get('/', [ConteosController::class, 'index']);
        Route::get('/{id}', [ConteosController::class, 'show']);
        Route::post('/', [ConteosController::class, 'store']);
        Route::put('/{id}/items/{itemId}', [ConteosController::class, 'contar']);
        Route::post('/{id}/cerrar', [ConteosController::class, 'cerrar']);
        Route::post('/{id}/reabrir', [ConteosController::class, 'reabrir']);
        Route::post('/{id}/items/{itemId}/recontar', [ConteosController::class, 'recontar'])->middleware('permiso:conteos_aplicar');
        Route::post('/{id}/aplicar', [ConteosController::class, 'aplicar'])->middleware('permiso:conteos_aplicar');
        Route::delete('/{id}', [ConteosController::class, 'destroy']);
    });

    /* ---------------- Ventas (F2) ---------------- */

    $seccionesVentas = 'ventas.pos,ventas.listado,ventas.ordenes,ventas.presupuestos,ventas.clientes,ventas.cobranzas,ventas.caja,ventas.listas,ventas.ofertas,ventas.cambios,ventas.configuracion';

    // Clientes: el padrón lo lee cualquier sesión (POS, presupuestos); escribir pide la sección.
    Route::prefix('clientes')->group(function () {
        Route::get('/', [ClientesController::class, 'index']);
        Route::get('/{id}', [ClientesController::class, 'show'])->whereNumber('id');
        Route::get('/{id}/cuenta', [ClientesController::class, 'cuenta'])->middleware('permiso:ventas.clientes,ventas.cobranzas,ventas.pos');
        Route::middleware('permiso:ventas.clientes')->group(function () {
            Route::post('/', [ClientesController::class, 'store']);
            Route::patch('/{id}', [ClientesController::class, 'update']);
            Route::post('/{id}/reactivar', [ClientesController::class, 'reactivar']);
            Route::delete('/{id}', [ClientesController::class, 'destroy']);
        });
        // El atajo del crédito: acá la llave gatea el endpoint entero.
        Route::patch('/{id}/credito', [ClientesController::class, 'credito'])->middleware('permiso:cta_cte');
    });

    Route::prefix('caja')->group(function () {
        // El POS pregunta si hay turno abierto para saber si puede cobrar.
        Route::get('/actual/{sucursalId}', [CajaController::class, 'actual'])->middleware('permiso:ventas.caja,ventas.pos');
        // Sacar plata del cajón es la acción más fuerte del módulo: llave propia.
        Route::post('/{id}/movimiento', [CajaController::class, 'movimiento'])->middleware('permiso:diferencias');
        Route::middleware('permiso:ventas.caja')->group(function () {
            Route::get('/', [CajaController::class, 'index']);
            Route::get('/{id}/arqueo', [CajaController::class, 'arqueo']);
            Route::get('/{id}', [CajaController::class, 'show']);
            Route::post('/abrir', [CajaController::class, 'abrir']);
            Route::post('/{id}/cerrar', [CajaController::class, 'cerrar']);
            Route::post('/{id}/control', [CajaController::class, 'control']);
        });
    });

    Route::prefix('ventas')->group(function () use ($seccionesVentas) {
        // El bootstrap lo abre cualquier sección de Ventas.
        Route::get('/bootstrap', [VentasController::class, 'bootstrap'])->middleware('permiso:'.$seccionesVentas);
        Route::get('/catalogo', [VentasController::class, 'catalogo'])->middleware('permiso:ventas.pos,ventas.presupuestos,presupuestos');
        Route::get('/cuenta/{clienteId}', [VentasController::class, 'cuenta'])->middleware('permiso:ventas.pos,ventas.cobranzas,ventas.clientes');
        Route::get('/listado', [VentasController::class, 'listado'])->middleware('permiso:ventas.listado');
        Route::get('/', [VentasController::class, 'index'])->middleware('permiso:ventas.pos,ventas.listado');
        Route::get('/{id}', [VentasController::class, 'show'])->whereNumber('id')->middleware('permiso:ventas.pos,ventas.listado,ventas.cobranzas');
        // Ver el punto de venta y COBRAR son dos permisos: escribir pide la acción `ventas`.
        Route::middleware('permiso:ventas')->group(function () {
            Route::post('/', [VentasController::class, 'store']);
            Route::put('/{id}', [VentasController::class, 'update']);
            Route::post('/{id}/confirmar', [VentasController::class, 'confirmar']);
            Route::post('/{id}/delegar', [VentasController::class, 'delegar']);
            Route::delete('/{id}', [VentasController::class, 'destroy']);
        });
        Route::post('/{id}/facturar', [VentasController::class, 'facturar'])->middleware('permiso:ventas.listado,ventas.configuracion');
        Route::post('/{id}/anular', [VentasController::class, 'anular'])->middleware('permiso:devoluciones');
        Route::post('/{id}/nota-credito', [VentasController::class, 'notaCredito'])->middleware('permiso:nota_credito');
    });

    Route::prefix('cobranzas')->group(function () {
        Route::post('/{id}/anular', [CobranzasController::class, 'anular'])->middleware('permiso:devoluciones');
        Route::middleware('permiso:ventas.cobranzas')->group(function () {
            Route::get('/', [CobranzasController::class, 'index']);
            Route::get('/{id}', [CobranzasController::class, 'show']);
            Route::post('/', [CobranzasController::class, 'store']);
        });
    });

    Route::prefix('presupuestos')->middleware('permiso:ventas.presupuestos,presupuestos,ventas.ordenes')->group(function () {
        Route::get('/', [PresupuestosController::class, 'index']);
        Route::get('/ordenes/pendientes', [PresupuestosController::class, 'ordenesPendientes']);
        Route::get('/{id}', [PresupuestosController::class, 'show'])->whereNumber('id');
        Route::post('/{id}/aceptar', [PresupuestosController::class, 'aceptar']);
        Route::post('/{id}/cancelar', [PresupuestosController::class, 'cancelar']);
        Route::middleware('permiso:ventas.presupuestos,presupuestos')->group(function () {
            Route::post('/', [PresupuestosController::class, 'store']);
            Route::patch('/{id}', [PresupuestosController::class, 'update']);
            Route::post('/{id}/enviar', [PresupuestosController::class, 'enviar']);
            Route::post('/{id}/reabrir', [PresupuestosController::class, 'reabrir']);
            Route::post('/{id}/confirmar', [PresupuestosController::class, 'confirmar']);
            Route::post('/{id}/armar', [PresupuestosController::class, 'armar']);
            Route::post('/{id}/delegar', [PresupuestosController::class, 'delegar']);
        });
    });

    Route::prefix('ofertas')->group(function () {
        Route::get('/', [OfertasController::class, 'index']);
        Route::middleware('permiso:ventas.ofertas,ofertas')->group(function () {
            Route::post('/', [OfertasController::class, 'store']);
            Route::patch('/{id}', [OfertasController::class, 'update']);
            Route::delete('/{id}', [OfertasController::class, 'destroy']);
        });
    });

    Route::prefix('descuentos')->group(function () {
        Route::get('/', [OfertasController::class, 'descuentos'])->middleware('permiso:ventas.pos,ventas.configuracion');
        Route::middleware('permiso:ventas.configuracion')->group(function () {
            Route::post('/', [OfertasController::class, 'crearDescuento']);
            Route::patch('/{id}', [OfertasController::class, 'editarDescuento']);
            Route::delete('/{id}', [OfertasController::class, 'borrarDescuento']);
        });
    });

    Route::prefix('arca')->middleware('permiso:ventas.configuracion')->group(function () {
        Route::get('/estado', [ArcaController::class, 'estado']);
        Route::post('/probar', [ArcaController::class, 'probar']);
        Route::post('/certificado/pedido', [ArcaController::class, 'pedido']);
        Route::post('/certificado/instalar', [ArcaController::class, 'instalar']);
    });

    /* ---------------- Transversal ---------------- */

    Route::get('/configuracion/{clave}', [ConfiguracionController::class, 'show']);
    Route::put('/configuracion/{clave}', [ConfiguracionController::class, 'update']);

    Route::prefix('chat')->group(function () {
        Route::get('/bootstrap', [ChatController::class, 'bootstrap']);
        Route::get('/mensajes', [ChatController::class, 'nuevos']);
        Route::post('/mensajes', [ChatController::class, 'enviar']);
        Route::post('/leido', [ChatController::class, 'leido']);
    });
});
