<?php

namespace App\Auth;

/**
 * CATÁLOGO DE PLANES — qué incluye cada plan comercial (Emprendedor/Pymes/
 * Corporativo). Es un eje DISTINTO del de `Permisos`: `Permisos` contesta "¿este
 * usuario, dentro de su empresa, puede entrar acá?" (depende del ROL); este
 * catálogo contesta "¿lo que esta empresa contrató incluye esto?" (depende del
 * PLAN de `LicenciaService`, no de quién esté logueado). Las dos cosas se
 * exigen juntas: un Administrador de un cliente Emprendedor sigue siendo
 * Administrador, pero eso no le abre una sección que su plan no incluye.
 *
 * Reusa las claves `modulo.seccion` de `Permisos::CATALOGO` donde ya existen —
 * así el panel puede filtrar con el mismo campo `permiso` que cada sección ya
 * declara, sin mantener un segundo catálogo en JS (ver Pieza 4). Unas pocas
 * claves (`CLAVES_PROPIAS`) son propias de acá: funciones de Compras/Gastos
 * que hoy no tienen un permiso de ROL asociado porque nunca hizo falta
 * distinguir "quién" — son simplemente Corporativo o no.
 *
 * CORPORATIVO NO ENUMERA NADA: es el techo, incluye todo sin lista (misma
 * filosofía de "falla abierta" que `LicenciaService::PLAN_POR_DEFECTO` — una
 * clave que se agregue mañana está disponible en Corporativo sin tocar este
 * archivo). Excepción real: **Web**. Acá figura como "elegible desde
 * Corporativo", pero además sigue pasando por el flag independiente
 * `webHabilitado` (`panel/src/core/config/app.config.js`) — dos candados
 * separados a propósito, porque un cliente puede ser Corporativo y no haber
 * pedido Web todavía.
 */
final class PlanCatalogo
{
    public const PLANES = ['emprendedor', 'pymes', 'corporativo'];

    /**
     * Lo que trae EMPRENDEDOR. Es la base: todo lo que un local solo, de un
     * dueño, necesita para operar el día a día sin ayuda — incluido el
     * asistente de carga de Compras y el módulo de Gastos completos (ver
     * memoria del proyecto: se decidió no limitarlos de más ahí adentro).
     */
    private const EMPRENDEDOR = [
        'dashboard', 'manual',
        'compras.productos', 'compras.catalogos', 'compras.proveedores',
        'compras.facturacion', 'compras.pagos', 'compras.historial',
        'facturas', 'precios', 'etiquetas',
        'ventas.pos', 'ventas.listado', 'ventas.clientes', 'ventas.caja', 'ventas.configuracion',
        'almacen.existencias', 'almacen.operaciones', 'almacen.vencimientos',
        'gastos.gastos', 'gastos.pagos', 'gastos.pagos_proveedor', 'gastos.fijos',
        'gastos.categorias', 'gastos.proveedores', 'gastos.resumen',
        'proveedores.pedidos', 'proveedores.padron',
        'gerencia.usuarios', 'gerencia.configuracion',
        'sistema.empresa', 'sistema.impresion', 'sistema.respaldos',
    ];

    /**
     * Lo que SUMA Pymes por encima de Emprendedor (no lo repite acá). El corte
     * es escala: más de una sucursal, catálogo más grande, más de un
     * empleado cargando facturas.
     */
    private const PYMES_SUMA = [
        'ventas.presupuestos', 'ventas.cobranzas', 'ventas.listas', 'ventas.ofertas', 'ventas.cambios',
        'almacen.conteos', 'almacen.fraccionamiento', 'almacen.transferencias', 'almacen.incidencias',
        'proveedores.ctasctes', 'proveedores.echeqs', 'proveedores.edoc',
        'gerencia.reportes', 'gerencia.rentabilidad',
        'sistema.terminales',
        'sistema.respaldos_auto', // copia diaria automática de la base, guardada en el servidor
    ];

    /**
     * Funciones de Compras/Gastos sin permiso de ROL propio en
     * `Permisos::CATALOGO` (son parte del mismo formulario que el resto,
     * nunca tuvieron su propio candado de "quién"). Quedan Corporativo-
     * exclusivas por AUSENCIA en las dos listas de arriba — listarlas acá no
     * las habilita, es para que Pieza 3 tenga un nombre fijo al que
     * engancharse y no se escriba una clave distinta cada vez.
     */
    private const CLAVES_PROPIAS = [
        'compras.lecturas',        // Bandeja de lectura de facturas (foto/QR/OCR/PDF)
        'compras.cuotas_echeq',    // Compromiso de pago en cuotas / cartera de echeqs
        'compras.costos_masivo',   // % "sin factura" + regla masiva de costos por proveedor/marca
        'gastos.fiscal_avanzado',  // Pie fiscal abierto: impuestos internos, percepción DGI/DGR
        'sistema.respaldos_auto',  // Copia diaria automática (sin permiso de rol propio; el plan es lo que la trae — ver PYMES_SUMA)
    ];

    /**
     * Límites por CANTIDAD — no es on/off, es un tope (lo aplica quien dé de
     * alta una sucursal/usuario, Pieza 3). `null` = sin límite.
     */
    private const LIMITES = [
        'emprendedor' => ['sucursales' => 1, 'usuarios' => 3],
        'pymes' => ['sucursales' => 3, 'usuarios' => 10],
        'corporativo' => ['sucursales' => null, 'usuarios' => null],
    ];

    public static function incluye(string $plan, string $clave): bool
    {
        return match ($plan) {
            'emprendedor' => in_array($clave, self::EMPRENDEDOR, true),
            'pymes' => in_array($clave, self::EMPRENDEDOR, true) || in_array($clave, self::PYMES_SUMA, true),
            'corporativo' => true,
            default => false,
        };
    }

    public static function limite(string $plan, string $recurso): ?int
    {
        return self::LIMITES[$plan][$recurso] ?? null;
    }

    /** Todas las claves que un plan incluye, explícitas. Corporativo devuelve `null`: no tiene lista, es "todas". */
    public static function claves(string $plan): ?array
    {
        return match ($plan) {
            'emprendedor' => self::EMPRENDEDOR,
            'pymes' => [...self::EMPRENDEDOR, ...self::PYMES_SUMA],
            'corporativo' => null,
            default => [],
        };
    }

    /** Toda clave real que existe en el sistema, de rol o propia — para validar que no haya typos. */
    public static function clavesConocidas(): array
    {
        return [...array_keys(Permisos::clavesValidas()), ...self::CLAVES_PROPIAS];
    }
}
