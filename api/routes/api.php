<?php

use App\Http\Controllers\Api\ArcaController;
use App\Http\Controllers\Api\AuditoriaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CajaController;
use App\Http\Controllers\Api\CatalogosController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\ClientesController;
use App\Http\Controllers\Api\CobranzasController;
use App\Http\Controllers\Api\ComprobantesController;
use App\Http\Controllers\Api\ConfiguracionController;
use App\Http\Controllers\Api\ConteosController;
use App\Http\Controllers\Api\FinanzasProveedorController;
use App\Http\Controllers\Api\GastosController;
use App\Http\Controllers\Api\GerenciaController;
use App\Http\Controllers\Api\IncidenciasController;
use App\Http\Controllers\Api\InventarioController;
use App\Http\Controllers\Api\ListasController;
use App\Http\Controllers\Api\OfertasController;
use App\Http\Controllers\Api\PagosProveedorController;
use App\Http\Controllers\Api\PedidosProveedorController;
use App\Http\Controllers\Api\PreciosController;
use App\Http\Controllers\Api\PresupuestosController;
use App\Http\Controllers\Api\ProductosController;
use App\Http\Controllers\Api\ProveedoresController;
use App\Http\Controllers\Api\RelevosController;
use App\Http\Controllers\Api\RespaldosController;
use App\Http\Controllers\Api\RolesController;
use App\Http\Controllers\Api\SucursalesController;
use App\Http\Controllers\Api\TerminalesController;
use App\Http\Controllers\Api\TransferenciasController;
use App\Http\Controllers\Api\UsuariosController;
use App\Http\Controllers\Api\VencimientosController;
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

    Route::prefix('sistema/respaldos')->middleware('permiso:sistema.respaldos')->group(function () {
        Route::get('/info', [RespaldosController::class, 'info']);
        Route::get('/descargar', [RespaldosController::class, 'descargar']);
        Route::get('/limpieza/ensayo', [RespaldosController::class, 'ensayoLimpieza']);
        Route::post('/limpieza', [RespaldosController::class, 'limpiar']);
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
        Route::post('/productos/importar', [ProductosController::class, 'importar']);
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
        Route::post('/proveedores/importar', [ProveedoresController::class, 'importar']);
        Route::post('/proveedores/{proveedor}/migracion', [ProveedoresController::class, 'migracion']);
        Route::post('/proveedores', [ProveedoresController::class, 'store']);
        Route::patch('/proveedores/{proveedor}', [ProveedoresController::class, 'update']);
        Route::delete('/proveedores/{proveedor}', [ProveedoresController::class, 'destroy']);
    });

    /* ---------------- Formato de venta ---------------- */

    Route::get('/listas', [ListasController::class, 'catalogo']);
    Route::get('/listas/reglas-marca', [ListasController::class, 'reglas']);
    Route::put('/listas/cliente/{clienteId}', [ListasController::class, 'setCliente'])
        ->whereNumber('clienteId')->middleware('permiso:ventas.listas,ventas.clientes');
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

    Route::prefix('vencimientos')->middleware('permiso:almacen.vencimientos')->group(function () {
        // Las rutas fijas van ANTES de las de {id}: 'ofertas'/'resumen'/'reportes' no son un id.
        Route::get('/', [VencimientosController::class, 'index']);
        Route::get('/resumen', [VencimientosController::class, 'resumen']);
        Route::get('/reportes', [VencimientosController::class, 'reportes']);
        Route::get('/ofertas', [VencimientosController::class, 'ofertas']);
        Route::post('/sesiones', [VencimientosController::class, 'crearSesion']);
        Route::get('/{id}/borrador-oferta', [VencimientosController::class, 'borradorOferta'])->whereNumber('id');
        Route::put('/{id}', [VencimientosController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [VencimientosController::class, 'destroy'])->whereNumber('id');
        Route::post('/{id}/procesar', [VencimientosController::class, 'procesar'])->whereNumber('id')->middleware('permiso:inventario');
        Route::post('/{id}/vincular-oferta', [VencimientosController::class, 'vincularOferta'])->whereNumber('id');
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

    Route::prefix('relevos')->middleware('permiso:ventas.pos,ventas.caja,ventas.cobranzas')->group(function () {
        Route::get('/', [RelevosController::class, 'index']);
        Route::post('/verificar', [RelevosController::class, 'verificar']);
        Route::post('/volver', [RelevosController::class, 'volver']);
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

    /* ---------------- Compras, gastos y pagos (F3) ---------------- */

    // Percepciones y cuentas bancarias del proveedor: las lee quien carga facturas o paga; las escribe quien administra el padrón.
    Route::get('/proveedores/{proveedor}/percepciones', [ProveedoresController::class, 'percepciones']);
    Route::get('/proveedores/{proveedor}/cuentas', [ProveedoresController::class, 'cuentas']);
    Route::middleware('permiso:compras.proveedores,gastos.proveedores,proveedores.padron')->group(function () {
        Route::put('/proveedores/{proveedor}/percepciones', [ProveedoresController::class, 'setPercepciones']);
        Route::put('/proveedores/{proveedor}/cuentas', [ProveedoresController::class, 'setCuentas']);
    });

    // Comprobantes de compra: todo detrás de `compras.facturacion`; cargar pide además la acción `facturas`.
    Route::prefix('comprobantes')->middleware('permiso:compras.facturacion')->group(function () {
        Route::get('/', [ComprobantesController::class, 'index']);
        Route::get('/saldos', [ComprobantesController::class, 'saldos']);
        Route::get('/remitos-pendientes', [ComprobantesController::class, 'remitosPendientes']);
        Route::get('/cuenta/{proveedorId}', [ComprobantesController::class, 'cuenta']);
        Route::get('/referenciables/{proveedorId}', [ComprobantesController::class, 'referenciables']);
        Route::get('/{id}', [ComprobantesController::class, 'show'])->whereNumber('id');
        Route::middleware('permiso:facturas')->group(function () {
            Route::post('/', [ComprobantesController::class, 'store']);
            Route::post('/{id}/facturar', [ComprobantesController::class, 'facturar']);
            Route::post('/{id}/confirmar', [ComprobantesController::class, 'confirmar']);
            Route::post('/{id}/anular', [ComprobantesController::class, 'anular']);
            Route::delete('/{id}', [ComprobantesController::class, 'destroy']);
        });
    });

    // Plata que sale hacia un proveedor: tres caminos legítimos (administración, gastos, la cajera cuando llega el camión).
    Route::prefix('pagos-proveedor')->middleware('permiso:compras.pagos,gastos.pagos_proveedor,ventas.caja')->group(function () {
        Route::get('/', [PagosProveedorController::class, 'index']);
        Route::get('/sin-aplicar', [PagosProveedorController::class, 'sinAplicar']);
        Route::get('/disponibles/{proveedorId}', [PagosProveedorController::class, 'disponibles']);
        Route::get('/pendientes/{proveedorId}', [PagosProveedorController::class, 'pendientes']);
        Route::get('/cuenta/{proveedorId}', [PagosProveedorController::class, 'cuenta']);
        Route::get('/{id}', [PagosProveedorController::class, 'show'])->whereNumber('id');
        Route::post('/', [PagosProveedorController::class, 'store']);
        Route::post('/descontar-fletes', [PagosProveedorController::class, 'descontarFletes']);
        Route::post('/{id}/anular', [PagosProveedorController::class, 'anular']);
        Route::patch('/{id}/papel', [PagosProveedorController::class, 'papel']);
        // Imputar es del administrador: decidir contra qué documento se descuenta un pago que ya existe.
        Route::middleware('permiso:gastos_imputar,gastos.pagos_proveedor,compras.pagos')->group(function () {
            Route::post('/{id}/imputar', [PagosProveedorController::class, 'imputar']);
            Route::delete('/imputaciones/{id}', [PagosProveedorController::class, 'desimputar']);
            Route::patch('/{id}/destino', [PagosProveedorController::class, 'destino']);
        });
    });

    $pisoGastos = 'gastos.gastos,gastos.pagos,gastos.pagos_proveedor,gastos.fijos,gastos.categorias,gastos.proveedores,gastos.resumen';
    $verGastos = 'gastos.gastos,gastos.pagos,gastos.resumen';
    $pagarGastos = 'gastos_pagar,gastos_pagar_proveedor,ventas.caja';
    Route::prefix('gastos')->middleware('permiso:'.$pisoGastos)->group(function () use ($verGastos, $pagarGastos) {
        Route::get('/bootstrap', [GastosController::class, 'bootstrap']);
        Route::get('/pendientes', [GastosController::class, 'pendientes'])->middleware('permiso:gastos.gastos,gastos.pagos');
        Route::get('/cuentas-a-pagar', [GastosController::class, 'cuentasAPagar'])->middleware('permiso:gastos.pagos');
        Route::get('/resumen', [GastosController::class, 'resumen'])->middleware('permiso:gastos.resumen');
        Route::get('/categorias', [GastosController::class, 'categorias']);
        Route::middleware('permiso:gastos.categorias')->group(function () {
            Route::post('/categorias', [GastosController::class, 'crearCategoria']);
            Route::patch('/categorias/{id}', [GastosController::class, 'editarCategoria']);
            Route::delete('/categorias/{id}', [GastosController::class, 'borrarCategoria']);
        });
        Route::middleware('permiso:gastos.fijos')->group(function () {
            Route::get('/recurrentes', [GastosController::class, 'recurrentes']);
            Route::post('/recurrentes', [GastosController::class, 'crearRecurrente']);
            Route::get('/recurrentes/periodo/{periodo}', [GastosController::class, 'previaPeriodo']);
            Route::post('/recurrentes/generar', [GastosController::class, 'generarPeriodo']);
            Route::patch('/recurrentes/{id}', [GastosController::class, 'editarRecurrente']);
            Route::delete('/recurrentes/{id}', [GastosController::class, 'borrarRecurrente']);
        });
        Route::get('/adjuntos/{id}', [GastosController::class, 'adjunto'])->middleware('permiso:'.$verGastos);
        Route::delete('/adjuntos/{id}', [GastosController::class, 'borrarAdjunto'])->middleware('permiso:gastos.gastos');
        Route::get('/', [GastosController::class, 'index'])->middleware('permiso:'.$verGastos);
        Route::get('/{id}', [GastosController::class, 'show'])->whereNumber('id')->middleware('permiso:'.$verGastos);
        Route::post('/', [GastosController::class, 'store'])->middleware('permiso:gastos.gastos');
        Route::patch('/{id}', [GastosController::class, 'update'])->middleware('permiso:gastos.gastos');
        Route::post('/{id}/adjuntos', [GastosController::class, 'subirAdjunto'])->middleware('permiso:gastos.gastos');
        Route::post('/{id}/anular', [GastosController::class, 'anular'])->middleware('permiso:gastos_anular');
        Route::post('/{id}/pagos', [GastosController::class, 'pagar'])->middleware('permiso:'.$pagarGastos);
        Route::post('/{id}/aplicar-pago', [GastosController::class, 'aplicarPago'])->middleware('permiso:gastos_imputar,gastos.pagos_proveedor,compras.pagos');
    });

    Route::prefix('compromisos')->middleware('permiso:proveedores.ctasctes')->group(function () {
        Route::get('/', [FinanzasProveedorController::class, 'compromisos']);
        Route::get('/stats', [FinanzasProveedorController::class, 'statsCompromisos']);
        Route::get('/{id}', [FinanzasProveedorController::class, 'compromiso'])->whereNumber('id');
        Route::post('/', [FinanzasProveedorController::class, 'crearCompromiso']);
        Route::patch('/{id}', [FinanzasProveedorController::class, 'editarCompromiso']);
        Route::post('/{id}/pagar', [FinanzasProveedorController::class, 'pagarCompromiso']);
        Route::delete('/{id}', [FinanzasProveedorController::class, 'borrarCompromiso']);
    });

    Route::prefix('echeqs')->middleware('permiso:proveedores.echeqs')->group(function () {
        Route::get('/', [FinanzasProveedorController::class, 'echeqs']);
        Route::get('/stats', [FinanzasProveedorController::class, 'statsEcheqs']);
        Route::get('/{id}', [FinanzasProveedorController::class, 'echeq'])->whereNumber('id');
        Route::post('/', [FinanzasProveedorController::class, 'crearEcheq']);
        Route::patch('/{id}', [FinanzasProveedorController::class, 'editarEcheq']);
        Route::post('/{id}/estado', [FinanzasProveedorController::class, 'estadoEcheq']);
        Route::delete('/{id}', [FinanzasProveedorController::class, 'borrarEcheq']);
    });

    Route::prefix('proveedores-edoc')->middleware('permiso:proveedores.edoc')->group(function () {
        Route::get('/', [FinanzasProveedorController::class, 'edocGlobal']);
        Route::post('/ajustes', [FinanzasProveedorController::class, 'ajuste']);
        Route::delete('/ajustes/{id}', [FinanzasProveedorController::class, 'borrarAjuste']);
        Route::get('/{proveedorId}', [FinanzasProveedorController::class, 'edoc'])->whereNumber('proveedorId');
        Route::post('/{proveedorId}/conciliar', [FinanzasProveedorController::class, 'conciliar']);
        Route::delete('/{proveedorId}/conciliar', [FinanzasProveedorController::class, 'desconciliar']);
    });

    Route::prefix('pedidos-proveedor')->middleware('permiso:proveedores.pedidos')->group(function () {
        Route::get('/', [PedidosProveedorController::class, 'kanban']);
        Route::get('/stats', [PedidosProveedorController::class, 'stats']);
        Route::get('/recibidos', [PedidosProveedorController::class, 'recibidos']);
        Route::post('/', [PedidosProveedorController::class, 'alta']);
        Route::post('/directo', [PedidosProveedorController::class, 'directo']);
        Route::patch('/{id}', [PedidosProveedorController::class, 'editar']);
        Route::patch('/{id}/estado', [PedidosProveedorController::class, 'estado']);
        Route::post('/{id}/enviado', [PedidosProveedorController::class, 'enviado']);
        Route::post('/{id}/revisado', [PedidosProveedorController::class, 'revisado']);
        Route::delete('/{id}', [PedidosProveedorController::class, 'borrar']);
    });

    Route::get('/gerencia/rentabilidad', [GerenciaController::class, 'rentabilidad'])->middleware('permiso:gerencia.rentabilidad');

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
