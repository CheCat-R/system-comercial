<?php

namespace App\Gerencia;

use App\Compras\Documentos;
use App\Precios\Pricing;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * GERENCIA › REPORTES DE VENTAS — cómo viene el mostrador.
 * ============================================================================
 * A diferencia de Rentabilidad (el margen, que depende del costo congelado),
 * esto es pura foto de `ventas`/`venta_items`/`venta_pagos`: no necesita
 * costo, así que no tiene "cobertura" ni renglones que quedan afuera.
 *
 * UNA NOTA DE CRÉDITO RESTA: guarda su importe en positivo (como cualquier
 * comprobante), así que en todas las sumas se la multiplica por -1. Es el
 * mismo `$signo` que usa Rentabilidad y la cuenta corriente de Ventas — no
 * se inventa acá, se reutiliza el criterio ya establecido.
 *
 * `fecha` vive en UTC (así la escribe `Carbon::now()`), pero el día del
 * cajero es el día ARGENTINO: agrupar "por día" con la fecha cruda partiría
 * el turno de la noche en dos. Por eso el agrupado usa
 * `CONVERT_TZ(fecha, '+00:00', '-03:00')`, el mismo patrón que ya usa
 * Vencimientos para sus reportes por mes.
 */
class ReportesVentasService
{
    private const ESTADOS_VALIDOS = ['confirmada', 'pendiente_cae'];

    private const EPS = 1e-9;

    /** `$col` sin calificar alcanza mientras la consulta no junte otra tabla con su propio `tipo` (sucursales, productos…). */
    private static function signo(string $col = 'tipo'): string
    {
        return "(case when {$col} like 'nota_credito%' then -1 else 1 end)";
    }

    public function reportes(array $q = []): array
    {
        $hoy = Documentos::hoy();
        $desde = ! empty($q['desde']) ? Documentos::fecha($q['desde']) : $hoy->copy()->startOfMonth();
        // Tope EXCLUSIVO: la medianoche del día siguiente, justa.
        $hastaEx = ! empty($q['hasta']) ? Documentos::fecha($q['hasta'])->addDay() : $hoy->copy()->addDay();
        $suc = ! empty($q['sucursalId']) ? (int) $q['sucursalId'] : null;

        // El período ANTERIOR, mismo largo, pegado justo antes — para la comparativa.
        $segundos = $desde->diffInSeconds($hastaEx);
        $desdeAnt = $desde->copy()->subSeconds($segundos);
        $hastaExAnt = $desde->copy();

        $actual = $this->resumenPeriodo($desde, $hastaEx, $suc);
        $anterior = $this->resumenPeriodo($desdeAnt, $hastaExAnt, $suc);
        $variacion = fn (float $a, float $b) => $b > 0 ? Pricing::money((($a - $b) / $b) * 100) : null;

        return [
            'periodo' => ['desde' => $desde->toIso8601String(), 'hasta' => $hastaEx->copy()->subSecond()->toIso8601String()],
            'resumen' => $actual,
            'anterior' => [
                ...$anterior,
                'periodo' => ['desde' => $desdeAnt->toIso8601String(), 'hasta' => $hastaExAnt->copy()->subSecond()->toIso8601String()],
            ],
            'variacionVentaPct' => $variacion($actual['ventaNeta'], $anterior['ventaNeta']),
            'variacionTicketsPct' => $variacion((float) $actual['tickets'], (float) $anterior['tickets']),
            'porDia' => $this->porDia($desde, $hastaEx, $suc),
            // Con una sucursal ya elegida, el desglose por sucursal es el mismo número partido en uno: no aporta.
            'porSucursal' => $suc ? [] : $this->porSucursal($desde, $hastaEx),
            'porVendedor' => $this->porVendedor($desde, $hastaEx, $suc),
            'porMedioPago' => $this->porMedioPago($desde, $hastaEx, $suc),
            'topProductos' => $this->topProductos($desde, $hastaEx, $suc),
        ];
    }

