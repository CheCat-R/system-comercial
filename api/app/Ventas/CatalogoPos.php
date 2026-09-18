<?php

namespace App\Ventas;

use App\Precios\CostoEntry;
use App\Precios\FilaVenta;
use App\Precios\OpcionesPrecio;
use App\Precios\Pricing;
use App\Services\ConfiguracionService;
use App\Services\ListasService;
use App\Services\OfertasService;
use Illuminate\Support\Facades\DB;

/**
 * Todo lo VENDIBLE, con precios y stock ya resueltos: una fila por cosa que se
 * puede tipear en la caja (el producto entero, el granel suelto por kg y cada
 * presentación fraccionada). El POS lo pide UNA vez al abrir y busca en
 * memoria. Cada fila trae el stock de la sucursal, el de todas, y su formato
 * de venta (precio por lista con el mínimo que la habilita). Sin N+1.
 */
class CatalogoPos
{
    public function __construct(private readonly ListasService $listas, private readonly OfertasService $ofertas, private readonly ConfiguracionService $cfg) {}

    public function armar(int $sucursalId): array
    {
        $prods = DB::table('productos')->where('estado', '!=', 'archivado')->orderBy('nombre')->get();
        $provs = DB::table('producto_proveedores')->get()->groupBy('producto_id');
        $formatos = DB::table('producto_listas')->get();
        $cat = $this->listas->catalogo();
        $press = DB::table('presentaciones')->get()->groupBy('producto_id');
        $existencias = DB::table('stock')->where('estado', 'disponible')->get();
        $sucs = DB::table('sucursales')->orderBy('nombre')->get(['id', 'nombre']);
        $cfg = $this->cfg->get('ventas');
        $nombreMarca = DB::table('marcas')->pluck('nombre', 'id');
        $nombreCategoria = DB::table('categorias')->pluck('nombre', 'id');
        $etiqs = DB::table('producto_etiquetas')->get()->groupBy('producto_id');

        $redondeo = (float) ($cfg['redondeoPrecio'] ?? 0);
        $activas = array_values(array_filter($cat['listas'], fn ($l) => $l['activa']));
        $porLista = collect($activas)->keyBy('id');
        $listaBase = collect($activas)->firstWhere('id', (int) ($cfg['listaBaseId'] ?? 0)) ?? ($activas[0] ?? null);

        $clave = fn (int $prodId, ?int $presId, int $sucId) => $prodId.':'.($presId ?? '').':'.$sucId;
        $stockDe = [];
        foreach ($existencias as $e) {
            $k = $clave((int) $e->producto_id, $e->presentacion_id ? (int) $e->presentacion_id : null, (int) $e->sucursal_id);
            $stockDe[$k] = ($stockDe[$k] ?? 0) + (float) $e->cantidad;
        }
        $desglose = fn (int $prodId, ?int $presId) => $sucs->map(fn ($su) => ['sucursalId' => $su->id, 'nombre' => $su->nombre, 'cantidad' => Pricing::money($stockDe[$clave($prodId, $presId, (int) $su->id)] ?? 0)])->all();

        $formatosDe = $formatos->groupBy(fn ($f) => $f->producto_id.':'.($f->presentacion_id ?? ''));
        $items = [];
        foreach ($prods as $p) {
            $activo = Pricing::formatoActivo(($provs->get($p->id) ?? collect())->all());
            $costoNeto = Pricing::costoPrecioEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $p->iva);
            $opts = new OpcionesPrecio((float) $p->iva, (float) ($p->redondeo ?? $redondeo));
            $misEtq = ($etiqs->get($p->id) ?? collect())->pluck('etiqueta_id')->map(fn ($x) => (int) $x)->all();
            $misProv = ($provs->get($p->id) ?? collect())->pluck('proveedor_id')->unique()->map(fn ($x) => (int) $x)->values()->all();

            $efectivasDe = function (?int $presId, float $costo) use ($formatosDe, $p, $porLista, $opts) {
                return ($formatosDe->get($p->id.':'.($presId ?? '')) ?? collect())
                    ->filter(fn ($f) => $porLista->has($f->lista_id))
                    ->map(function ($f) use ($costo, $opts, $porLista) {
                        $pv = Pricing::precioVentaFila($costo, FilaVenta::desde((array) $f), $opts);

                        return ['listaId' => (int) $f->lista_id, 'orden' => $porLista->get($f->lista_id)['orden'], 'precio' => Pricing::money($pv->netoUnitario), 'precioFinal' => Pricing::money($pv->finalUnitario),
                            'unidadesMinimas' => (float) $f->unidades_minimas, 'unidades' => (float) $f->unidades, 'codigoBarras' => $f->codigo_barras];
                    })->sortBy('orden')->values();
            };
            $comun = [
                'productoId' => (int) $p->id, 'codigoPropio' => $p->codigo_propio, 'nombre' => $p->nombre, 'marcaId' => $p->marca_id, 'marca' => $nombreMarca[$p->marca_id] ?? '',
                'categoriaId' => $p->categoria_id, 'categoria' => $nombreCategoria[$p->categoria_id] ?? '', 'etiquetas' => $misEtq, 'proveedorIds' => $misProv,
                'tipo' => $p->tipo, 'iva' => (float) $p->iva, 'etiquetaMarca' => $p->etiqueta_marca, 'etiquetaNombre' => $p->etiqueta_nombre,
            ];
            $filaPiso = fn ($efectivas) => $efectivas->firstWhere('listaId', $listaBase['id'] ?? null) ?? $efectivas->last();
            $precios = fn ($ef) => $ef->map(fn ($e) => ['listaId' => $e['listaId'], 'precio' => $e['precio'], 'precioFinal' => $e['precioFinal'], 'unidadesMinimas' => $e['unidadesMinimas'], 'unidades' => $e['unidades']])->all();
            $formatosVenta = fn ($ef) => $ef->filter(fn ($e) => $e['codigoBarras'] || $e['unidades'] > 1)->map(fn ($e) => ['listaId' => $e['listaId'], 'codigoBarras' => $e['codigoBarras'], 'unidades' => $e['unidades']])->values()->all();

            $efectivas = $efectivasDe(null, $costoNeto);
            // El "solo para fraccionar" no viaja suelto: no está a la venta por kg.
            if (! $p->solo_fraccionar) {
                $piso = $filaPiso($efectivas);
                $items[] = [...$comun, 'key' => 'p'.$p->id, 'presentacionId' => null, 'codigo' => $p->codigo_barras ?: $p->codigo_propio, 'codigoBarras' => $p->codigo_barras,
                    'detalle' => $p->tipo === 'granel' ? 'Suelto (por kg)' : 'Unidad', 'unidad' => $p->tipo === 'granel' ? 'kg' : 'u', 'fraccionable' => $p->tipo === 'granel',
                    'precio' => Pricing::money($piso['precio'] ?? 0), 'precioFinal' => Pricing::money($piso['precioFinal'] ?? 0), 'sinFormato' => $efectivas->isEmpty(),
                    'precios' => $precios($efectivas), 'formatosVenta' => $formatosVenta($efectivas),
                    'stock' => Pricing::money($stockDe[$clave((int) $p->id, null, $sucursalId)] ?? 0), 'stockSucursales' => $desglose((int) $p->id, null)];
            }
            foreach ($press->get($p->id) ?? [] as $pres) {
                $suyas = $efectivasDe((int) $pres->id, Pricing::costoNetoPresentacion($costoNeto, (float) $pres->tam_kg));
                $pisoPres = $filaPiso($suyas);
                $tam = (float) $pres->tam_kg;
                $items[] = [...$comun, 'key' => 's'.$pres->id, 'presentacionId' => (int) $pres->id, 'codigo' => $pres->codigo_barras, 'codigoBarras' => $pres->codigo_barras,
                    'detalle' => $tam < 1 ? round($tam * 1000).' g' : $tam.' kg', 'unidad' => 'u', 'fraccionable' => false,
                    'precio' => Pricing::money($pisoPres['precio'] ?? 0), 'precioFinal' => Pricing::money($pisoPres['precioFinal'] ?? 0), 'sinFormato' => $suyas->isEmpty(),
                    'precios' => $precios($suyas), 'formatosVenta' => $formatosVenta($suyas),
                    'stock' => Pricing::money($stockDe[$clave((int) $p->id, (int) $pres->id, $sucursalId)] ?? 0), 'stockSucursales' => $desglose((int) $p->id, (int) $pres->id)];
            }
        }

