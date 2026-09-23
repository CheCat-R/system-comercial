<?php

namespace App\Gerencia;

use App\Compras\Documentos;
use App\Ventas\VentasService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * GERENCIA › AUDITORÍA — quién hizo qué.
 * ============================================================================
 * Una línea de tiempo, no cuatro pantallas sueltas. Junta CUATRO fuentes que
 * ya existían, cada una dueña de su propio dato — acá no se reescribe nada,
 * se LEE y se ordena junto:
 *
 *   · cambio            — la tabla `auditoria` de siempre (percepciones,
 *                          roles, catálogos, respaldos…).
 *   · anulacion         — ventas y comprobantes anulados.
 *   · reversion_precio  — lotes de `PreciosService::revertirLote()`.
 *   · diferencia_caja   — controles de turno y cierres con diferencia ≠ 0.
 *
 * A PROPÓSITO no entran los ajustes de stock (mermas, defectuosos, vencidos):
 * ya tienen su propia película completa en Almacén › Existencias
 * (Movimientos) e Incidencias — traerlos acá sería repetir esa pantalla, no
 * sumar una nueva.
 */
class AuditoriaFeedService
{
    private const TIPOS = ['cambio', 'anulacion', 'reversion_precio', 'diferencia_caja'];

    private const POR_FUENTE = 300;

    public function feed(array $q = []): array
    {
        $hoy = Documentos::hoy();
        $desde = ! empty($q['desde']) ? Documentos::fecha($q['desde']) : $hoy->copy()->subDays(30);
        $hastaEx = ! empty($q['hasta']) ? Documentos::fecha($q['hasta'])->addDay() : $hoy->copy()->addDay();
        $tipo = in_array($q['tipo'] ?? null, self::TIPOS, true) ? $q['tipo'] : null;
        $limit = min(max((int) ($q['limit'] ?? 200), 1), 500);

        $eventos = [];
        if (! $tipo || $tipo === 'cambio') {
            array_push($eventos, ...$this->cambios($desde, $hastaEx));
        }
        if (! $tipo || $tipo === 'anulacion') {
            array_push($eventos, ...$this->anulaciones($desde, $hastaEx));
        }
        if (! $tipo || $tipo === 'reversion_precio') {
            array_push($eventos, ...$this->reversionesPrecios($desde, $hastaEx));
        }
        if (! $tipo || $tipo === 'diferencia_caja') {
            array_push($eventos, ...$this->diferenciasCaja($desde, $hastaEx));
        }

        usort($eventos, fn ($a, $b) => strcmp($b['fecha'], $a['fecha']));
        $total = count($eventos);

        return [
            'periodo' => ['desde' => $desde->toIso8601String(), 'hasta' => $hastaEx->copy()->subSecond()->toIso8601String()],
            'total' => $total,
            'recortado' => max(0, $total - $limit),
            'eventos' => array_slice($eventos, 0, $limit),
        ];
    }

    private function cambios(Carbon $desde, Carbon $hastaEx): array
    {
        return DB::table('auditoria as a')->leftJoin('usuarios as u', 'u.id', '=', 'a.usuario_id')
            ->where('a.fecha', '>=', $desde)->where('a.fecha', '<', $hastaEx)
            ->orderByDesc('a.id')->limit(self::POR_FUENTE)
            ->get(['a.fecha', 'a.ambito', 'a.detalle', 'a.campo', 'a.antes', 'a.despues', DB::raw("coalesce(u.nombre, '') as usuario")])
            ->map(fn ($r) => [
                'tipo' => 'cambio',
                'fecha' => Carbon::parse($r->fecha)->toIso8601String(),
                'usuario' => $r->usuario,
                'ambito' => $r->ambito,
                'resumen' => $r->ambito.($r->detalle ? ' · '.$r->detalle : '').' — '.$r->campo
                    .': '.($r->antes !== '' ? $r->antes.' → ' : '').($r->despues !== '' ? $r->despues : '(vacío)'),
                'monto' => null,
            ])->all();
    }

