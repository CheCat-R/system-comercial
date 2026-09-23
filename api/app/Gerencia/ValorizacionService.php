<?php

namespace App\Gerencia;

use App\Compras\Documentos;
use App\Precios\CostoEntry;
use App\Precios\Pricing;
use Illuminate\Support\Facades\DB;

/**
 * GERENCIA › VALORIZACIÓN DE STOCK — cuánta plata hay parada en mercadería.
 * ============================================================================
 * Es una FOTO de hoy, no un período: cada fila de `stock` se valúa al costo
 * neto ACTUAL del formato activo del producto — el mismo costo "de hoy" que
 * usa Rentabilidad para su stock sin factura (`Pricing::costoNetoEntry`), no
 * el costo congelado de una venta pasada. Si el costo cambia mañana, este
 * número cambia con él: es intencional, es lo que costaría reponerlo hoy.
 *
 * TODOS los estados entran, incluidos `defectuoso` y `vencido`: son plata
 * parada igual, y "cuánto tenemos tirado ahí" es exactamente la pregunta que
 * esta pantalla existe para contestar. La separación por estado es lo que
 * distingue "vendible" de "trabado" — sumarlos todos en un número escondería
 * justo eso.
 */
class ValorizacionService
{
    private const EPS = 1e-9;

    public function valorizacion(array $q = []): array
    {
        $suc = ! empty($q['sucursalId']) ? (int) $q['sucursalId'] : null;

        $prods = DB::table('productos')->where('estado', '!=', 'archivado')->get(['id', 'nombre', 'marca_id', 'categoria_id', 'iva']);
        $marcas = DB::table('marcas')->pluck('nombre', 'id');
        $categorias = DB::table('categorias')->pluck('nombre', 'id');
        $proveedores = DB::table('proveedores')->pluck('nombre', 'id');
        $sucursales = DB::table('sucursales')->pluck('nombre', 'id');

        // El costo de HOY por producto: el mismo criterio que Rentabilidad (formato activo, sin costo congelado).
        $formatosPorProducto = DB::table('producto_proveedores')->whereIn('producto_id', $prods->pluck('id'))->orderBy('id')->get()->groupBy('producto_id');
        $costoDe = [];
        foreach ($prods as $p) {
            $activo = Pricing::formatoActivo(($formatosPorProducto[$p->id] ?? collect())->all());
            $costoDe[$p->id] = [
                'proveedorId' => $activo->proveedor_id ?? null,
                'costoU' => Pricing::costoNetoEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $p->iva),
            ];
        }

        $stock = DB::table('stock')->where('cantidad', '>', self::EPS)
            ->when($suc, fn ($qb) => $qb->where('sucursal_id', $suc))
            ->get();
        $presIds = $stock->pluck('presentacion_id')->filter()->unique()->all();
        $tamDe = $presIds ? DB::table('presentaciones')->whereIn('id', $presIds)->pluck('tam_kg', 'id') : collect();
        $infoProd = $prods->keyBy('id');

        $porProducto = [];
        $porSucursal = [];
        $porEstado = [];
        $sinCosto = [];
        $totalValor = 0.0;
        $totalProductos = [];

        foreach ($stock as $f) {
            $prod = $infoProd->get($f->producto_id);
            if (! $prod) {
                continue; // archivado: ya no cuenta como mercadería en juego.
            }
            $h = $costoDe[$f->producto_id];
            // La cantidad en unidad BASE del producto (kg o unidad suelta): un paquete escala por su tamaño.
            $escala = $f->presentacion_id ? (float) ($tamDe[$f->presentacion_id] ?? 0) : 1.0;
            $cantidadBase = (float) $f->cantidad * $escala;
            $valor = $cantidadBase * $h['costoU'];

            if ($h['costoU'] <= self::EPS) {
                $sinCosto[$f->producto_id] = true;
            }
            $totalValor += $valor;
            $totalProductos[$f->producto_id] = true;

            $porProducto[$f->producto_id] ??= [
                'productoId' => $prod->id, 'nombre' => $prod->nombre,
                'marcaId' => $prod->marca_id, 'marca' => $marcas[$prod->marca_id ?? 0] ?? '',
                'categoriaId' => $prod->categoria_id, 'categoria' => $categorias[$prod->categoria_id ?? 0] ?? '',
                'proveedorId' => $h['proveedorId'], 'proveedor' => $proveedores[$h['proveedorId'] ?? 0] ?? '',
                'unidades' => 0.0, 'costoUnitario' => $h['costoU'], 'valor' => 0.0, 'sinCosto' => $h['costoU'] <= self::EPS,
            ];
            $porProducto[$f->producto_id]['unidades'] += $cantidadBase;
            $porProducto[$f->producto_id]['valor'] += $valor;

            $porSucursal[$f->sucursal_id] ??= ['sucursalId' => $f->sucursal_id, 'sucursal' => $sucursales[$f->sucursal_id] ?? 'Sin sucursal', 'valor' => 0.0, 'productos' => []];
            $porSucursal[$f->sucursal_id]['valor'] += $valor;
            $porSucursal[$f->sucursal_id]['productos'][$f->producto_id] = true;

            $porEstado[$f->estado] ??= ['estado' => $f->estado, 'valor' => 0.0, 'productos' => []];
            $porEstado[$f->estado]['valor'] += $valor;
            $porEstado[$f->estado]['productos'][$f->producto_id] = true;
        }

        $cerrarGrupo = fn (array $g) => ['valor' => Documentos::money($g['valor']), 'productos' => count($g['productos'])];

        return [
            'total' => [
                'valor' => Documentos::money($totalValor),
                'productos' => count($totalProductos),
            ],
            'sinCosto' => [
                'productos' => count($sinCosto),
            ],
            'porSucursal' => collect($porSucursal)->map(fn ($g) => [...$cerrarGrupo($g), 'sucursalId' => $g['sucursalId'], 'sucursal' => $g['sucursal']])
                ->sortByDesc('valor')->values()->all(),
            'porEstado' => collect($porEstado)->map(fn ($g) => [...$cerrarGrupo($g), 'estado' => $g['estado']])
                ->sortByDesc('valor')->values()->all(),
            'porProducto' => collect($porProducto)->map(fn ($x) => [
                ...$x, 'unidades' => Documentos::money($x['unidades']), 'costoUnitario' => Documentos::money($x['costoUnitario']), 'valor' => Documentos::money($x['valor']),
            ])->sortByDesc('valor')->values()->all(),
        ];
    }
}