        return [
            'listas' => array_map(fn ($l) => ['listaId' => $l['id'], 'modalidadId' => $l['modalidadId'], 'modalidad' => $l['modalidad'], 'modalidadOrden' => $l['modalidadOrden'] ?? 0,
                'numero' => $l['numero'], 'nombre' => $l['nombre'], 'etiqueta' => $l['etiqueta'], 'orden' => $l['orden'], 'esBase' => $l['id'] === ($listaBase['id'] ?? null)], $activas),
            'reglasMarca' => array_values(array_map(fn ($r) => ['marcaId' => $r['marcaId'], 'marca' => $r['marca'], 'unidadesMinimas' => $r['unidadesMinimas'], 'modalidadId' => $r['modalidadId'], 'modalidad' => $r['modalidad']],
                array_filter($cat['reglasMarca'], fn ($r) => $r['activa'] && $r['unidadesMinimas'] > 0))),
            'montoMayorista' => ((float) ($cfg['montoMinimoMayorista'] ?? 0) > 0 && ! empty($cfg['modalidadMontoId']))
                ? ['monto' => (float) $cfg['montoMinimoMayorista'], 'modalidadId' => (int) $cfg['modalidadMontoId'],
                    'modalidad' => collect($cat['modalidades'])->firstWhere('id', (int) $cfg['modalidadMontoId'])['nombre'] ?? '', 'mediosPago' => $cfg['mediosPagoMonto'] ?? []]
                : null,
            'ofertas' => $this->ofertas->activas(),
            'etiquetasCatalogo' => DB::table('etiquetas')->orderBy('nombre')->get(['id', 'nombre'])->all(),
            'proveedoresCatalogo' => DB::table('proveedores')->orderBy('nombre')->get(['id', 'nombre'])->all(),
            'items' => $items,
        ];
    }
}
