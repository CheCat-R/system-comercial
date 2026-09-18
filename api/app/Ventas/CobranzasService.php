<?php

namespace App\Ventas;

use App\Auth\Operador;
use App\Exceptions\ErrorDeNegocio;
use App\Precios\Pricing;
use App\Services\CajaService;
use App\Services\ClientesService;
use App\Services\ConfiguracionService;
use App\Support\Fila;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * COBRANZAS (recibos): N medios que entran + N imputaciones a ventas. Lo no
 * imputado queda `aCuenta` y baja igual el saldo global. Nunca se imputa a un
 * documento más de lo que debe: el saldo se recalcula DENTRO de la transacción
 * con la venta bloqueada. Anular no borra: cambia el estado.
 */
class CobranzasService
{
    private const EPS = 0.005;

    private const MAX_IMPORTE = 100_000_000;

    public function __construct(
        private readonly ClientesService $cli,
        private readonly ConfiguracionService $cfg,
        private readonly VentasService $ventas,
        private readonly CajaService $caja,
    ) {}

    public function listar(array $q): array
    {
        $qb = DB::table('cobranzas as c')->join('clientes as cl', 'cl.id', '=', 'c.cliente_id')->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->select('c.*', 'cl.nombre as cliente_nombre', 'u.nombre as usuario_nombre');
        if (! empty($q['clienteId'])) {
            $qb->where('c.cliente_id', (int) $q['clienteId']);
        }
        if (! empty($q['estado'])) {
            $qb->where('c.estado', $q['estado']);
        }
        if (! empty($q['sucursalId'])) {
            $qb->where('c.sucursal_id', (int) $q['sucursalId']);
        }
        $limit = min(max((int) ($q['limit'] ?? 100), 1), 500);
        $rows = $qb->orderByDesc('c.id')->limit($limit)->get();
        if ($rows->isEmpty()) {
            return [];
        }
        $pagos = DB::table('cobranza_pagos')->whereIn('cobranza_id', $rows->pluck('id'))->get()->groupBy('cobranza_id');

        return $rows->map(fn ($c) => [...Fila::camel($c), 'pagos' => Fila::camelTodos($pagos->get($c->id) ?? [])])->all();
    }

    public function get(int $id): array
    {
        $c = DB::table('cobranzas as c')->join('clientes as cl', 'cl.id', '=', 'c.cliente_id')->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->where('c.id', $id)->select('c.*', 'cl.nombre as cliente_nombre', 'u.nombre as usuario_nombre')->first();
        if (! $c) {
            throw new NotFoundHttpException('Cobranza inexistente.');
        }
        $pagos = DB::table('cobranza_pagos')->where('cobranza_id', $id)->get();
        $imput = DB::table('cobranza_imputaciones as ci')->join('ventas as v', 'v.id', '=', 'ci.venta_id')->where('ci.cobranza_id', $id)
            ->get(['ci.id', 'ci.venta_id', 'ci.importe', 'v.tipo', 'v.punto_venta', 'v.numero', 'v.fecha', 'v.total']);

        return [...Fila::camel($c), 'pagos' => Fila::camelTodos($pagos),
            'imputaciones' => $imput->map(fn ($i) => [...Fila::camel($i), 'etiqueta' => VentasService::etiquetaVenta($i)])->all()];
    }

    /** Saldo real de cada venta, leído dentro de la transacción con la fila bloqueada. */
    private function saldosEnTx(array $ventaIds): array
    {
        $docs = DB::table('ventas')->whereIn('id', $ventaIds)->lockForUpdate()->get()->keyBy('id');
        $cobrado = DB::table('cobranza_imputaciones as ci')->join('cobranzas as c', 'c.id', '=', 'ci.cobranza_id')->where('c.estado', 'confirmada')
            ->whereIn('ci.venta_id', $ventaIds)->groupBy('ci.venta_id')->selectRaw('ci.venta_id, coalesce(sum(ci.importe),0) as importe')->get()->pluck('importe', 'venta_id');
        $notas = DB::table('ventas')->whereIn('ref_venta_id', $ventaIds)->where('estado', '!=', 'anulada')->groupBy('ref_venta_id')
            ->selectRaw('ref_venta_id, coalesce(sum(total),0) as importe')->get()->pluck('importe', 'ref_venta_id');
        $out = [];
        foreach ($docs as $id => $d) {
            $out[$id] = ['doc' => $d, 'saldo' => Pricing::money((float) $d->total - (float) ($cobrado[$id] ?? 0) - (float) ($notas[$id] ?? 0))];
        }

        return $out;
    }

