<?php

namespace App\Services;

use App\Inventario\TransferenciasService;
use App\Models\Producto;
use App\Models\Sucursal;
use Illuminate\Support\Facades\DB;

/**
 * `/bootstrap`: catálogo + existencias en una llamada. Es lo que el panel
 * carga al entrar a Productos/Inventario. NO trae movimientos (crecen sin
 * techo): esos van paginados por `/movimientos`.
 */
class BootstrapService
{
    public function __construct(
        private readonly ProductosService $productos,
        private readonly ListasService $listas,
        private readonly CatalogosService $catalogos,
        private readonly TransferenciasService $transferencias,
        private readonly ConfiguracionService $cfg,
    ) {}

    public function armar(bool $verCostos, ?int $soloSuc): array
    {
        $usuarios = DB::table('usuarios as u')->join('roles as r', 'r.id', '=', 'u.rol_id')
            ->orderBy('u.nombre')
            ->get(['u.id', 'u.nombre', 'u.activo', 'u.rol_id', 'r.clave as rol_clave', 'r.nombre as rol_nombre'])
            ->map(fn ($u) => ['id' => $u->id, 'nombre' => $u->nombre, 'activo' => (bool) $u->activo, 'rolId' => $u->rol_id, 'rolClave' => $u->rol_clave, 'rolNombre' => $u->rol_nombre])
            ->all();

        return [
            'listasCatalogo' => $this->listas->catalogo(),
            'catalogos' => $this->catalogos->catalogo(),
            'sucursales' => Sucursal::query()->orderBy('id')->get()->map(fn ($s) => ['id' => $s->id, 'nombre' => $s->nombre, 'tipo' => $s->tipo, 'puntoVenta' => $s->punto_venta, 'direccion' => $s->direccion])->all(),
            'proveedores' => app(ProveedoresService::class)->listar(),
            'usuarios' => $usuarios,
            'productos' => $this->productos->armar(Producto::query()->orderBy('nombre')->get(), $verCostos),
            'stock' => DB::table('stock')->when($soloSuc, fn ($q) => $q->where('sucursal_id', $soloSuc))
                ->get(['id', 'producto_id as productoId', 'sucursal_id as sucursalId', 'presentacion_id as presentacionId', 'estado', 'cantidad'])
                ->map(fn ($s) => [...(array) $s, 'cantidad' => (float) $s->cantidad])->all(),
            'transferencias' => $this->transferencias->listar($soloSuc),
            'incidencias' => DB::table('incidencias')->when($soloSuc, fn ($q) => $q->where('sucursal_id', $soloSuc))->orderByDesc('id')->get()->all(),
            // El panel replica el cálculo de precios: necesita el mismo redondeo para no mostrar otro número.
            'configVentas' => $this->cfg->get('ventas'),
        ];
    }
}
