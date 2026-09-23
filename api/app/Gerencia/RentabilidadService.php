<?php

namespace App\Gerencia;

use App\Compras\Documentos;
use App\Precios\CostoEntry;
use App\Precios\Pricing;
use Illuminate\Support\Facades\DB;

/**
 * GERENCIA › RENTABILIDAD — el margen de verdad.
 * ============================================================================
 * El tablero que responde las preguntas que las pantallas operativas no
 * pueden: cuánto se ganó DE VERDAD, cuánto IVA está absorbiendo el negocio
 * por la mercadería sin factura, y si el crédito fiscal de lo facturado
 * alcanza a cubrir el débito de lo que se vende con factura.
 *
 * TODO EL MARGEN SALE DEL COSTO CONGELADO en cada renglón de venta
 * (`venta_items.costo_unitario`). Los renglones anteriores a esa fecha no lo
 * tienen (NULL) y acá NO se inventa: se saltean y el payload dice cuántos son
 * (`cobertura`). Un margen calculado con el costo de hoy sobre una venta de
 * hace tres meses es un número plausible y falso.
 *
 * Dos vocabularios, siempre juntos:
 *   margen real     = venta neta − costo real congelado. La plata que quedó.
 *   margen aparente = margen real + IVA absorbido. El que "se ve" si uno mira
 *                     solo el markup — se muestra al lado del real justamente
 *                     para que la diferencia (el IVA absorbido) tenga cara.
 */