    /** `sucursalId` viene resuelto contra la sesión; el TURNO lo resuelve este método. */
    public function crear(array $dto, int $sucursalId, array $opciones): array
    {
        $cliente = $this->cli->get((int) $dto['clienteId']);
        $config = $this->cfg->get('ventas');
        $autor = Operador::resolver($dto['operadorId'] ?? null, (int) $opciones['usuarioId']);

        $pagos = array_values(array_filter($dto['pagos'] ?? [], fn ($p) => (float) ($p['importe'] ?? 0) > 0));
        if (! $pagos) {
            throw new ErrorDeNegocio('Cargá al menos un medio de pago con importe.');
        }
        foreach ($pagos as $p) {
            if (! in_array($p['medio'] ?? '', VentasService::MEDIOS_POS, true)) {
                throw new ErrorDeNegocio('Medio de pago inválido.');
            }
            if ((float) $p['importe'] > self::MAX_IMPORTE) {
                throw new ErrorDeNegocio('Un importe supera el tope permitido.');
            }
        }
        $total = Pricing::money(array_sum(array_map(fn ($p) => (float) $p['importe'], $pagos)));
        if ($total <= 0) {
            throw new ErrorDeNegocio('El total de la cobranza debe ser mayor a 0.');
        }
        $hayEfectivo = collect($pagos)->contains(fn ($p) => $p['medio'] === 'efectivo');
        $turno = $this->caja->actual($sucursalId);
        if ($hayEfectivo && ! empty($config['cajaObligatoria']) && ! $turno) {
            throw new ErrorDeNegocio('No hay un turno de caja abierto en esta sucursal, y el efectivo de un recibo tiene que entrar a una caja. Abrí la caja y volvé a cobrar.');
        }

        $imputaciones = array_values(array_filter(array_map(fn ($i) => ['ventaId' => (int) $i['ventaId'], 'importe' => Pricing::money((float) ($i['importe'] ?? 0))], $dto['imputaciones'] ?? []), fn ($i) => $i['importe'] > 0));
        if (! $imputaciones && ! empty($dto['auto'])) {
            $resto = $total;
            foreach ($this->ventas->cuenta($cliente->id)['comprobantes'] as $c) {
                if ($resto <= self::EPS) {
                    break;
                }
                $aplica = Pricing::money(min($resto, $c['saldo']));
                if ($aplica > 0) {
                    $imputaciones[] = ['ventaId' => $c['id'], 'importe' => $aplica];
                    $resto = Pricing::money($resto - $aplica);
                }
            }
        }
        $agrupado = [];
        foreach ($imputaciones as $i) {
            $agrupado[$i['ventaId']] = Pricing::money(($agrupado[$i['ventaId']] ?? 0) + $i['importe']);
        }
        $imputaciones = array_map(fn ($ventaId, $importe) => ['ventaId' => $ventaId, 'importe' => $importe], array_keys($agrupado), $agrupado);
        $imputado = Pricing::money(array_sum(array_column($imputaciones, 'importe')));
        if ($imputado > $total + self::EPS) {
            throw new ErrorDeNegocio('Estás imputando $'.number_format($imputado, 2, '.', '').' y la cobranza es de $'.number_format($total, 2, '.', '').'.');
        }
        $aCuenta = Pricing::money($total - $imputado);
        $puntoVenta = (string) ($config['puntoVenta'] ?: '00001');
        $fecha = VentasService::fechaDeDocumento($dto['fecha'] ?? null, ! empty($opciones['esJefe']));

        $id = DB::transaction(function () use ($turno, $hayEfectivo, $config, $imputaciones, $cliente, $puntoVenta, $fecha, $sucursalId, $autor, $total, $aCuenta, $dto, $pagos) {
            $turnoIdEnTx = null;
            if ($turno) {
                $t = DB::table('caja_sesiones')->where('id', $turno->id)->lockForUpdate()->first();
                if ($t && $t->estado === 'abierta') {
                    $turnoIdEnTx = (int) $t->id;
                } elseif ($hayEfectivo && ! empty($config['cajaObligatoria'])) {
                    throw new ErrorDeNegocio('El turno de caja se cerró mientras se cargaba este recibo. Abrí la caja y volvé a cobrar.');
                }
            }
            if ($imputaciones) {
                $saldos = $this->saldosEnTx(array_column($imputaciones, 'ventaId'));
                foreach ($imputaciones as $i) {
                    $entry = $saldos[$i['ventaId']] ?? null;
                    if (! $entry) {
                        throw new ErrorDeNegocio('Uno de los comprobantes no existe.');
                    }
                    $doc = $entry['doc'];
                    if ((int) $doc->cliente_id !== $cliente->id) {
                        throw new ErrorDeNegocio('Un comprobante no pertenece a este cliente.');
                    }
                    if ($doc->estado !== 'confirmada') {
                        throw new ErrorDeNegocio('Solo se imputa a comprobantes confirmados.');
                    }
                    if (VentasService::esNotaCredito($doc->tipo)) {
                        throw new ErrorDeNegocio('No se le imputa una cobranza a una nota de crédito: la nota ya descuenta de la cuenta del cliente.');
                    }
                    if ($i['importe'] > $entry['saldo'] + self::EPS) {
                        throw new ErrorDeNegocio('El comprobante '.$doc->punto_venta.'-'.str_pad((string) $doc->numero, 8, '0', STR_PAD_LEFT).' debe $'.number_format($entry['saldo'], 2, '.', '').' y estás imputando $'.number_format($i['importe'], 2, '.', '').'.');
                    }
                }
            }
            $numero = (int) DB::table('cobranzas')->where('punto_venta', $puntoVenta)->lockForUpdate()->max('numero') + 1;
            $id = DB::table('cobranzas')->insertGetId([
                'punto_venta' => $puntoVenta, 'numero' => $numero, 'fecha' => $fecha, 'cliente_id' => $cliente->id, 'sucursal_id' => $sucursalId, 'usuario_id' => $autor,
                'caja_sesion_id' => $turnoIdEnTx, 'total' => $total, 'a_cuenta' => $aCuenta, 'estado' => 'confirmada', 'observaciones' => $dto['observaciones'] ?? '',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('cobranza_pagos')->insert(array_map(fn ($p) => ['cobranza_id' => $id, 'medio' => $p['medio'], 'importe' => Pricing::money((float) $p['importe']), 'referencia' => $p['referencia'] ?? ''], $pagos));
            if ($imputaciones) {
                DB::table('cobranza_imputaciones')->insert(array_map(fn ($i) => ['cobranza_id' => $id, 'venta_id' => $i['ventaId'], 'importe' => $i['importe']], $imputaciones));
            }

            return $id;
        });

        return $this->get($id);
    }

    /** Anular un recibo es la misma maniobra que anular una venta: permiso, motivo, rastro, y no contra un turno cerrado. */
    public function anular(int $id, string $motivo, array $opciones): array
    {
        $c = $this->get($id);
        if ($c['estado'] === 'anulada') {
            throw new ErrorDeNegocio('La cobranza ya está anulada.');
        }
        if (! empty($opciones['soloSuSucursal']) && (int) $c['sucursalId'] !== (int) $opciones['soloSuSucursal']) {
            throw new AccessDeniedHttpException('Ese recibo es de otra sucursal.');
        }
        $razon = trim($motivo);
        if ($razon === '') {
            throw new ErrorDeNegocio('Indicá por qué se anula el recibo.');
        }
        DB::transaction(function () use ($id, $razon, $opciones) {
            $fresca = DB::table('cobranzas')->where('id', $id)->lockForUpdate()->first();
            if (! $fresca || $fresca->estado === 'anulada') {
                throw new ErrorDeNegocio('La cobranza ya está anulada.');
            }
            if ($fresca->caja_sesion_id) {
                $turno = DB::table('caja_sesiones')->where('id', $fresca->caja_sesion_id)->lockForUpdate()->first();
                if ($turno && $turno->estado === 'cerrada' && empty($opciones['esJefe'])) {
                    throw new ErrorDeNegocio('El turno de caja de ese recibo ya está cerrado: su arqueo quedó firmado. Corregilo con un recibo nuevo en vez de anularlo.');
                }
            }
            DB::table('cobranzas')->where('id', $id)->update(['estado' => 'anulada', 'anulado_por' => $opciones['usuarioId'], 'anulado_en' => now(), 'anulado_motivo' => $razon, 'updated_at' => now()]);
        });

        return $this->get($id);
    }
}
