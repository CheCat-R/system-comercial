<?php

namespace App\Auth;

/**
 * CATÁLOGO DE PERMISOS — la fuente de verdad.
 *
 * DOS NIVELES, un solo modelo:
 *  - SECCIONES (`modulo.seccion`): qué PANTALLAS ve el rol. Un módulo sin
 *    ninguna sección asignada desaparece entero del menú.
 *  - ACCIONES (claves simples): qué OPERACIONES puede hacer dentro de lo que
 *    ve (registrar merma, cobrar, pisar un precio). Gatean botones, no pantallas.
 *
 * El panel arma el editor de roles con ESTE catálogo (`GET /roles/permisos`):
 * agregar una sección o acción acá la hace aparecer sola.
 */
final class Permisos
{
    /**
     * EL COMODÍN NO ES UN PERMISO MÁS: ES LA AUSENCIA DE LÍMITES. Además de todas
     * las claves del catálogo da el cruce de sucursales. No se puede pedir por
     * API: existe sólo en el rol que planta la semilla.
     */
    public const COMODIN = '*';

    /**
     * Claves de catálogos viejos que ya no se muestran pero se siguen aceptando,
     * para que un rol guardado con ellas no se vuelva ineditable. No dan acceso.
     */
    public const LEGADAS = ['ver', 'config', 'usuarios'];