    private function base(Carbon $desde, Carbon $hastaEx, ?int $suc, string $alias = ''): \Illuminate\Database\Query\Builder
    {
        $p = $alias ? $alias.'.' : '';

        return DB::table($alias ? 'ventas as '.$alias : 'ventas')
            ->whereIn($p.'estado', self::ESTADOS_VALIDOS)
            ->where($p.'fecha', '>=', $desde)->where($p.'fecha', '<', $hastaEx)
            ->when($suc, fn ($qb) => $qb->where($p.'sucursal_id', $suc));
    }

    /** Los números del período: bruto vendido, lo devuelto en notas de crédito, y lo que queda neto. */
    private function resumenPeriodo(Carbon $desde, Carbon $hastaEx, ?int $suc): array
    {
        $r = $this->base($desde, $hastaEx, $suc)->selectRaw("
            coalesce(sum(case when tipo not like 'nota_credito%' then total else 0 end), 0) as venta_bruta,
            coalesce(sum(case when tipo like 'nota_credito%' then total else 0 end), 0) as devuelto,
            sum(case when tipo not like 'nota_credito%' then 1 else 0 end) as tickets,
            sum(case when tipo like 'nota_credito%' then 1 else 0 end) as devoluciones
        ")->first();
        $bruta = (float) $r->venta_bruta;
        $devuelto = (float) $r->devuelto;
        $tickets = (int) $r->tickets;

        return [
            'ventaBruta' => Pricing::money($bruta),
            'devuelto' => Pricing::money($devuelto),
            'ventaNeta' => Pricing::money($bruta - $devuelto),
            'tickets' => $tickets,
            'devoluciones' => (int) $r->devoluciones,
            'ticketPromedio' => $tickets > 0 ? Pricing::money($bruta / $tickets) : 0.0,
        ];
    }

    /** Serie diaria (día ARGENTINO), para el gráfico de evolución. */
    private function porDia(Carbon $desde, Carbon $hastaEx, ?int $suc): array
    {
        return $this->base($desde, $hastaEx, $suc)->selectRaw("
            DATE(CONVERT_TZ(fecha, '+00:00', '-03:00')) as dia,
            coalesce(sum(total * ".self::signo()."), 0) as venta_neta,
            sum(case when tipo not like 'nota_credito%' then 1 else 0 end) as tickets
        ")->groupBy('dia')->orderBy('dia')->get()
            ->map(fn ($r) => ['fecha' => $r->dia, 'ventaNeta' => Pricing::money((float) $r->venta_neta), 'tickets' => (int) $r->tickets])
            ->all();
    }

    private function porSucursal(Carbon $desde, Carbon $hastaEx): array
    {
        return $this->base($desde, $hastaEx, null, 'v')
            ->leftJoin('sucursales as s', 's.id', '=', 'v.sucursal_id')
            ->groupBy('v.sucursal_id', 's.nombre')
            ->selectRaw("
                v.sucursal_id, coalesce(s.nombre, 'Sin sucursal') as sucursal,
                coalesce(sum(v.total * ".self::signo('v.tipo')."), 0) as venta_neta,
                sum(case when v.tipo not like 'nota_credito%' then 1 else 0 end) as tickets
            ")
            ->orderByDesc('venta_neta')
            ->get()->map(fn ($r) => [
                'sucursalId' => $r->sucursal_id, 'sucursal' => $r->sucursal,
                'ventaNeta' => Pricing::money((float) $r->venta_neta), 'tickets' => (int) $r->tickets,
                'ticketPromedio' => $r->tickets > 0 ? Pricing::money((float) $r->venta_neta / $r->tickets) : 0.0,
            ])->all();
    }

    private function porVendedor(Carbon $desde, Carbon $hastaEx, ?int $suc): array
    {
        return $this->base($desde, $hastaEx, $suc, 'v')
            ->leftJoin('usuarios as u', 'u.id', '=', 'v.usuario_id')
            ->groupBy('v.usuario_id', 'u.nombre')
            ->selectRaw("
                v.usuario_id, coalesce(u.nombre, 'Sin vendedor') as usuario,
                coalesce(sum(v.total * ".self::signo('v.tipo')."), 0) as venta_neta,
                sum(case when v.tipo not like 'nota_credito%' then 1 else 0 end) as tickets
            ")
            ->orderByDesc('venta_neta')
            ->get()->map(fn ($r) => [
                'usuarioId' => $r->usuario_id, 'usuario' => $r->usuario,
                'ventaNeta' => Pricing::money((float) $r->venta_neta), 'tickets' => (int) $r->tickets,
                'ticketPromedio' => $r->tickets > 0 ? Pricing::money((float) $r->venta_neta / $r->tickets) : 0.0,
            ])->all();
    }

    /**
     * Lo que entró por cada medio: solo lo cobrado EN EL ACTO (`venta_pagos`),
     * sea de una venta de contado o la seña de una cuenta corriente. Lo que
     * una cuenta corriente dejó SIN cobrar en el momento va aparte, como
     * "Cuenta corriente" — si no, esas ventas no aparecerían en ningún medio
     * y la suma de la tabla no cerraría contra la venta bruta del período.
     */
    private function porMedioPago(Carbon $desde, Carbon $hastaEx, ?int $suc): array
    {
        $reales = $this->base($desde, $hastaEx, $suc, 'v')
            ->where('v.tipo', 'not like', 'nota_credito%')
            ->join('venta_pagos as p', 'p.venta_id', '=', 'v.id')
            ->groupBy('p.medio')
            ->selectRaw('p.medio, coalesce(sum(p.importe), 0) as importe')
            ->get()->map(fn ($r) => ['medio' => $r->medio, 'importe' => (float) $r->importe])->all();

        $filasCtaCte = $this->base($desde, $hastaEx, $suc, 'v')
            ->where('v.tipo', 'not like', 'nota_credito%')
            ->where('v.condicion_pago', 'cuenta_corriente')
            ->leftJoin('venta_pagos as p', 'p.venta_id', '=', 'v.id')
            ->groupBy('v.id', 'v.total')
            ->selectRaw('v.total, coalesce(sum(p.importe), 0) as pagado')
            ->get();
        $ctaCte = $filasCtaCte->sum(fn ($r) => max(0, (float) $r->total - (float) $r->pagado));
        if ($ctaCte > self::EPS) {
            $reales[] = ['medio' => 'cuenta_corriente', 'importe' => $ctaCte];
        }

        $total = array_sum(array_column($reales, 'importe'));

        return collect($reales)->sortByDesc('importe')->values()->map(fn ($r) => [
            'medio' => $r['medio'], 'importe' => Pricing::money($r['importe']),
            'participacionPct' => $total > 0 ? Pricing::money(($r['importe'] / $total) * 100) : 0.0,
        ])->all();
    }

    private function topProductos(Carbon $desde, Carbon $hastaEx, ?int $suc, int $limite = 15): array
    {
        return $this->base($desde, $hastaEx, $suc, 'v')
            ->join('venta_items as vi', 'vi.venta_id', '=', 'v.id')
            ->join('productos as p', 'p.id', '=', 'vi.producto_id')
            ->groupBy('vi.producto_id', 'p.nombre')
            ->selectRaw("
                vi.producto_id, p.nombre,
                coalesce(sum(vi.cantidad * ".self::signo('v.tipo')."), 0) as unidades,
                coalesce(sum(vi.subtotal * ".self::signo('v.tipo')."), 0) as venta_neta
            ")
            ->orderByDesc('venta_neta')
            ->limit($limite)
            ->get()->map(fn ($r) => [
                'productoId' => $r->producto_id, 'nombre' => $r->nombre,
                'unidades' => Pricing::money((float) $r->unidades), 'ventaNeta' => Pricing::money((float) $r->venta_neta),
            ])->all();
    }
}