class RentabilidadService
{
    public function rentabilidad(array $q = []): array
    {
        $hoy = Documentos::hoy();
        $desde = ! empty($q['desde']) ? Documentos::fecha($q['desde']) : $hoy->copy()->startOfMonth();
        // Tope EXCLUSIVO: la medianoche del día siguiente, justa — no "fin de día + 1s"
        // (eso deja pasar hasta el segundo siguiente a la medianoche real).
        $hastaEx = ! empty($q['hasta']) ? Documentos::fecha($q['hasta'])->addDay() : $hoy->copy()->addDay();
        $suc = ! empty($q['sucursalId']) ? (int) $q['sucursalId'] : null;

        $filasVenta = $this->ventasPorProducto($desde, $hastaEx, $suc);
        $fiscalVentas = $this->fiscalVentas($desde, $hastaEx, $suc);
        $filasCompra = $this->comprasPorProveedor($desde, $hastaEx);
        $creditoGastos = $this->creditoGastos($desde, $hastaEx);

        $provRows = DB::table('proveedores')->get(['id', 'nombre', 'porc_sin_factura'])->keyBy('id');
        $prods = DB::table('productos')->where('estado', '!=', 'archivado')->get(['id', 'nombre', 'marca_id', 'categoria_id', 'iva']);
        $marcas = DB::table('marcas')->pluck('nombre', 'id');
        $categorias = DB::table('categorias')->pluck('nombre', 'id');

        // El formato activo de cada producto: proveedor, % sin factura y costos de HOY.
        $formatosPorProducto = DB::table('producto_proveedores')->whereIn('producto_id', $prods->pluck('id'))->orderBy('id')->get()->groupBy('producto_id');
        $hoyDe = [];
        foreach ($prods as $p) {
            $activo = Pricing::formatoActivo(($formatosPorProducto[$p->id] ?? collect())->all());
            $cf = Pricing::costosFormato($activo ? CostoEntry::desde((array) $activo) : null, (float) $p->iva);
            $hoyDe[$p->id] = [
                'proveedorId' => $activo->proveedor_id ?? null,
                'porcAhora' => $cf->porcSinFactura,
                'costoU' => $cf->costoNetoUnitario,
                'ivaAbsU' => $cf->ivaAbsorbidoUnitario,
            ];
        }

        $infoProd = $prods->keyBy('id');
        $porProductoOut = [];
        foreach ($filasVenta as $f) {
            $p = $infoProd->get($f->producto_id);
            $h = $hoyDe[$f->producto_id] ?? null;
            $margenReal = $f->costo !== null ? Documentos::money((float) $f->venta_costeada - (float) $f->costo) : null;
            $margenAparente = $margenReal !== null ? Documentos::money($margenReal + (float) ($f->iva_absorbido ?? 0)) : null;
            $ventaCosteada = Documentos::money((float) $f->venta_costeada);
            $porProductoOut[] = [
                'productoId' => (int) $f->producto_id,
                'nombre' => $p->nombre ?? ('#'.$f->producto_id),
                'marcaId' => $p->marca_id ?? null,
                'marca' => $marcas[$p->marca_id ?? 0] ?? '',
                'categoriaId' => $p->categoria_id ?? null,
                'categoria' => $categorias[$p->categoria_id ?? 0] ?? '',
                'proveedorId' => $h['proveedorId'] ?? null,
                'proveedor' => $provRows[$h['proveedorId'] ?? 0]->nombre ?? '',
                'unidades' => Documentos::money((float) $f->unidades),
                'ventaNeta' => Documentos::money((float) $f->venta_neta),
                'ventaCosteada' => $ventaCosteada,
                'costo' => $f->costo !== null ? Documentos::money((float) $f->costo) : null,
                'margenReal' => $margenReal,
                'margenAparente' => $margenAparente,
                'ivaAbsorbido' => Documentos::money((float) ($f->iva_absorbido ?? 0)),
                'margenRealPct' => ($margenReal !== null && $ventaCosteada > 0) ? Documentos::money(($margenReal / $ventaCosteada) * 100) : null,
                'sinFactura' => (bool) $f->sin_factura,
                'porcAhora' => $h['porcAhora'] ?? 0,
                'renglones' => (int) $f->renglones,
                'conCosto' => (int) $f->con_costo,
            ];
        }
        usort($porProductoOut, fn ($a, $b) => $b['ventaNeta'] <=> $a['ventaNeta']);
        // Los totales y sinFactura se calculan sobre TODOS los productos: el
        // recorte a 500 es solo para lo que se devuelve, no puede achicar el dashboard.
        $productosRecortados = max(0, count($porProductoOut) - 500);

        $sum = fn (callable $fn) => array_sum(array_map($fn, $porProductoOut));
        $totales = [
            'ventaNeta' => Documentos::money($sum(fn ($x) => $x['ventaNeta'])),
            'ventaCosteada' => Documentos::money($sum(fn ($x) => $x['ventaCosteada'])),
            'costoReal' => Documentos::money($sum(fn ($x) => $x['costo'] ?? 0)),
            'margenReal' => Documentos::money($sum(fn ($x) => $x['margenReal'] ?? 0)),
            'margenAparente' => Documentos::money($sum(fn ($x) => $x['margenAparente'] ?? 0)),
            'ivaAbsorbido' => Documentos::money($sum(fn ($x) => $x['ivaAbsorbido'])),
        ];
        $sf = array_values(array_filter($porProductoOut, fn ($x) => $x['sinFactura']));
        $sinFactura = [
            'productos' => count($sf),
            'ventaNeta' => Documentos::money(array_sum(array_column($sf, 'ventaNeta'))),
            'margenReal' => Documentos::money(array_sum(array_map(fn ($x) => $x['margenReal'] ?? 0, $sf))),
            'ivaAbsorbido' => Documentos::money(array_sum(array_column($sf, 'ivaAbsorbido'))),
            'participacion' => $totales['ventaNeta'] > 0 ? Documentos::money((array_sum(array_column($sf, 'ventaNeta')) / $totales['ventaNeta']) * 100) : 0,
        ];

        $creditoCompras = Documentos::money(array_sum(array_column($filasCompra, 'ivaCredito')));
        $fiscal = [
            'debitoVentas' => Documentos::money($fiscalVentas['debito']),
            'ventasFacturadas' => $fiscalVentas['cantidad'],
            'creditoCompras' => $creditoCompras,
            'creditoGastos' => Documentos::money($creditoGastos),
            'posicion' => Documentos::money($fiscalVentas['debito'] - $creditoCompras - $creditoGastos),
        ];

        $porProveedor = [];
        foreach ($filasCompra as $c) {
            $prov = $provRows[$c['proveedorId']] ?? null;
            $base = $c['facturadoNeto'] + $c['liquidado'];
            $porcReal = $base > 0 ? Documentos::money(($c['liquidado'] / $base) * 100) : 0;
            $declarado = (float) ($prov->porc_sin_factura ?? 0);
            if ($c['liquidado'] <= 0 && $declarado <= 0) {
                continue;
            }
            $porProveedor[] = [
                'proveedorId' => $c['proveedorId'],
                'nombre' => $prov->nombre ?? ('#'.$c['proveedorId']),
                'facturadoNeto' => Documentos::money($c['facturadoNeto']),
                'liquidado' => Documentos::money($c['liquidado']),
                'ivaCredito' => Documentos::money($c['ivaCredito']),
                'porcReal' => $porcReal,
                'porcDeclarado' => $declarado,
                // El control: si lo declarado y lo real difieren en serio, el costo de esos productos está mal partido.
                'desvio' => ($declarado > 0 || $c['liquidado'] > 0) && $base > 0 && abs($porcReal - $declarado) > 10,
            ];
        }
        usort($porProveedor, fn ($a, $b) => $b['liquidado'] <=> $a['liquidado']);
        $compras = [
            'facturadoNeto' => Documentos::money(array_sum(array_column($filasCompra, 'facturadoNeto'))),
            'liquidado' => Documentos::money(array_sum(array_column($filasCompra, 'liquidado'))),
        ];

        $stockSinFactura = $this->stockSinFactura($prods, $hoyDe);

        return [
            'periodo' => ['desde' => $desde->toIso8601String(), 'hasta' => $hastaEx->toIso8601String()],
            'cobertura' => [
                'renglones' => array_sum(array_map(fn ($f) => (int) $f->renglones, $filasVenta)),
                'conCosto' => array_sum(array_map(fn ($f) => (int) $f->con_costo, $filasVenta)),
            ],
            'totales' => $totales,
            'sinFactura' => $sinFactura,
            'fiscal' => $fiscal,
            'compras' => $compras,
            'porProveedor' => $porProveedor,
            'stockSinFactura' => $stockSinFactura,
            'porProducto' => array_slice($porProductoOut, 0, 500),
            'productosRecortados' => $productosRecortados,
        ];
    }