    private function anulaciones(Carbon $desde, Carbon $hastaEx): array
    {
        $out = [];
        $ventas = DB::table('ventas as v')
            ->leftJoin('usuarios as u', 'u.id', '=', 'v.anulado_por')
            ->leftJoin('clientes as c', 'c.id', '=', 'v.cliente_id')
            ->where('v.estado', 'anulada')
            ->where('v.anulado_en', '>=', $desde)->where('v.anulado_en', '<', $hastaEx)
            ->orderByDesc('v.anulado_en')->limit(self::POR_FUENTE)
            ->get(['v.tipo', 'v.punto_venta', 'v.numero', 'v.anulado_en', 'v.anulado_motivo', 'v.total', 'c.nombre as cliente', DB::raw("coalesce(u.nombre, '') as usuario")]);
        foreach ($ventas as $r) {
            $out[] = [
                'tipo' => 'anulacion',
                'fecha' => Carbon::parse($r->anulado_en)->toIso8601String(),
                'usuario' => $r->usuario,
                'ambito' => 'Ventas',
                'resumen' => 'Venta '.VentasService::etiquetaVenta($r).' anulada'.($r->cliente ? ' · '.$r->cliente : '').($r->anulado_motivo ? ' — '.$r->anulado_motivo : ''),
                'monto' => (float) $r->total,
            ];
        }

        $comps = DB::table('comprobantes as c')
            ->leftJoin('proveedores as p', 'p.id', '=', 'c.proveedor_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'c.anulado_por')
            ->where('c.estado', 'anulado')
            ->where('c.anulado_en', '>=', $desde)->where('c.anulado_en', '<', $hastaEx)
            ->orderByDesc('c.anulado_en')->limit(self::POR_FUENTE)
            ->get(['c.tipo', 'c.letra', 'c.punto_venta', 'c.numero', 'c.anulado_en', 'c.observaciones', 'c.total', 'p.nombre as proveedor', DB::raw("coalesce(u.nombre, '') as usuario")]);
        foreach ($comps as $r) {
            // El motivo quedó adentro de `observaciones` (se le agrega "Anulado: ..." al anular): se muestra la última línea.
            $lineas = array_filter(explode("\n", (string) $r->observaciones));
            $motivo = $lineas ? preg_replace('/^Anulado:\s*/', '', end($lineas)) : '';
            $out[] = [
                'tipo' => 'anulacion',
                'fecha' => $r->anulado_en ? Carbon::parse($r->anulado_en)->toIso8601String() : null,
                'usuario' => $r->usuario,
                'ambito' => 'Compras',
                'resumen' => 'Comprobante '.Documentos::etiqueta($r).' anulado'.($r->proveedor ? ' · '.$r->proveedor : '').($motivo ? ' — '.$motivo : ''),
                'monto' => (float) $r->total,
            ];
        }

        return array_values(array_filter($out, fn ($e) => $e['fecha'] !== null));
    }

    private function reversionesPrecios(Carbon $desde, Carbon $hastaEx): array
    {
        return DB::table('producto_proveedor_costos as c')
            ->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->where('c.origen', 'reversion')
            ->where('c.fecha', '>=', $desde)->where('c.fecha', '<', $hastaEx)
            ->groupBy('c.lote', 'c.usuario_id', 'u.nombre')
            ->selectRaw("c.lote, coalesce(u.nombre, '') as usuario, max(c.fecha) as fecha, count(*) as productos, max(c.motivo) as motivo")
            ->orderByDesc('fecha')->limit(self::POR_FUENTE)
            ->get()
            ->map(fn ($r) => [
                'tipo' => 'reversion_precio',
                'fecha' => Carbon::parse($r->fecha)->toIso8601String(),
                'usuario' => $r->usuario,
                'ambito' => 'Precios',
                'resumen' => 'Reversión de precios (lote '.$r->lote.'): '.$r->productos.' producto(s)'.($r->motivo ? ' — '.$r->motivo : ''),
                'monto' => null,
            ])->all();
    }

    private function diferenciasCaja(Carbon $desde, Carbon $hastaEx): array
    {
        $out = [];
        $controles = DB::table('caja_controles as k')
            ->join('caja_sesiones as s', 's.id', '=', 'k.caja_sesion_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'k.usuario_id')
            ->leftJoin('sucursales as suc', 'suc.id', '=', 's.sucursal_id')
            ->where('k.diferencia', '!=', 0)
            ->where('k.fecha', '>=', $desde)->where('k.fecha', '<', $hastaEx)
            ->orderByDesc('k.fecha')->limit(self::POR_FUENTE)
            ->get(['k.fecha', 'k.diferencia', 'k.observaciones', DB::raw("coalesce(u.nombre, '') as usuario"), DB::raw("coalesce(suc.nombre, '') as sucursal")]);
        foreach ($controles as $r) {
            $out[] = [
                'tipo' => 'diferencia_caja',
                'fecha' => Carbon::parse($r->fecha)->toIso8601String(),
                'usuario' => $r->usuario,
                'ambito' => 'Caja',
                'resumen' => 'Control de caja en '.$r->sucursal.($r->observaciones ? ' — '.$r->observaciones : ''),
                'monto' => (float) $r->diferencia,
            ];
        }

        $cierres = DB::table('caja_sesiones as s')
            ->leftJoin('usuarios as u', 'u.id', '=', 's.usuario_id')
            ->leftJoin('sucursales as suc', 'suc.id', '=', 's.sucursal_id')
            ->where('s.estado', 'cerrada')->where('s.diferencia', '!=', 0)
            ->where('s.cierre', '>=', $desde)->where('s.cierre', '<', $hastaEx)
            ->orderByDesc('s.cierre')->limit(self::POR_FUENTE)
            ->get(['s.cierre', 's.diferencia', 's.observaciones', DB::raw("coalesce(u.nombre, '') as usuario"), DB::raw("coalesce(suc.nombre, '') as sucursal")]);
        foreach ($cierres as $r) {
            $out[] = [
                'tipo' => 'diferencia_caja',
                'fecha' => Carbon::parse($r->cierre)->toIso8601String(),
                'usuario' => $r->usuario,
                'ambito' => 'Caja',
                'resumen' => 'Cierre de caja en '.$r->sucursal.($r->observaciones ? ' — '.$r->observaciones : ''),
                'monto' => (float) $r->diferencia,
            ];
        }

        return $out;
    }
}
