<?php

namespace App\Http\Controllers\Api;

use App\Arca\ArcaService;
use App\Arca\Certificado;
use App\Arca\Config;
use App\Http\Controllers\Controller;
use App\Precios\Pricing;
use App\Services\ConfiguracionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * EL PANEL DE DIAGNÓSTICO. `estado` no sale a la red (la pantalla lo pide al
 * abrir); `probar` hace el viaje completo a ARCA y lo dispara el usuario.
 */
class ArcaController extends Controller
{
    private const TRABADAS_EN_PANEL = 20;

    public function __construct(private readonly ArcaService $svc, private readonly ConfiguracionService $cfg) {}

    public function estado(): JsonResponse
    {
        $base = $this->svc->estado();
        $empresa = $this->cfg->get('empresa');
        $locales = DB::table('sucursales')->orderBy('id')->get(['id', 'nombre', 'tipo', 'punto_venta', 'direccion'])
            ->map(fn ($s) => ['id' => $s->id, 'nombre' => $s->nombre, 'tipo' => $s->tipo, 'puntoVenta' => $s->punto_venta, 'direccion' => $s->direccion]);

        return response()->json([
            ...$base,
            'avisos' => Config::diferenciasConEmpresa($empresa),
            'empresaNombre' => $empresa['razonSocial'] ?: ($empresa['nombre'] ?? ''),
            'clave' => Certificado::hayClave(),
            'certificado' => Certificado::instalado(),
            'sucursales' => $locales->all(),
            'sinPuntoVenta' => $locales->filter(fn ($s) => ! $s['puntoVenta'])->count(),
            'trabadas' => $this->trabadas(),
        ]);
    }

    public function probar(): JsonResponse
    {
        return response()->json($this->svc->diagnostico());
    }

    public function pedido(Request $request): JsonResponse
    {
        $d = $request->validate(['razonSocial' => ['required', 'string', 'max:120'], 'alias' => ['required', 'string', 'max:60']]);

        return response()->json(Certificado::generarPedido($d['razonSocial'], $d['alias']));
    }

    public function instalar(Request $request): JsonResponse
    {
        $d = $request->validate(['certificado' => ['required', 'string', 'max:20000']]);

        return response()->json(Certificado::instalar($d['certificado']));
    }

    /** Las ventas que salieron como ticket provisorio porque ARCA no contestó, de la más vieja primero. */
    private function trabadas(): array
    {
        $q = fn () => DB::table('ventas as v')->where('v.facturar_pendiente', true)->where('v.estado', '!=', 'anulada');
        $agg = $q()->selectRaw('count(*) as cantidad, coalesce(sum(v.total),0) as plata, min(v.fecha) as desde')->first();
        $filas = $q()->join('clientes as c', 'c.id', '=', 'v.cliente_id')->leftJoin('sucursales as s', 's.id', '=', 'v.sucursal_id')
            ->orderBy('v.fecha')->orderBy('v.id')->limit(self::TRABADAS_EN_PANEL)
            ->get(['v.id', 'v.tipo', 'v.punto_venta', 'v.numero', 'v.fecha', 'v.total', 'v.facturar_motivo as motivo', 'c.nombre as cliente_nombre', 's.nombre as sucursal_nombre']);
        $cantidad = (int) ($agg->cantidad ?? 0);

        return [
            'cantidad' => $cantidad, 'plata' => Pricing::money((float) ($agg->plata ?? 0)), 'desde' => \App\Support\Fila::iso($agg->desde ?? null),
            'filas' => \App\Support\Fila::camelTodos($filas), 'ocultas' => max(0, $cantidad - $filas->count()),
        ];
    }
}