    /** Venta neta, costo congelado e IVA absorbido, agrupados por producto. */
    private function ventasPorProducto($desde, $hastaEx, ?int $sucursalId): array
    {
        // UNA DEVOLUCIÓN RESTA: los renglones de una nota de crédito entran con signo negativo,
        // si no una devolución aparecería como haber vendido DOS veces (unidades, venta y costo inflados).
        $signo = "(case when v.tipo like 'nota_credito%' then -1 else 1 end)";
        $noEsNota = "v.tipo not like 'nota_credito%'";

        $qb = DB::table('venta_items as vi')->join('ventas as v', 'v.id', '=', 'vi.venta_id')
            ->where('v.fecha', '>=', $desde)->where('v.fecha', '<', $hastaEx)
            ->whereIn('v.estado', ['confirmada', 'pendiente_cae']);
        if ($sucursalId) {
            $qb->where('v.sucursal_id', $sucursalId);
        }

        return $qb->groupBy('vi.producto_id')->selectRaw(
            "vi.producto_id,
             sum(vi.cantidad * {$signo}) as unidades,
             sum(vi.subtotal * {$signo}) as venta_neta,
             coalesce(sum(case when vi.costo_unitario is not null then vi.subtotal * {$signo} else 0 end), 0) as venta_costeada,
             sum(vi.cantidad * vi.costo_unitario * {$signo}) as costo,
             coalesce(sum(vi.cantidad * vi.iva_absorbido_unitario * {$signo}), 0) as iva_absorbido,
             sum(case when {$noEsNota} then 1 else 0 end) as renglones,
             sum(case when {$noEsNota} and vi.costo_unitario is not null then 1 else 0 end) as con_costo,
             max(case when coalesce(vi.porc_sin_factura, 0) > 0 then 1 else 0 end) as sin_factura"
        )->get()->all();
    }