    public const CATALOGO = [
        [
            'grupo' => 'General',
            'modulo' => null,
            'secciones' => [
                ['clave' => 'dashboard', 'nombre' => 'Dashboard'],
                ['clave' => 'manual', 'nombre' => 'Info de sistema'],
            ],
            'acciones' => [],
        ],
        [
            'grupo' => 'Compras',
            'modulo' => 'compras',
            'secciones' => [
                ['clave' => 'compras.productos', 'nombre' => 'Productos'],
                ['clave' => 'compras.catalogos', 'nombre' => 'Catálogos'],
                ['clave' => 'compras.proveedores', 'nombre' => 'Costos y percepciones (lo operativo del proveedor)'],
                ['clave' => 'compras.facturacion', 'nombre' => 'Facturación'],
                ['clave' => 'compras.pagos', 'nombre' => 'Pagos en sucursal (plata a cuenta de proveedores)'],
                ['clave' => 'compras.historial', 'nombre' => 'Historial'],
            ],
            'acciones' => [
                ['clave' => 'facturas', 'nombre' => 'Cargar comprobantes de compra'],
                // Aparte de facturas, a propósito: la liquidación es la mitad sin factura.
                ['clave' => 'liquidaciones', 'nombre' => 'Cargar y ver liquidaciones (la mitad sin factura)'],
                ['clave' => 'precios', 'nombre' => 'Precios, márgenes y actualizaciones'],
                ['clave' => 'etiquetas', 'nombre' => 'Imprimir etiquetas'],
            ],
        ],
        [
            'grupo' => 'Ventas',
            'modulo' => 'ventas',
            'secciones' => [
                ['clave' => 'ventas.pos', 'nombre' => 'Punto de venta'],
                ['clave' => 'ventas.listado', 'nombre' => 'Ventas (listado de tickets del POS)'],
                ['clave' => 'ventas.ordenes', 'nombre' => 'Órdenes web (bandeja de pedidos del sitio)'],
                ['clave' => 'ventas.presupuestos', 'nombre' => 'Presupuestos'],
                ['clave' => 'ventas.clientes', 'nombre' => 'Clientes'],
                ['clave' => 'ventas.cobranzas', 'nombre' => 'Cobranzas'],
                ['clave' => 'ventas.caja', 'nombre' => 'Caja'],
                ['clave' => 'ventas.listas', 'nombre' => 'Formato de venta'],
                ['clave' => 'ventas.ofertas', 'nombre' => 'Ofertas'],
                ['clave' => 'ventas.cambios', 'nombre' => 'Cambios de precio'],
                ['clave' => 'ventas.configuracion', 'nombre' => 'Configuración de ventas'],
            ],
            'acciones' => [
                ['clave' => 'ventas', 'nombre' => 'Cobrar en caja'],
                ['clave' => 'presupuestos', 'nombre' => 'Cotizar presupuestos'],
                // Le saca el efectivo al arqueo del turno; queda en `anuladoPor`.
                ['clave' => 'devoluciones', 'nombre' => 'Anular ventas y devoluciones'],
                // Distinto de anular: EMITE un comprobante fiscal contra el CUIT de la casa.
                ['clave' => 'nota_credito', 'nombre' => 'Emitir notas de crédito (comprobante fiscal)'],
                // Otorgar crédito del negocio lo decide el superadmin: ningún rol la trae de fábrica.
                ['clave' => 'cta_cte', 'nombre' => 'Clientes: habilitar cuenta corriente y fijar límite'],
                ['clave' => 'diferencias', 'nombre' => 'Diferencias de caja (mover plata del cajón)'],
                ['clave' => 'ofertas', 'nombre' => 'Crear y editar ofertas'],
                // Escribir un precio a mano, elegir una lista no habilitada, pasar el tope de descuento.
                ['clave' => 'precio_manual', 'nombre' => 'Pisar el precio y pasar el tope de descuento'],
            ],
        ],
        [
            'grupo' => 'Almacén',
            'modulo' => 'almacen',
            'secciones' => [
                ['clave' => 'almacen.existencias', 'nombre' => 'Existencias'],
                ['clave' => 'almacen.conteos', 'nombre' => 'Control de stock (contar)'],
                ['clave' => 'almacen.fraccionamiento', 'nombre' => 'Fraccionamiento'],
                ['clave' => 'almacen.transferencias', 'nombre' => 'Transferencias'],
                ['clave' => 'almacen.operaciones', 'nombre' => 'Operaciones'],
                ['clave' => 'almacen.incidencias', 'nombre' => 'Incidencias'],
                ['clave' => 'almacen.vencimientos', 'nombre' => 'Vencimientos (control de fechas)'],
            ],
            'acciones' => [
                ['clave' => 'pedidos', 'nombre' => 'Pedir y recibir mercadería'],
                ['clave' => 'preparar', 'nombre' => 'Preparar envíos (lista Enteros)'],
                ['clave' => 'fraccionar', 'nombre' => 'Fraccionar granel (y su lista en envíos)'],
                ['clave' => 'inventario', 'nombre' => 'Ajustes de inventario'],
                // La del encargado: ver diferencias, marcar recontar y APLICAR. Contar puede cualquiera con la sección.
                ['clave' => 'conteos_aplicar', 'nombre' => 'Control de stock: revisar y aplicar ajustes'],
                ['clave' => 'merma', 'nombre' => 'Registrar mermas'],
                ['clave' => 'defectuoso', 'nombre' => 'Marcar defectuosos'],
                ['clave' => 'incidencia_crear', 'nombre' => 'Crear incidencias'],
            ],
        ],
        [
            'grupo' => 'Web',
            'modulo' => 'web',
            'secciones' => [
                ['clave' => 'web.productos', 'nombre' => 'Productos del sitio'],
                ['clave' => 'web.ofertas', 'nombre' => 'Ofertas del sitio'],
                ['clave' => 'web.contenido', 'nombre' => 'Contenido (banners e imágenes)'],
                ['clave' => 'web.estadisticas', 'nombre' => 'Estadísticas del sitio'],
                ['clave' => 'web.configuracion', 'nombre' => 'Configuración del sitio (logo, contacto, redes)'],
            ],
            'acciones' => [],
        ],
        [
            'grupo' => 'Gastos',
            'modulo' => 'gastos',
            'secciones' => [
                ['clave' => 'gastos.gastos', 'nombre' => 'Gastos (carga de comprobantes)'],
                ['clave' => 'gastos.pagos', 'nombre' => 'Cuentas a pagar'],
                ['clave' => 'gastos.pagos_proveedor', 'nombre' => 'Pagos a proveedores (bandeja y aplicación)'],
                ['clave' => 'gastos.fijos', 'nombre' => 'Gastos fijos'],
                ['clave' => 'gastos.categorias', 'nombre' => 'Rubros de gasto'],
                ['clave' => 'gastos.proveedores', 'nombre' => 'Proveedores de gastos'],
                ['clave' => 'gastos.resumen', 'nombre' => 'Resumen de gastos'],
            ],
            'acciones' => [
                ['clave' => 'gastos_pagar', 'nombre' => 'Registrar y revertir pagos de gastos'],
                ['clave' => 'gastos_anular', 'nombre' => 'Anular gastos'],
                // Pagar es del cajero; imputar es del administrador. Dos responsabilidades.
                ['clave' => 'gastos_pagar_proveedor', 'nombre' => 'Pagar a un proveedor desde la caja'],
                ['clave' => 'gastos_imputar', 'nombre' => 'Aplicar pagos a facturas y gastos'],
            ],
        ],
        [
            'grupo' => 'Proveedores',
            'modulo' => 'proveedores',
            'secciones' => [
                ['clave' => 'proveedores.pedidos', 'nombre' => 'Pedidos (kanban)'],
                ['clave' => 'proveedores.ctasctes', 'nombre' => 'Cuentas corrientes'],
                ['clave' => 'proveedores.echeqs', 'nombre' => 'Echeqs'],
                ['clave' => 'proveedores.edoc', 'nombre' => 'Estados de cuenta'],
                ['clave' => 'proveedores.padron', 'nombre' => 'Ficha de proveedores'],
            ],
            'acciones' => [],
        ],
        [
            'grupo' => 'Gerencia',
            'modulo' => 'gerencia',
            'secciones' => [
                ['clave' => 'gerencia.usuarios', 'nombre' => 'Usuarios y roles'],
                ['clave' => 'gerencia.reportes', 'nombre' => 'Reportes de ventas'],
                ['clave' => 'gerencia.rentabilidad', 'nombre' => 'Rentabilidad'],
                ['clave' => 'gerencia.valorizacion', 'nombre' => 'Valorización de stock'],
                ['clave' => 'gerencia.auditoria', 'nombre' => 'Auditoría'],
                ['clave' => 'gerencia.configuracion', 'nombre' => 'Configuración'],
            ],
            'acciones' => [],
        ],
        [
            'grupo' => 'Sistema',
            'modulo' => 'sistema',
            'secciones' => [
                ['clave' => 'sistema.empresa', 'nombre' => 'Empresa'],
                ['clave' => 'sistema.impresion', 'nombre' => 'Impresión'],
                // Registrar un equipo decide en qué sucursal opera TODO el que se siente ahí.
                ['clave' => 'sistema.terminales', 'nombre' => 'Equipos (terminales)'],
                ['clave' => 'sistema.respaldos', 'nombre' => 'Respaldos'],
            ],
            'acciones' => [],
        ],
    ];

    /** @var array<string, true>|null */
    private static ?array $validas = null;

    /** Todas las claves del catálogo, indexadas para consulta O(1). */
    public static function clavesValidas(): array
    {
        if (self::$validas === null) {
            self::$validas = [];
            foreach (self::CATALOGO as $grupo) {
                foreach ([...$grupo['secciones'], ...$grupo['acciones']] as $p) {
                    self::$validas[$p['clave']] = true;
                }
            }
        }

        return self::$validas;
    }

    public static function esValida(string $clave): bool
    {
        return isset(self::clavesValidas()[$clave]) || in_array($clave, self::LEGADAS, true);
    }

    /** El superadmin (`*`) pasa siempre; el resto necesita ALGUNA de las claves. */
    public static function tiene(array $permisos, array $claves): bool
    {
        if (in_array(self::COMODIN, $permisos, true)) {
            return true;
        }
        foreach ($claves as $c) {
            if (in_array($c, $permisos, true)) {
                return true;
            }
        }

        return false;
    }

    /** Todas las claves reales del catálogo (sin legadas ni comodín), para la semilla. */
    public static function todas(): array
    {
        return array_keys(self::clavesValidas());
    }
}