    /** El débito fiscal: IVA de las ventas con factura (el ticket no declara). */
    private function fiscalVentas($desde, $hastaEx, ?int $sucursalId): array
    {
        $tipos = ['factura_a', 'factura_b', 'factura_c', 'nota_credito_a', 'nota_credito_b', 'nota_credito_c'];
        $qb = DB::table('ventas')->where('fecha', '>=', $desde)->where('fecha', '<', $hastaEx)
            ->whereIn('estado', ['confirmada', 'pendiente_cae'])->whereIn('tipo', $tipos);
        if ($sucursalId) {
            $qb->where('sucursal_id', $sucursalId);
        }
        $r = $qb->selectRaw(
            "coalesce(sum(iva_total * (case when tipo like 'nota_credito%' then -1 else 1 end)), 0) as debito,
             sum(case when tipo not like 'nota_credito%' then 1 else 0 end) as cantidad"
        )->first();

        return ['debito' => (float) ($r->debito ?? 0), 'cantidad' => (int) ($r->cantidad ?? 0)];
    }

    /**
     * Las compras del período, por proveedor: el neto facturado (con su IVA, que es
     * crédito) contra lo liquidado (sin nada). Las notas de crédito restan de lo
     * facturado — una devolución grande sin restar diría que se compró de más.
     */
    private function comprasPorProveedor($desde, $hastaEx): array
    {
        return DB::table('comprobantes')->where('fecha', '>=', $desde)->where('fecha', '<', $hastaEx)->where('estado', 'confirmado')
            ->groupBy('proveedor_id')->selectRaw(
                "proveedor_id,
                 coalesce(sum(case when tipo = 'factura' then subtotal_neto else 0 end), 0)
                   + coalesce(sum(case when tipo = 'nota_debito' then subtotal_neto else 0 end), 0)
                   - coalesce(sum(case when tipo = 'nota_credito' then subtotal_neto else 0 end), 0) as facturado_neto,
                 coalesce(sum(case when tipo = 'liquidacion' then subtotal_neto else 0 end), 0) as liquidado,
                 coalesce(sum(case when tipo = 'factura' then iva_total else 0 end), 0)
                   + coalesce(sum(case when tipo = 'nota_debito' then iva_total else 0 end), 0)
                   - coalesce(sum(case when tipo = 'nota_credito' then iva_total else 0 end), 0) as iva_credito"
            )->get()->map(fn ($r) => [
                'proveedorId' => (int) $r->proveedor_id,
                'facturadoNeto' => (float) $r->facturado_neto,
                'liquidado' => (float) $r->liquidado,
                'ivaCredito' => (float) $r->iva_credito,
            ])->all();
    }

    /** El IVA de los gastos facturados: también es crédito, también cubre. */
    private function creditoGastos($desde, $hastaEx): float
    {
        return (float) DB::table('gastos')->where('fecha', '>=', $desde)->where('fecha', '<', $hastaEx)
            ->where('estado', '!=', 'anulado')->sum('iva');
    }

    /**
     * Lo sin factura PARADO en el depósito: valor real y el IVA que el negocio va a
     * absorber si lo vende todo. Global (todas las sucursales): la exposición es
     * del negocio, no de un local.
     */
    private function stockSinFactura($prods, array $hoyDe): array
    {
        $ids = $prods->filter(fn ($p) => ($hoyDe[$p->id]['porcAhora'] ?? 0) > 0)->pluck('id')->all();
        if (! $ids) {
            return ['productos' => 0, 'valorReal' => 0, 'ivaAbsorber' => 0];
        }
        $filas = DB::table('stock')->whereIn('producto_id', $ids)->where('estado', 'disponible')->where('cantidad', '>', 1e-9)->get();
        $presIds = $filas->pluck('presentacion_id')->filter()->unique()->all();
        $tamDe = $presIds ? DB::table('presentaciones')->whereIn('id', $presIds)->pluck('tam_kg', 'id') : collect();

        $valorReal = 0.0;
        $ivaAbsorber = 0.0;
        $conStock = [];
        foreach ($filas as $f) {
            $h = $hoyDe[$f->producto_id] ?? null;
            if (! $h) {
                continue;
            }
            $escala = $f->presentacion_id ? (float) ($tamDe[$f->presentacion_id] ?? 0) : 1.0;
            $valorReal += $f->cantidad * $h['costoU'] * $escala;
            $ivaAbsorber += $f->cantidad * $h['ivaAbsU'] * $escala;
            $conStock[$f->producto_id] = true;
        }

        return ['productos' => count($conStock), 'valorReal' => Documentos::money($valorReal), 'ivaAbsorber' => Documentos::money($ivaAbsorber)];
    }
}
