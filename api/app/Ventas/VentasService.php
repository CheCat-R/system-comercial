<?php

namespace App\Ventas;

use App\Arca\ArcaService;
use App\Arca\Comprobante;
use App\Arca\Qr;
use App\Auth\Operador;
use App\Exceptions\ErrorDeNegocio;
use App\Inventario\OperacionesService;
use App\Precios\Pricing;
use App\Services\CajaService;
use App\Services\ClientesService;
use App\Services\ConfiguracionService;
use App\Services\ListasService;
use App\Services\OfertasService;
use App\Support\Fila;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * VENTAS. Comprobante con numeración asignada por el sistema (o por ARCA) y
 * estado que no vuelve atrás. El POS trabaja con BORRADORES: no consumen
 * numeración, no descuentan stock, no exigen caja; se editan, delegan y
 * descartan. Confirmar es el único momento en que la venta toca inventario y
 * caja. Precios NETOS; el IVA se suma aparte.
 *
 * `opciones` es lo que el CONTROLLER resolvió de la sesión:
 *   sucursalSesion   dónde se GRABA (la pedida si es jefe, la propia si no)
 *   soloSuSucursal   qué se puede TOCAR (null = sin límite)
 *   puedePisarPrecio permiso `precio_manual`
 *   esJefe           fechar la venta, anular contra turno cerrado
 *   usuarioId        el de la sesión
 */
class VentasService
{
    private const TIPOS_CREABLES = ['ticket', 'factura_a', 'factura_b', 'factura_c'];

    public const MEDIOS_POS = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'cheque', 'qr', 'otro'];

    public function __construct(
        private readonly OperacionesService $inv,
        private readonly ConfiguracionService $cfg,
        private readonly ClientesService $cli,
        private readonly CajaService $caja,
        private readonly ListasService $listas,
        private readonly OfertasService $ofertas,
        private readonly ArcaService $arca,
        private readonly Portero $portero,
    ) {}

    /* ------------------------------ Helpers ------------------------------ */

    public static function esNotaCredito(?string $tipo): bool
    {
        return Comprobante::esNotaCredito($tipo);
    }

    public static function etiquetaVenta(object|array $v): string
    {
        $v = (object) $v;
        $nombre = $v->tipo === 'ticket' ? 'Ticket' : trim((self::esNotaCredito($v->tipo) ? 'Nota de crédito ' : 'Factura ').(Comprobante::letraDe($v->tipo) ?? ''));

        return $nombre.' '.$v->punto_venta.'-'.str_pad((string) ($v->numero ?? 0), 8, '0', STR_PAD_LEFT);
    }

    /** Letra cuando se decide FACTURAR: depende de NUESTRA condición y la del cliente. */
    public static function letraFacturaPara(object $cliente, array $config): string
    {
        $empresa = $config['condicionIvaEmpresa'] ?? 'responsable_inscripto';
        if (in_array($empresa, ['monotributo', 'exento'], true)) {
            return 'factura_c';
        }

        return $cliente->condicion_iva === 'responsable_inscripto' ? 'factura_a' : 'factura_b';
    }

    public static function tipoVentaPara(object $cliente, array $config): string
    {
        return empty($config['arcaHabilitado']) ? 'ticket' : self::letraFacturaPara($cliente, $config);
    }

    /** La fecha de un documento de mostrador es AHORA, salvo para un jefe. */
    public static function fechaDeDocumento(?string $pedida, bool $esJefe): Carbon
    {
        if (! $pedida || ! $esJefe) {
            return Carbon::now();
        }
        try {
            return Carbon::parse($pedida);
        } catch (\Throwable) {
            throw new ErrorDeNegocio('Fecha inválida: '.$pedida);
        }
    }

    private static function desdeDia(?string $s): ?Carbon
    {
        return $s ? Carbon::parse($s, 'America/Argentina/Buenos_Aires')->startOfDay()->utc() : null;
    }

    private static function hastaDia(?string $s): ?Carbon
    {
        return $s ? Carbon::parse($s, 'America/Argentina/Buenos_Aires')->endOfDay()->utc() : null;
    }

    /* ------------------------------ Lectura ------------------------------ */

    /** Importe ya cobrado de cada venta (solo cobranzas confirmadas), en UNA consulta. */
    private function imputadoPorVenta(array $ventaIds): array
    {
        if (! $ventaIds) {
            return [];
        }

        return DB::table('cobranza_imputaciones as ci')->join('cobranzas as c', 'c.id', '=', 'ci.cobranza_id')
            ->where('c.estado', 'confirmada')->whereIn('ci.venta_id', $ventaIds)
            ->groupBy('ci.venta_id')->select('ci.venta_id', DB::raw('coalesce(sum(ci.importe),0) as importe'))
            ->get()->pluck('importe', 'venta_id')->map(fn ($x) => (float) $x)->all();
    }

    /** El primitivo que usan el POS (borradores abiertos) y la ficha del cliente. */
    public function list(array $q): array
    {
        $qb = DB::table('ventas');
        if (! empty($q['clienteId'])) {
            $qb->where('cliente_id', (int) $q['clienteId']);
        }
        if (! empty($q['sucursalId'])) {
            $qb->where('sucursal_id', (int) $q['sucursalId']);
        }
        if (! empty($q['estado'])) {
            $qb->where('estado', $q['estado']);
        }
        if ($d = self::desdeDia($q['desde'] ?? null)) {
            $qb->where('fecha', '>=', $d);
        }
        if ($h = self::hastaDia($q['hasta'] ?? null)) {
            $qb->where('fecha', '<=', $h);
        }
        $limit = min(max((int) ($q['limit'] ?? 100), 1), 500);
        $rows = $qb->orderByDesc('id')->limit($limit)->get();
        if ($rows->isEmpty()) {
            return [];
        }
        $ids = $rows->pluck('id')->all();
        $imput = $this->imputadoPorVenta($ids);
        $items = ! empty($q['incluirItems']) ? DB::table('venta_items')->whereIn('venta_id', $ids)->get()->groupBy('venta_id') : null;
        $usuarios = DB::table('usuarios')->whereIn('id', $rows->pluck('usuario_id')->filter()->unique())->pluck('nombre', 'id');
        $clientes = DB::table('clientes')->whereIn('id', $rows->pluck('cliente_id')->unique())->pluck('nombre', 'id');

        return $rows->map(function ($v) use ($imput, $items, $usuarios, $clientes) {
            $cobrado = $imput[$v->id] ?? 0;
            $base = [...Fila::camel($v), 'cobrado' => $cobrado, 'saldo' => $v->condicion_pago === 'cuenta_corriente' ? Pricing::money((float) $v->total - $cobrado) : 0,
                'clienteNombre' => $clientes[$v->cliente_id] ?? '—', 'cajeroNombre' => $usuarios[$v->usuario_id] ?? '—'];

            return $items !== null ? [...$base, 'items' => Fila::camelTodos($items->get($v->id) ?? [])] : $base;
        })->all();
    }

    private function condicionesListado($qb, array $q): void
    {
        if (! empty($q['sucursalId'])) {
            $qb->where('v.sucursal_id', (int) $q['sucursalId']);
        }
        if (! empty($q['usuarioId'])) {
            $qb->where('v.usuario_id', (int) $q['usuarioId']);
        }
        if (! empty($q['clienteId'])) {
            $qb->where('v.cliente_id', (int) $q['clienteId']);
        }
        if (! empty($q['cajaSesionId'])) {
            $qb->where('v.caja_sesion_id', (int) $q['cajaSesionId']);
        }
        if (! empty($q['estado'])) {
            $qb->where('v.estado', $q['estado']);
        } else {
            $qb->where('v.estado', '!=', 'borrador');
        }
        if ($d = self::desdeDia($q['desde'] ?? null)) {
            $qb->where('v.fecha', '>=', $d);
        }
        if ($h = self::hastaDia($q['hasta'] ?? null)) {
            $qb->where('v.fecha', '<=', $h);
        }
        if (($q['origen'] ?? '') === 'pos') {
            $qb->whereNull('v.presupuesto_id');
        }
        if (($q['origen'] ?? '') === 'presupuesto') {
            $qb->whereNotNull('v.presupuesto_id');
        }
        if (! empty($q['medioPago'])) {
            $qb->whereExists(fn ($s) => $s->from('venta_pagos as vp')->whereColumn('vp.venta_id', 'v.id')->where('vp.medio', $q['medioPago']));
        }
        if (! empty($q['conOferta'])) {
            $qb->whereExists(fn ($s) => $s->from('venta_items as vi')->whereColumn('vi.venta_id', 'v.id')->whereNotNull('vi.oferta_id'));
        }
        if (! empty($q['sinFacturar'])) {
            $qb->where('v.facturar_pendiente', true)->where('v.estado', '!=', 'anulada');
        }
        if (! empty($q['q'])) {
            $t = trim($q['q']);
            $digitos = preg_replace('/\D/', '', $t);
            $qb->where(function ($w) use ($t, $digitos) {
                $w->where('c.nombre', 'like', '%'.$t.'%');
                if ($digitos !== '') {
                    $w->orWhere('v.numero', (int) $digitos);
                }
            });
        }
    }

    /** EL LISTADO: paginado de verdad, resuelto, con totales del filtro entero (sin anuladas). */
    public function listado(array $q): array
    {
        $base = fn () => DB::table('ventas as v')->join('clientes as c', 'c.id', '=', 'v.cliente_id');
        $limit = min(max((int) ($q['limit'] ?? 25), 1), 200);
        $offset = max((int) ($q['offset'] ?? 0), 0);

        $qb = $base()->leftJoin('sucursales as s', 's.id', '=', 'v.sucursal_id')->leftJoin('usuarios as u', 'u.id', '=', 'v.usuario_id');
        $this->condicionesListado($qb, $q);
        $filas = $qb->orderByDesc('v.fecha')->orderByDesc('v.id')->limit($limit)->offset($offset)
            ->get(['v.*', 'c.nombre as cliente_nombre', 's.nombre as sucursal_nombre', 'u.nombre as cajero_nombre']);

        $signo = "(case when v.tipo like 'nota_credito%' then -1 else 1 end)";
        $tq = $base();
        $this->condicionesListado($tq, $q);
        $tot = $tq->selectRaw("count(*) as registros,
            sum(case when v.estado='anulada' then 1 else 0 end) as anuladas,
            sum(case when v.estado<>'anulada' and v.tipo not like 'nota_credito%' then 1 else 0 end) as tickets,
            sum(case when v.estado<>'anulada' and v.tipo like 'nota_credito%' then 1 else 0 end) as notas_credito,
            coalesce(sum(case when v.estado<>'anulada' and v.tipo like 'nota_credito%' then v.total else 0 end),0) as plata_acreditada,
            coalesce(sum(case when v.estado<>'anulada' then v.total*$signo else 0 end),0) as plata,
            coalesce(sum(case when v.estado<>'anulada' then v.subtotal_neto*$signo else 0 end),0) as neto,
            coalesce(sum(case when v.estado<>'anulada' then v.iva_total*$signo else 0 end),0) as iva,
            coalesce(sum(case when v.estado<>'anulada' then v.descuento_total*$signo else 0 end),0) as descuentos,
            coalesce(sum(case when v.estado='anulada' then v.total else 0 end),0) as plata_anulada,
            sum(case when v.facturar_pendiente=1 and v.estado<>'anulada' then 1 else 0 end) as sin_facturar")->first();

        $vq = $base()->join('venta_pagos as vp', 'vp.venta_id', '=', 'v.id');
        $this->condicionesListado($vq, $q);
        $porMedio = $vq->where('v.estado', '!=', 'anulada')->groupBy('vp.medio')->selectRaw('vp.medio, coalesce(sum(vp.importe),0) as importe')->get();

        $oq = $base()->join('venta_items as vi', 'vi.venta_id', '=', 'v.id');
        $this->condicionesListado($oq, $q);
        $ofe = $oq->where('v.estado', '!=', 'anulada')->selectRaw('coalesce(sum(vi.oferta_descuento),0) as plata, count(distinct case when vi.oferta_id is not null then vi.venta_id end) as ventas')->first();

        $ids = $filas->pluck('id')->all();
        $pagos = $ids ? DB::table('venta_pagos')->whereIn('venta_id', $ids)->get()->groupBy('venta_id') : collect();
        $agg = $ids ? DB::table('venta_items')->whereIn('venta_id', $ids)->groupBy('venta_id')
            ->selectRaw("venta_id, count(*) as renglones, coalesce(sum(cantidad),0) as unidades, coalesce(sum(oferta_descuento),0) as oferta_descuento, group_concat(distinct nullif(oferta,'') separator '|') as ofertas, group_concat(distinct nullif(lista,'') separator '|') as listas")
            ->get()->keyBy('venta_id') : collect();
        $imput = $this->imputadoPorVenta($ids);
        $notas = $ids ? DB::table('ventas')->whereIn('ref_venta_id', $ids)->where('estado', '!=', 'anulada')->groupBy('ref_venta_id')->selectRaw('ref_venta_id, coalesce(sum(total),0) as total')->get()->pluck('total', 'ref_venta_id') : collect();

        $registros = (int) ($tot->registros ?? 0);
        $tickets = (int) ($tot->tickets ?? 0);
        $plata = Pricing::money((float) ($tot->plata ?? 0));

        return [
            'filas' => $filas->map(function ($v) use ($pagos, $agg, $imput, $notas) {
                $a = $agg->get($v->id);
                $cobrado = $imput[$v->id] ?? 0;
                $acreditado = (float) ($notas[$v->id] ?? 0);

                return [...Fila::camel($v),
                    'clienteNombre' => $v->cliente_nombre, 'sucursalNombre' => $v->sucursal_nombre ?? '—', 'cajeroNombre' => $v->cajero_nombre ?? '—',
                    'cobrado' => $cobrado, 'acreditado' => Pricing::money($acreditado),
                    // Al contado no hay saldo: los pagos cubren el total. El saldo es de la cuenta corriente.
                    'saldo' => (self::esNotaCredito($v->tipo) || $v->condicion_pago !== 'cuenta_corriente') ? 0 : Pricing::money((float) $v->total - $cobrado - $acreditado),
                    'medios' => ($pagos->get($v->id) ?? collect())->map(fn ($p) => ['medio' => $p->medio, 'importe' => (float) $p->importe])->values()->all(),
                    'renglones' => (int) ($a->renglones ?? 0), 'unidades' => Pricing::money((float) ($a->unidades ?? 0)), 'ofertaDescuento' => Pricing::money((float) ($a->oferta_descuento ?? 0)),
                    'ofertas' => array_values(array_filter(explode('|', (string) ($a->ofertas ?? '')))), 'listas' => array_values(array_filter(explode('|', (string) ($a->listas ?? '')))),
                    'origen' => $v->presupuesto_id ? 'presupuesto' : 'pos'];
            })->all(),
            'total' => $registros,
            'paginado' => ['offset' => $offset, 'limit' => $limit],
            'totales' => [
                'registros' => $registros, 'tickets' => $tickets, 'anuladas' => (int) ($tot->anuladas ?? 0), 'plata' => $plata,
                'neto' => Pricing::money((float) ($tot->neto ?? 0)), 'iva' => Pricing::money((float) ($tot->iva ?? 0)), 'descuentos' => Pricing::money((float) ($tot->descuentos ?? 0)),
                'plataAnulada' => Pricing::money((float) ($tot->plata_anulada ?? 0)), 'notasCredito' => (int) ($tot->notas_credito ?? 0), 'plataAcreditada' => Pricing::money((float) ($tot->plata_acreditada ?? 0)),
                'promedio' => $tickets ? Pricing::money($plata / $tickets) : 0, 'sinFacturar' => (int) ($tot->sin_facturar ?? 0),
                'ofertas' => ['plata' => Pricing::money((float) ($ofe->plata ?? 0)), 'ventas' => (int) ($ofe->ventas ?? 0)],
                'porMedio' => $porMedio->map(fn ($m) => ['medio' => $m->medio, 'importe' => Pricing::money((float) $m->importe)])->all(),
            ],
        ];
    }

    private function fila(int $id): object
    {
        $v = DB::table('ventas')->find($id);
        if (! $v) {
            throw new NotFoundHttpException('Venta inexistente.');
        }

        return $v;
    }

    /** La venta completa: renglones con nombre, cliente fiscal, pagos, notas, saldo, QR. */
    public function get(int $id): array
    {
        $v = $this->fila($id);
        $items = DB::table('venta_items')->where('venta_id', $id)->orderBy('id')->get();
        $extras = DB::table('venta_extras')->where('venta_id', $id)->orderBy('id')->get();
        $pagos = DB::table('venta_pagos')->where('venta_id', $id)->get();
        $cobrado = $this->imputadoPorVenta([$id])[$id] ?? 0;
        $nc = $this->acreditado($id);

        $origen = $v->ref_venta_id ? DB::table('ventas')->where('id', $v->ref_venta_id)->first(['id', 'tipo', 'punto_venta', 'numero', 'fecha', 'total']) : null;
        $prods = DB::table('productos')->whereIn('id', $items->pluck('producto_id')->unique())->get(['id', 'nombre', 'tipo'])->keyBy('id');
        $tamDe = DB::table('presentaciones')->whereIn('id', $items->pluck('presentacion_id')->filter()->unique())->pluck('tam_kg', 'id');
        $cli = DB::table('clientes')->where('id', $v->cliente_id)->first(['nombre', 'tipo_doc', 'numero_doc', 'condicion_iva', 'direccion', 'localidad']);
        $suc = $v->sucursal_id ? DB::table('sucursales')->where('id', $v->sucursal_id)->first(['nombre', 'direccion', 'punto_venta']) : null;
        $usr = $v->usuario_id ? DB::table('usuarios')->where('id', $v->usuario_id)->value('nombre') : null;
        $cobrador = ($v->cobrado_por && $v->cobrado_por !== $v->usuario_id) ? DB::table('usuarios')->where('id', $v->cobrado_por)->value('nombre') : null;
        $tam = fn (float $kg) => $kg < 1 ? round($kg * 1000).' g' : $kg.' kg';

        $itemsSalida = $items->map(function ($it) use ($prods, $tamDe, $nc, $tam) {
            $p = $prods->get($it->producto_id);
            $kg = $it->presentacion_id ? (float) ($tamDe[$it->presentacion_id] ?? 0) : null;
            $base = $p?->nombre ?? '#'.$it->producto_id;
            $devuelto = $nc['porClave'][$it->producto_id.':'.($it->presentacion_id ?? '')] ?? 0;

            return [...Fila::camel($it), 'nombre' => $kg !== null ? $base.' · '.$tam($kg) : $base,
                'unidad' => $kg !== null ? 'paq.' : (($p?->tipo ?? '') === 'granel' ? 'kg' : 'u.'),
                'devuelto' => Pricing::money($devuelto), 'devolvible' => Pricing::money((float) $it->cantidad - $devuelto)];
        })->all();

        $quedaAlgo = collect($itemsSalida)->contains(fn ($it) => $it['devolvible'] > 0.0001) || ($extras->isNotEmpty() && ! $nc['extras']);
        $saldoCrudo = Pricing::money((float) $v->total - $cobrado - $nc['total']);
        $saldoReal = (! $quedaAlgo && $saldoCrudo > 0 && $saldoCrudo <= 0.01 * count($nc['notas']) + 1e-9) ? 0 : $saldoCrudo;

        return [...Fila::camel($v),
            'clienteNombre' => $cli?->nombre ?? '—', 'cliente' => $cli ? Fila::camel($cli) : null,
            'qrArca' => Qr::url(['tipo' => $v->tipo, 'puntoVenta' => $v->punto_venta, 'numero' => $v->numero, 'fecha' => $v->fecha, 'total' => (float) $v->total, 'cae' => $v->cae,
                'receptor' => $cli ? ['tipoDoc' => $cli->tipo_doc, 'numeroDoc' => $cli->numero_doc] : null]),
            'codigoComprobante' => Comprobante::CBTE_TIPO[$v->tipo] ?? null,
            'etiqueta' => self::etiquetaVenta($v),
            'sucursalNombre' => $suc?->nombre ?? '—', 'sucursalDireccion' => $suc?->direccion ?? '',
            'cajeroNombre' => $usr ?? '—', 'cobradoPorNombre' => $cobrador ?? '',
            'items' => $itemsSalida, 'extras' => Fila::camelTodos($extras), 'pagos' => Fila::camelTodos($pagos),
            'cobrado' => $cobrado, 'saldo' => (self::esNotaCredito($v->tipo) || $v->condicion_pago !== 'cuenta_corriente') ? 0 : $saldoReal,
            'notas' => $nc['notas'], 'acreditado' => Pricing::money($nc['total']),
            'acreditable' => $quedaAlgo ? Pricing::money((float) $v->total - $nc['total']) : 0, 'extrasAcreditados' => $nc['extras'],
            'origen' => $origen ? Fila::camel($origen) : null];
    }

    /** Lo que las notas de crédito de una venta ya devolvieron (plata y unidades por renglón). Las anuladas no cuentan. */
    private function acreditado(int $ventaId): array
    {
        $notas = DB::table('ventas')->where('ref_venta_id', $ventaId)->where('estado', '!=', 'anulada')->orderBy('id')
            ->get(['id', 'tipo', 'punto_venta', 'numero', 'fecha', 'total', 'cae', 'facturar_pendiente', 'observaciones']);
        $porClave = [];
        $total = 0.0;
        $extras = false;
        foreach ($notas as $n) {
            $total += (float) $n->total;
        }
        if ($notas->isNotEmpty()) {
            $ids = $notas->pluck('id')->all();
            foreach (DB::table('venta_items')->whereIn('venta_id', $ids)->get() as $it) {
                $k = $it->producto_id.':'.($it->presentacion_id ?? '');
                $porClave[$k] = ($porClave[$k] ?? 0) + (float) $it->cantidad;
            }
            $extras = DB::table('venta_extras')->whereIn('venta_id', $ids)->exists();
        }

        return ['notas' => Fila::camelTodos($notas), 'porClave' => $porClave, 'total' => Pricing::money($total), 'extras' => $extras];
    }

    /** Cuenta corriente del cliente: saldo global + comprobantes que todavía deben algo. */
    public function cuenta(int $clienteId): array
    {
        $cliente = $this->cli->get($clienteId);
        $todos = DB::table('ventas')->where('cliente_id', $clienteId)->where('estado', 'confirmada')->where('condicion_pago', 'cuenta_corriente')->orderBy('fecha')->orderBy('id')->get();
        $notas = $todos->filter(fn ($v) => self::esNotaCredito($v->tipo));
        $pendientes = $todos->filter(fn ($v) => ! self::esNotaCredito($v->tipo));
        $acreditado = [];
        $cuantasNotas = [];
        $acreditadoTotal = 0.0;
        foreach ($notas as $n) {
            $acreditadoTotal += (float) $n->total;
            if ($n->ref_venta_id) {
                $acreditado[$n->ref_venta_id] = ($acreditado[$n->ref_venta_id] ?? 0) + (float) $n->total;
                $cuantasNotas[$n->ref_venta_id] = ($cuantasNotas[$n->ref_venta_id] ?? 0) + 1;
            }
        }
        $imput = $this->imputadoPorVenta($pendientes->pluck('id')->all());
        $perdonado = 0.0;
        $comprobantes = $pendientes->map(function ($v) use ($imput, $acreditado, $cuantasNotas, &$perdonado) {
            $cobrado = $imput[$v->id] ?? 0;
            $nc = $acreditado[$v->id] ?? 0;
            $crudo = Pricing::money((float) $v->total - $cobrado - $nc);
            $tolerancia = 0.01 * ($cuantasNotas[$v->id] ?? 0);
            // El centavo del redondeo del IVA no es una deuda.
            $saldo = ($crudo > 0 && $crudo <= $tolerancia + 1e-9) ? 0 : $crudo;
            if ($saldo == 0 && $crudo > 0) {
                $perdonado = Pricing::money($perdonado + $crudo);
            }

            return [...Fila::camel($v), 'etiqueta' => self::etiquetaVenta($v), 'cobrado' => $cobrado, 'acreditado' => Pricing::money($nc), 'saldo' => $saldo];
        })->filter(fn ($c) => $c['saldo'] > 0.009)->values()->all();

        $facturado = (float) $pendientes->sum('total');
        $cobradoTotal = (float) DB::table('cobranzas')->where('cliente_id', $clienteId)->where('estado', 'confirmada')->sum('total');
        $saldo = Pricing::money($facturado - $acreditadoTotal - $cobradoTotal - $perdonado);

        return [
            'clienteId' => $clienteId, 'saldo' => $saldo, 'facturado' => Pricing::money($facturado), 'acreditado' => Pricing::money($acreditadoTotal),
            'cobrado' => Pricing::money($cobradoTotal), 'limiteCredito' => (float) $cliente->limite_credito,
            'disponible' => $cliente->limite_credito > 0 ? Pricing::money($cliente->limite_credito - $saldo) : null,
            'comprobantes' => $comprobantes,
        ];
    }

    /* ------------------------------ Validaciones ------------------------------ */

    /** Al contado los pagos cubren el total exacto; en cta. cte. no hay pagos. */
    private function validarPagos(string $condicionPago, array $pagos, float $total): array
    {
        $validos = array_values(array_filter($pagos, fn ($p) => (float) ($p['importe'] ?? 0) > 0));
        foreach ($validos as $p) {
            if (! in_array($p['medio'] ?? '', self::MEDIOS_POS, true)) {
                throw new ErrorDeNegocio('Medio de pago inválido: '.($p['medio'] ?? ''));
            }
        }
        if ($condicionPago === 'contado') {
            if (! $validos) {
                throw new ErrorDeNegocio('Indicá con qué se paga la venta.');
            }
            $pagado = Pricing::money(array_sum(array_map(fn ($p) => (float) $p['importe'], $validos)));
            if (abs($pagado - $total) > 0.01) {
                throw new ErrorDeNegocio('Los pagos suman $'.number_format($pagado, 2, '.', '').' y el total es $'.number_format($total, 2, '.', '').'.');
            }
        } elseif ($validos) {
            throw new ErrorDeNegocio('Una venta en cuenta corriente no lleva pagos: se cobra con un recibo.');
        }

        return $validos;
    }

    /** Medios que EXIGEN factura: si un peso entra por uno tildado, no puede salir como ticket. */
    private function validarMediosFacturar(string $tipo, array $pagos, array $config): void
    {
        if ($tipo !== 'ticket') {
            return;
        }
        $exigen = $config['mediosFacturar'] ?? [];
        if (! $exigen) {
            return;
        }
        foreach ($pagos as $p) {
            if ((float) $p['importe'] > 0 && in_array($p['medio'], $exigen, true)) {
                throw new ErrorDeNegocio('El medio "'.str_replace('_', ' ', $p['medio']).'" exige factura: esta venta no puede salir como ticket. Facturala o cobrala con otro medio.');
            }
        }
    }

    private function validarMediosPagoMonto(array $items, string $condicionPago, array $pagos, array $config): void
    {
        $permitidos = $config['mediosPagoMonto'] ?? [];
        if (! $permitidos || ! collect($items)->contains(fn ($it) => ($it['lista_origen'] ?? $it['listaOrigen'] ?? '') === 'monto')) {
            return;
        }
        $legibles = implode(' / ', $permitidos);
        if ($condicionPago !== 'contado') {
            throw new ErrorDeNegocio('El precio por monto de compra solo vale pagando al contado ('.$legibles.'). Quitá el beneficio o cambiá la condición de pago.');
        }
        foreach ($pagos as $p) {
            if ((float) $p['importe'] > 0 && ! in_array($p['medio'], $permitidos, true)) {
                throw new ErrorDeNegocio('El precio por monto de compra solo vale pagando con '.$legibles.'. Se está usando "'.$p['medio'].'".');
            }
        }
    }

    private function validarMediosPagoOfertas(array $items, string $condicionPago, array $pagos): void
    {
        $ids = array_values(array_unique(array_filter(array_map(fn ($it) => (int) ($it['oferta_id'] ?? $it['ofertaId'] ?? 0), $items))));
        foreach ($this->ofertas->ticketConMedios($ids) as $o) {
            $permitidos = array_values(array_filter(array_map('trim', explode(',', $o->medios_pago))));
            $legibles = implode(' / ', $permitidos);
            if ($condicionPago !== 'contado') {
                throw new ErrorDeNegocio('La oferta "'.$o->nombre.'" solo vale pagando al contado ('.$legibles.'). Quitala o cambiá la condición de pago.');
            }
            foreach ($pagos as $p) {
                if ((float) $p['importe'] > 0 && ! in_array($p['medio'], $permitidos, true)) {
                    throw new ErrorDeNegocio('La oferta "'.$o->nombre.'" solo vale pagando con '.$legibles.'. Se está usando "'.$p['medio'].'".');
                }
            }
        }
    }

    /** Un descuento que exige medio pide el pago ÍNTEGRO con ese medio. */
    private function validarMediosPagoDescuentos(array $items, string $condicionPago, array $pagos, iterable $aplicables): void
    {
        $aplicados = array_values(array_unique(array_filter(array_map(fn ($it) => (int) ($it['descuento_id'] ?? $it['descuentoId'] ?? 0), $items))));
        if (! $aplicados) {
            return;
        }
        foreach ($aplicables as $d) {
            $d = (array) $d;
            $medio = $d['medioPago'] ?? $d['medio_pago'] ?? null;
            if (! $medio || ! in_array((int) $d['id'], $aplicados, true)) {
                continue;
            }
            if ($condicionPago !== 'contado') {
                throw new ErrorDeNegocio('El descuento "'.$d['nombre'].'" solo vale pagando al contado con '.$medio.'. Quitalo o cambiá la condición de pago.');
            }
            foreach ($pagos as $p) {
                if ((float) $p['importe'] > 0 && $p['medio'] !== $medio) {
                    throw new ErrorDeNegocio('El descuento "'.$d['nombre'].'" exige que TODA la venta se pague con '.$medio.', y se está usando "'.$p['medio'].'". Sacá el descuento o cobrá todo con '.$medio.'.');
                }
            }
        }
    }

    /** Al cobrar un borrador: vigencia (pudo pasar la medianoche) y medio de pago. */
    private function validarDescuentosAlCobrar(array $items, string $condicionPago, array $pagos): void
    {
        $ids = array_values(array_unique(array_filter(array_map(fn ($it) => (int) ($it['descuentoId'] ?? 0), $items))));
        if (! $ids) {
            return;
        }
        $filas = DB::table('descuentos')->whereIn('id', $ids)->get();
        foreach ($filas as $d) {
            if ($d->vence && strtotime($d->vence) < time()) {
                throw new ErrorDeNegocio('El descuento "'.$d->nombre.'" venció y este ticket todavía lo tiene aplicado. Quitalo del ticket y volvé a cobrar.');
            }
        }
        $this->validarMediosPagoDescuentos($items, $condicionPago, $pagos, $filas);
    }

    private function validarCredito(object $cliente, array $config, string $condicionPago, float $total): void
    {
        if ($condicionPago !== 'cuenta_corriente') {
            return;
        }
        if (empty($config['ctaCteHabilitada'])) {
            throw new ErrorDeNegocio('La venta en cuenta corriente está deshabilitada en la configuración.');
        }
        if (! $cliente->cta_cte_habilitada) {
            throw new ErrorDeNegocio($cliente->nombre.' no tiene cuenta corriente habilitada.');
        }
        if (! empty($config['ctaCteBloquearSuperado']) && $cliente->limite_credito > 0) {
            $saldo = $this->cuenta($cliente->id)['saldo'];
            if ($saldo + $total > $cliente->limite_credito + 1e-9) {
                throw new ErrorDeNegocio('Supera el límite de crédito. Saldo $'.number_format($saldo, 2, '.', '').' + $'.number_format($total, 2, '.', '').' > límite $'.number_format($cliente->limite_credito, 2, '.', '').'.');
            }
        }
    }

    /** Turno: se exige solo al CONTADO. El id que manda el POS es una pista. */
    private function resolverTurno(?int $cajaSesionId, int $sucursalId, string $condicionPago, array $config): ?object
    {
        if ($cajaSesionId) {
            $sugerido = $this->caja->getOpcional($cajaSesionId);
            if ($sugerido && $sugerido->estado === 'abierta' && (int) $sugerido->sucursal_id === $sucursalId) {
                return $sugerido;
            }
        }

        return $this->caja->exigirTurno($sucursalId, $condicionPago === 'contado' && ! empty($config['cajaObligatoria']));
    }

    private function siguienteNumero(string $tipo, string $puntoVenta): int
    {
        return (int) DB::table('ventas')->where('tipo', $tipo)->where('punto_venta', $puntoVenta)->lockForUpdate()->max('numero') + 1;
    }

    /** "Solo para fraccionar" no se vende suelto; ARCHIVADO no se vende. */
    private function validarVendibles(array $items): void
    {
        $sueltos = array_values(array_unique(array_map(fn ($it) => (int) $it['productoId'], array_filter($items, fn ($it) => empty($it['presentacionId'])))));
        if ($sueltos) {
            $prohibido = DB::table('productos')->whereIn('id', $sueltos)->where('solo_fraccionar', true)->value('nombre');
            if ($prohibido) {
                throw new ErrorDeNegocio($prohibido.' no se vende suelto: es solo para fraccionar. Vendé sus paquetes.');
            }
        }
        $ids = array_values(array_unique(array_map(fn ($it) => (int) $it['productoId'], $items)));
        if ($ids) {
            $archivado = DB::table('productos')->whereIn('id', $ids)->where('estado', 'archivado')->value('nombre');
            if ($archivado) {
                throw new ErrorDeNegocio($archivado.' está archivado: ya no se vende. Si volvió a entrar, reactivalo en Compras › Productos.');
            }
        }
    }

    /* ---------------------- Facturación electrónica ---------------------- */

    private function renglonesFiscales(array $items, array $extras): array
    {
        $out = [];
        foreach ($items as $it) {
            $out[] = ['neto' => (float) ($it['subtotal'] ?? 0), 'iva' => (float) ($it['iva'] ?? 21)];
        }
        foreach ($extras as $e) {
            $out[] = ['neto' => (float) ($e['importe'] ?? 0), 'iva' => (float) ($e['iva'] ?? 21)];
        }

        return array_values(array_filter($out, fn ($r) => abs($r['neto']) > 0.0001));
    }

    private function ptoVtaFiscal(?int $sucursalId): ?int
    {
        if (! $sucursalId) {
            return null;
        }
        $pv = (int) preg_replace('/\D/', '', (string) DB::table('sucursales')->where('id', $sucursalId)->value('punto_venta'));

        return $pv ?: null;
    }

    private function receptorDe(object $cliente): array
    {
        return ['tipoDoc' => $cliente->tipo_doc, 'numeroDoc' => $cliente->numero_doc, 'condicionIva' => $cliente->condicion_iva, 'esConsumidorFinal' => (bool) $cliente->es_consumidor_final];
    }

    /**
     * Resuelve el comprobante fiscal con el fallback de ARCA caído: si se pidió
     * factura y ARCA no contesta, la venta NO se cae — sale como ticket
     * provisorio pendiente de facturar. Corre ANTES de la transacción.
     */
    private function resolverFiscal(bool $quiereFactura, object $cliente, array $config, array $venta, array $opciones = []): array
    {
        $vacio = ['tipo' => null, 'cae' => '', 'caeVencimiento' => null, 'cbteNro' => null, 'puntoVenta' => null, 'facturarPendiente' => false, 'facturarMotivo' => ''];
        if (! $quiereFactura) {
            return $vacio;
        }
        $letra = self::letraFacturaPara($cliente, $config);
        if (empty($config['arcaHabilitado'])) {
            return [...$vacio, 'tipo' => $letra];
        }
        if (! $this->arca->disponible()) {
            return [...$vacio, 'tipo' => 'ticket', 'facturarPendiente' => true, 'facturarMotivo' => $this->arca->motivo() ?? 'La facturación electrónica no está configurada.'];
        }
        $r = $this->arca->emitir([
            'tipo' => $letra, 'receptor' => $this->receptorDe($cliente), 'renglones' => $this->renglonesFiscales($venta['items'], $venta['extras']),
            'neto' => $venta['neto'], 'iva' => $venta['iva'], 'total' => $venta['total'], 'ptoVta' => $opciones['ptoVta'] ?? null, 'fecha' => $venta['fecha'] ?? null,
            'reservado' => $opciones['reservado'] ?? null, 'reservar' => $opciones['reservar'] ?? null,
        ]);
        if ($r['ok']) {
            return [...$vacio, 'tipo' => $letra, 'cae' => $r['cae'], 'caeVencimiento' => $r['caeVencimiento'], 'cbteNro' => $r['cbteNro'], 'puntoVenta' => $r['puntoVenta']];
        }

        return [...$vacio, 'tipo' => 'ticket', 'facturarPendiente' => true, 'facturarMotivo' => $r['motivo']];
    }

    /** El CAE de una NOTA: igual que la factura pero con el comprobante ASOCIADO. */
    private function resolverFiscalNota(string $tipoNc, object $cliente, array $config, object $original, array $tot): array
    {
        $vacio = ['cae' => '', 'caeVencimiento' => null, 'cbteNro' => null, 'puntoVenta' => null, 'facturarPendiente' => false, 'facturarMotivo' => ''];
        if (empty($config['arcaHabilitado'])) {
            return $vacio;
        }
        if (! $this->arca->disponible()) {
            return [...$vacio, 'facturarPendiente' => true, 'facturarMotivo' => $this->arca->motivo() ?? 'La facturación electrónica no está configurada.'];
        }
        if (! $original->cae || ! $original->numero) {
            return [...$vacio, 'facturarPendiente' => true, 'facturarMotivo' => 'La venta original todavía no tiene CAE: facturala primero y después emití la nota.'];
        }
        $r = $this->arca->emitir([
            'tipo' => $tipoNc, 'receptor' => $this->receptorDe($cliente), 'renglones' => $this->renglonesFiscales($tot['items'], $tot['extras']),
            'neto' => $tot['subtotalNeto'], 'iva' => $tot['ivaTotal'], 'total' => $tot['total'],
            'ptoVta' => (int) preg_replace('/\D/', '', (string) $original->punto_venta) ?: null,
            'asociado' => ['tipo' => $original->tipo, 'ptoVta' => $original->punto_venta, 'numero' => $original->numero],
        ]);
        if ($r['ok']) {
            return [...$vacio, 'cae' => $r['cae'], 'caeVencimiento' => $r['caeVencimiento'], 'cbteNro' => $r['cbteNro'], 'puntoVenta' => $r['puntoVenta']];
        }

        return [...$vacio, 'facturarPendiente' => true, 'facturarMotivo' => $r['motivo']];
    }

    /* ------------------------------ Escritura ------------------------------ */

    private function insertarHijas(int $ventaId, array $tot, array $pagos = []): void
    {
        if ($tot['items']) {
            DB::table('venta_items')->insert(array_map(fn ($it) => [...$it, 'venta_id' => $ventaId], $tot['items']));
        }
        if ($tot['extras']) {
            DB::table('venta_extras')->insert(array_map(fn ($e) => [...$e, 'venta_id' => $ventaId], $tot['extras']));
        }
        if ($pagos) {
            DB::table('venta_pagos')->insert(array_map(fn ($p) => ['venta_id' => $ventaId, 'medio' => $p['medio'], 'importe' => Pricing::money((float) $p['importe']), 'referencia' => $p['referencia'] ?? ''], $pagos));
        }
    }

    /** Los renglones guardados, en la forma que esperan el inventario y las validaciones. */
    private function itemsGuardados(int $ventaId): array
    {
        return DB::table('venta_items')->where('venta_id', $ventaId)->orderBy('id')->get()->map(fn ($it) => Fila::camel($it))->all();
    }

    public function create(array $dto, array $opciones): array
    {
        $config = $this->cfg->get('ventas');
        $cliente = ! empty($dto['clienteId']) ? $this->cli->get((int) $dto['clienteId']) : $this->cli->consumidorFinal();
        if (! $cliente->activo) {
            throw new ErrorDeNegocio('El cliente está desactivado.');
        }
        $autor = Operador::resolver($dto['operadorId'] ?? null, (int) $opciones['usuarioId']);
        $esBorrador = ($dto['estado'] ?? 'confirmada') === 'borrador';
        $items = $dto['items'] ?? [];
        if (! $esBorrador && ! $items) {
            throw new ErrorDeNegocio('Agregá al menos un ítem.');
        }
        $this->validarVendibles($items);

        $sucursalId = $opciones['sucursalSesion'] ?? $cliente->sucursal_id;
        if (! $sucursalId) {
            throw new ErrorDeNegocio('Indicá la sucursal de la venta.');
        }
        $congelados = $this->portero->congeladosDePresupuesto(! empty($dto['presupuestoId']) ? (int) $dto['presupuestoId'] : null, $cliente->id, (int) $sucursalId);
        $descuentosPorLista = $this->portero->resolverDescuentos($dto['descuentos'] ?? [], (int) $sucursalId, ! empty($opciones['puedePisarPrecio']));
        $resueltos = $this->portero->resolverRenglones($items, $cliente->id, $config, ! empty($opciones['puedePisarPrecio']), $congelados, $descuentosPorLista);
        $tot = Portero::calcularTotales($resueltos, $dto['extras'] ?? []);
        $condicionPago = $dto['condicionPago'] ?? 'contado';
        if (! $esBorrador && ! ($tot['total'] > 0)) {
            throw new ErrorDeNegocio('El total de la venta tiene que ser mayor a 0.');
        }
        $tipo = $dto['tipo'] ?? self::tipoVentaPara($cliente, $config);
        if (! in_array($tipo, self::TIPOS_CREABLES, true)) {
            throw new ErrorDeNegocio('Tipo de comprobante inválido.');
        }
        $puntoVenta = (string) ($config['puntoVenta'] ?: '00001');
        $fecha = self::fechaDeDocumento($dto['fecha'] ?? null, ! empty($opciones['esJefe']));
        $cab = [
            'tipo' => $tipo, 'punto_venta' => $puntoVenta, 'fecha' => $fecha, 'cliente_id' => $cliente->id, 'sucursal_id' => $sucursalId, 'usuario_id' => $autor,
            'condicion_pago' => $condicionPago, 'presupuesto_id' => $dto['presupuestoId'] ?? null, 'lista_precio' => $dto['listaPrecio'] ?? '',
            'subtotal_neto' => $tot['subtotalNeto'], 'descuento_total' => $tot['descuentoTotal'], 'iva_total' => $tot['ivaTotal'], 'total' => $tot['total'],
            'observaciones' => $dto['observaciones'] ?? '', 'created_at' => now(), 'updated_at' => now(),
        ];

        if ($esBorrador) {
            $id = DB::transaction(function () use ($cab, $tot) {
                $id = DB::table('ventas')->insertGetId([...$cab, 'numero' => null, 'estado' => 'borrador']);
                $this->insertarHijas($id, $tot);

                return $id;
            });

            return $this->get($id);
        }

        /* Confirmada de una: el camino de la API. */
        $pagos = $this->validarPagos($condicionPago, $dto['pagos'] ?? [], $tot['total']);
        $this->validarMediosFacturar($tipo, $pagos, $config);
        $this->validarMediosPagoMonto($tot['items'], $condicionPago, $pagos, $config);
        $this->validarMediosPagoOfertas($tot['items'], $condicionPago, $pagos);
        $this->validarMediosPagoDescuentos($tot['items'], $condicionPago, $pagos, $descuentosPorLista);
        $this->validarCredito($cliente, $config, $condicionPago, $tot['total']);
        $turno = $this->resolverTurno($dto['cajaSesionId'] ?? null, (int) $sucursalId, $condicionPago, $config);

        $fiscal = $this->resolverFiscal(str_starts_with($tipo, 'factura'), $cliente, $config,
            ['total' => $tot['total'], 'neto' => $tot['subtotalNeto'], 'iva' => $tot['ivaTotal'], 'items' => $tot['items'], 'extras' => $tot['extras'], 'fecha' => $fecha],
            ['ptoVta' => $this->ptoVtaFiscal((int) $sucursalId)]);
        $tipoFinal = $fiscal['tipo'] ?? $tipo;
        $puntoVentaFinal = $fiscal['puntoVenta'] ?? $puntoVenta;
        $vencimientoPago = ($condicionPago === 'cuenta_corriente' && $cliente->dias_plazo > 0) ? $fecha->copy()->addDays($cliente->dias_plazo) : null;

        $id = DB::transaction(function () use ($cab, $tot, $pagos, $fiscal, $tipoFinal, $puntoVentaFinal, $vencimientoPago, $turno, $dto, $sucursalId, $cliente, $autor, $config) {
            $numero = $fiscal['cbteNro'] ?? $this->siguienteNumero($tipoFinal, $puntoVentaFinal);
            $id = DB::table('ventas')->insertGetId([...$cab, 'tipo' => $tipoFinal, 'punto_venta' => $puntoVentaFinal, 'numero' => $numero, 'estado' => 'confirmada',
                'caja_sesion_id' => $turno?->id, 'vencimiento_pago' => $vencimientoPago, 'cae' => $fiscal['cae'], 'cae_vencimiento' => $fiscal['caeVencimiento'],
                'facturar_pendiente' => $fiscal['facturarPendiente'], 'facturar_motivo' => $fiscal['facturarMotivo']]);
            $this->insertarHijas($id, $tot, $pagos);
            if (! empty($dto['presupuestoId'])) {
                $this->cerrarPresupuesto((int) $dto['presupuestoId'], $id, (int) $sucursalId, $cliente->id, $autor);
            }
            $this->inv->egresarStockItems(['sucursalId' => (int) $sucursalId, 'usuarioId' => $autor, 'permitirNegativo' => ! empty($config['permitirStockNegativo']),
                'descripcion' => 'Venta '.$puntoVentaFinal.'-'.str_pad((string) $numero, 8, '0', STR_PAD_LEFT).' · '.$cliente->nombre, 'items' => $this->itemsGuardados($id)]);

            return $id;
        });

        return $this->get($id);
    }

    /** Venta que CIERRA un presupuesto: reclama el estado y libera la reserva ANTES del egreso. */
    private function cerrarPresupuesto(int $presupuestoId, int $ventaId, int $sucursalId, int $clienteId, ?int $usuarioId): void
    {
        $pre = DB::table('presupuestos')->where('id', $presupuestoId)->lockForUpdate()->first();
        if (! $pre) {
            throw new ErrorDeNegocio('El presupuesto ya no existe.');
        }
        if ($pre->estado !== 'confirmado') {
            throw new ErrorDeNegocio('Solo se cierra un presupuesto confirmado — actualizá la pantalla.');
        }
        if ((int) $pre->cliente_id !== $clienteId) {
            throw new ErrorDeNegocio('Ese presupuesto es de otro cliente.');
        }
        if ((int) $pre->sucursal_id !== $sucursalId) {
            throw new ErrorDeNegocio('Ese presupuesto se cotizó en otra sucursal: tiene la mercadería reservada allá. Cerralo desde esa caja.');
        }
        $gano = DB::table('presupuestos')->where('id', $pre->id)->where('estado', 'confirmado')->update(['estado' => 'cerrado', 'venta_id' => $ventaId, 'updated_at' => now()]);
        if (! $gano) {
            throw new ErrorDeNegocio('El presupuesto cambió de estado — actualizá la pantalla.');
        }
        if ($pre->reservado) {
            $items = DB::table('presupuesto_items')->where('presupuesto_id', $pre->id)->get()->map(fn ($i) => ['productoId' => $i->producto_id, 'presentacionId' => $i->presentacion_id, 'cantidad' => (float) $i->cantidad])->all();
            $this->inv->reservarItems(['sucursalId' => (int) $pre->sucursal_id, 'usuarioId' => $usuarioId, 'liberar' => true, 'descripcion' => $pre->codigo.': cerrado en venta', 'items' => $items]);
        }
    }

    private function exigirBorrador(int $id): array
    {
        $v = $this->get($id);
        if ($v['estado'] !== 'borrador') {
            throw new ErrorDeNegocio('La venta ya está emitida: no se puede modificar.');
        }

        return $v;
    }

    private function exigirSucursal(array|object $v, array $opciones, string $que = 'Ese ticket'): void
    {
        $suc = is_array($v) ? ($v['sucursalId'] ?? null) : ($v->sucursal_id ?? null);
        if (! empty($opciones['soloSuSucursal']) && (int) $suc !== (int) $opciones['soloSuSucursal']) {
            throw new AccessDeniedHttpException($que.' es de otra sucursal.');
        }
    }

    /** Reemplaza el contenido del borrador (el POS manda el ticket completo). */
    public function actualizar(int $id, array $dto, array $opciones): array
    {
        $actual = $this->exigirBorrador($id);
        $this->exigirSucursal($actual, $opciones);
        $autor = Operador::resolver($dto['operadorId'] ?? null, (int) $opciones['usuarioId']);
        $config = $this->cfg->get('ventas');
        $cliente = $this->cli->get((int) ($dto['clienteId'] ?? $actual['clienteId']));
        $items = $dto['items'] ?? [];
        $this->validarVendibles($items);
        // El presupuesto sale del BORRADOR GUARDADO, no del DTO; la sucursal es la de la VENTA.
        $congelados = $this->portero->congeladosDePresupuesto($actual['presupuestoId'] ? (int) $actual['presupuestoId'] : null, $cliente->id, (int) $actual['sucursalId']);
        $yaAplicados = array_values(array_unique(array_filter(array_map(fn ($it) => (int) ($it['descuentoId'] ?? 0), $actual['items']))));
        $descuentosPorLista = $this->portero->resolverDescuentos($dto['descuentos'] ?? [], (int) $actual['sucursalId'], ! empty($opciones['puedePisarPrecio']), $yaAplicados);
        $resueltos = $this->portero->resolverRenglones($items, $cliente->id, $config, ! empty($opciones['puedePisarPrecio']), $congelados, $descuentosPorLista);
        $tot = Portero::calcularTotales($resueltos, $dto['extras'] ?? []);

        DB::transaction(function () use ($id, $cliente, $autor, $dto, $actual, $tot) {
            DB::table('ventas')->where('id', $id)->update([
                'cliente_id' => $cliente->id, 'usuario_id' => $autor ?: $actual['usuarioId'], 'condicion_pago' => $dto['condicionPago'] ?? $actual['condicionPago'],
                'lista_precio' => $dto['listaPrecio'] ?? '', 'observaciones' => $dto['observaciones'] ?? $actual['observaciones'],
                'subtotal_neto' => $tot['subtotalNeto'], 'descuento_total' => $tot['descuentoTotal'], 'iva_total' => $tot['ivaTotal'], 'total' => $tot['total'], 'updated_at' => now(),
            ]);
            DB::table('venta_items')->where('venta_id', $id)->delete();
            DB::table('venta_extras')->where('venta_id', $id)->delete();
            $this->insertarHijas($id, $tot);
        });

        return $this->get($id);
    }

    /** Cierra el borrador: número, stock, pagos. Lo que se confirma es exactamente lo último guardado. */
    public function confirmar(int $id, array $dto, array $opciones): array
    {
        $borrador = $this->get($id);
        if ($borrador['estado'] !== 'borrador') {
            throw new ErrorDeNegocio('Este ticket ya se cobró y la venta existe. Si la pantalla quedó abierta porque se cortó la conexión, buscala en Ventas y no la vuelvas a cobrar: cobrarla de nuevo la duplicaría.');
        }
        $this->exigirSucursal($borrador, $opciones);
        if (! $borrador['items']) {
            throw new ErrorDeNegocio('El ticket está vacío.');
        }
        $this->validarVendibles($borrador['items']);
        $config = $this->cfg->get('ventas');
        $cliente = $this->cli->get((int) $borrador['clienteId']);
        $condicionPago = $dto['condicionPago'] ?? $borrador['condicionPago'];
        $sucursalId = (int) $borrador['sucursalId'];
        $cobrador = Operador::resolver($dto['operadorId'] ?? null, (int) $opciones['usuarioId']);

        /* EL REDONDEO DEL COBRO: "$39.893 se cobra $39.900", hasta $100, como un EXTRA con IVA 0. Idempotente. */
        $redondeoPedido = Pricing::money((float) ($dto['redondeo'] ?? 0));
        if ($redondeoPedido > 100) {
            throw new ErrorDeNegocio('El redondeo puede sumar hasta $100.');
        }
        if ($redondeoPedido > 0 && $condicionPago !== 'contado') {
            throw new ErrorDeNegocio('El redondeo es del cobro al contado: en cuenta corriente el comprobante va por su total exacto.');
        }
        $viejos = array_values(array_filter($borrador['extras'], fn ($e) => $e['concepto'] === 'Redondeo' && ! ((float) $e['iva'] > 0)));
        if ($viejos || $redondeoPedido > 0) {
            $quitar = Pricing::money(array_sum(array_map(fn ($e) => (float) $e['importe'], $viejos)));
            $delta = Pricing::money($redondeoPedido - $quitar);
            DB::transaction(function () use ($viejos, $redondeoPedido, $id, $delta, $borrador) {
                if ($viejos) {
                    DB::table('venta_extras')->whereIn('id', array_map(fn ($e) => $e['id'], $viejos))->delete();
                }
                if ($redondeoPedido > 0) {
                    DB::table('venta_extras')->insert(['venta_id' => $id, 'concepto' => 'Redondeo', 'importe' => $redondeoPedido, 'iva' => 0]);
                }
                if ($delta != 0.0) {
                    DB::table('ventas')->where('id', $id)->update(['subtotal_neto' => Pricing::money($borrador['subtotalNeto'] + $delta), 'total' => Pricing::money($borrador['total'] + $delta)]);
                }
            });
            $borrador['extras'] = [...array_values(array_filter($borrador['extras'], fn ($e) => ! in_array($e, $viejos, true))), ...($redondeoPedido > 0 ? [['concepto' => 'Redondeo', 'importe' => $redondeoPedido, 'iva' => 0]] : [])];
            $borrador['subtotalNeto'] = Pricing::money($borrador['subtotalNeto'] + $delta);
            $borrador['total'] = Pricing::money($borrador['total'] + $delta);
        }

        $pagos = $this->validarPagos($condicionPago, $dto['pagos'] ?? [], $borrador['total']);
        $this->validarMediosPagoMonto($borrador['items'], $condicionPago, $pagos, $config);
        $this->validarMediosPagoOfertas($borrador['items'], $condicionPago, $pagos);
        $this->validarDescuentosAlCobrar($borrador['items'], $condicionPago, $pagos);
        $this->validarCredito($cliente, $config, $condicionPago, $borrador['total']);
        $turno = $this->resolverTurno($dto['cajaSesionId'] ?? null, $sucursalId, $condicionPago, $config);

        $fecha = Carbon::now();
        $vencimientoPago = ($condicionPago === 'cuenta_corriente' && $cliente->dias_plazo > 0) ? $fecha->copy()->addDays($cliente->dias_plazo) : null;
        $pedido = match ($dto['tipo'] ?? null) {
            'factura' => self::letraFacturaPara($cliente, $config),
            'ticket' => 'ticket',
            default => $borrador['tipo'],
        };
        $this->validarMediosFacturar($pedido, $pagos, $config);

        /* ARCA, ANTES de la transacción. Este es el camino del mostrador: se reserva el número. */
        $fiscal = $this->resolverFiscal(str_starts_with($pedido, 'factura'), $cliente, $config,
            ['total' => $borrador['total'], 'neto' => $borrador['subtotalNeto'], 'iva' => $borrador['ivaTotal'], 'items' => $borrador['items'], 'extras' => $borrador['extras'], 'fecha' => $fecha],
            ['ptoVta' => $this->ptoVtaFiscal($sucursalId),
                'reservar' => fn (int $nro, int $cbteTipo) => DB::table('ventas')->where('id', $id)->update(['facturar_cbte_nro' => $nro, 'facturar_cbte_tipo' => $cbteTipo])]);
        $tipo = $fiscal['tipo'] ?? $pedido;
        $puntoVentaFinal = $fiscal['puntoVenta'] ?? $borrador['puntoVenta'];

        DB::transaction(function () use ($id, $turno, $fiscal, $tipo, $puntoVentaFinal, $fecha, $condicionPago, $vencimientoPago, $borrador, $cobrador, $dto, $pagos, $sucursalId, $cliente, $config) {
            $fresca = DB::table('ventas')->where('id', $id)->lockForUpdate()->first();
            if (! $fresca || $fresca->estado !== 'borrador') {
                throw new ErrorDeNegocio('Este ticket ya se cerró mientras se estaba cobrando: alguien lo confirmó desde otra pantalla (o se reintentó el cobro). Buscalo en Ventas antes de rehacerlo — la venta ya existe.');
            }
            if ($turno) {
                $sesion = DB::table('caja_sesiones')->where('id', $turno->id)->lockForUpdate()->first();
                if (! $sesion || $sesion->estado !== 'abierta') {
                    throw new ErrorDeNegocio('El turno de caja se cerró mientras se cobraba este ticket. Abrí el turno nuevo y volvé a cobrarlo: si entrara ahora, su plata quedaría fuera del arqueo que se acaba de firmar.');
                }
            }
            $numero = $fiscal['cbteNro'] ?? $this->siguienteNumero($tipo, $puntoVentaFinal);
            $upd = [
                'tipo' => $tipo, 'numero' => $numero, 'fecha' => $fecha, 'estado' => 'confirmada', 'condicion_pago' => $condicionPago, 'vencimiento_pago' => $vencimientoPago,
                'punto_venta' => $puntoVentaFinal, 'cae' => $fiscal['cae'], 'cae_vencimiento' => $fiscal['caeVencimiento'],
                'facturar_pendiente' => $fiscal['facturarPendiente'], 'facturar_motivo' => $fiscal['facturarMotivo'],
                'caja_sesion_id' => $turno?->id, 'usuario_id' => $borrador['usuarioId'] ?: $cobrador, 'cobrado_por' => $cobrador,
                'observaciones' => $dto['observaciones'] ?? $borrador['observaciones'], 'updated_at' => now(),
            ];
            if (! $fiscal['facturarPendiente']) {
                $upd['facturar_cbte_nro'] = null;
                $upd['facturar_cbte_tipo'] = null;
            }
            DB::table('ventas')->where('id', $id)->update($upd);
            if ($pagos) {
                DB::table('venta_pagos')->insert(array_map(fn ($p) => ['venta_id' => $id, 'medio' => $p['medio'], 'importe' => Pricing::money((float) $p['importe']), 'referencia' => $p['referencia'] ?? ''], $pagos));
            }
            if ($borrador['presupuestoId']) {
                $this->cerrarPresupuesto((int) $borrador['presupuestoId'], $id, $sucursalId, $cliente->id, $cobrador);
            }
            $this->inv->egresarStockItems(['sucursalId' => $sucursalId, 'usuarioId' => $cobrador, 'permitirNegativo' => ! empty($config['permitirStockNegativo']),
                'descripcion' => 'Venta '.$puntoVentaFinal.'-'.str_pad((string) $numero, 8, '0', STR_PAD_LEFT).' · '.$cliente->nombre, 'items' => $borrador['items']]);
        });

        return $this->get($id);
    }

    /** Factura una venta que quedó pendiente: solo emite el papel fiscal. Reintentar es inocuo. */
    public function facturarAhora(int $id, array $opciones): array
    {
        $v = $this->fila($id);
        $this->exigirSucursal($v, $opciones, 'Esa venta');
        if ($v->estado !== 'confirmada') {
            throw new ErrorDeNegocio('Solo se factura una venta confirmada (esta está anulada o en borrador).');
        }
        if (! $v->facturar_pendiente) {
            throw new ErrorDeNegocio('Esta venta no está pendiente de facturar.');
        }
        if (self::esNotaCredito($v->tipo)) {
            throw new ErrorDeNegocio('Esto es una nota de crédito, no una venta: no se factura. Quedó sin CAE y su reintento todavía no está construido.');
        }
        $config = $this->cfg->get('ventas');
        $cliente = $this->cli->get((int) $v->cliente_id);
        $completa = $this->get($id);
        $fiscal = $this->resolverFiscal(true, $cliente, $config,
            ['total' => (float) $v->total, 'neto' => (float) $v->subtotal_neto, 'iva' => (float) $v->iva_total, 'items' => $completa['items'], 'extras' => $completa['extras'], 'fecha' => Carbon::now()],
            ['ptoVta' => $this->ptoVtaFiscal($v->sucursal_id),
                'reservado' => ($v->facturar_cbte_nro && $v->facturar_cbte_tipo) ? ['cbteNro' => (int) $v->facturar_cbte_nro, 'cbteTipo' => (int) $v->facturar_cbte_tipo] : null,
                'reservar' => fn (int $nro, int $cbteTipo) => DB::table('ventas')->where('id', $id)->update(['facturar_cbte_nro' => $nro, 'facturar_cbte_tipo' => $cbteTipo])]);
        if ($fiscal['facturarPendiente']) {
            DB::table('ventas')->where('id', $id)->update(['facturar_motivo' => $fiscal['facturarMotivo']]);
            throw new ErrorDeNegocio('No se pudo facturar: '.$fiscal['facturarMotivo']);
        }
        if (! $fiscal['cae']) {
            throw new ErrorDeNegocio('La facturación electrónica está apagada: no hay con qué emitir el comprobante fiscal. Prendela en Ventas › Configuración y revisá el panel de diagnóstico.');
        }
        $provisorio = $v->punto_venta.'-'.str_pad((string) ($v->numero ?? 0), 8, '0', STR_PAD_LEFT);
        $puntoVentaFinal = $fiscal['puntoVenta'] ?? $v->punto_venta;
        DB::transaction(function () use ($id, $fiscal, $puntoVentaFinal, $v, $provisorio) {
            $fresca = DB::table('ventas')->where('id', $id)->lockForUpdate()->first();
            if (! $fresca || $fresca->estado !== 'confirmada' || ! $fresca->facturar_pendiente) {
                throw new ErrorDeNegocio('Esta venta ya se facturó recién desde otra pantalla (o se anuló). Recargá el listado: el comprobante fiscal ya está emitido y volver a emitirlo sería duplicarlo.');
            }
            $numero = $fiscal['cbteNro'] ?? $this->siguienteNumero($fiscal['tipo'], $puntoVentaFinal);
            DB::table('ventas')->where('id', $id)->update([
                'tipo' => $fiscal['tipo'], 'numero' => $numero, 'punto_venta' => $puntoVentaFinal, 'cae' => $fiscal['cae'], 'cae_vencimiento' => $fiscal['caeVencimiento'],
                'facturar_pendiente' => false, 'facturar_motivo' => '', 'facturar_cbte_nro' => null, 'facturar_cbte_tipo' => null,
                'observaciones' => ($v->observaciones ? $v->observaciones."\n" : '').'[Facturada: era el ticket provisorio '.$provisorio.' — '.($v->facturar_motivo ?: 'ARCA no disponible').']', 'updated_at' => now(),
            ]);
        });

        return $this->get($id);
    }

    /**
     * NOTA DE CRÉDITO — total o parcial, mismo circuito. Cuatro efectos en una
     * transacción: el comprobante, el stock vuelve (si `devuelveMercaderia`),
     * la cuenta corriente baja, y la plata sale del turno (si `devolverEfectivo`).
     * No se puede devolver dos veces: se descuenta lo ya acreditado.
     */
    public function notaCredito(int $ventaId, array $dto, array $opciones): array
    {
        $original = $this->get($ventaId);
        if ($original['estado'] !== 'confirmada') {
            throw new ErrorDeNegocio('Solo se le hace nota de crédito a una venta confirmada.');
        }
        if (self::esNotaCredito($original['tipo'])) {
            throw new ErrorDeNegocio('No se le puede hacer una nota de crédito a otra nota de crédito.');
        }
        if ($original['tipo'] === 'ticket') {
            throw new ErrorDeNegocio('Esta venta es un ticket interno, no un comprobante fiscal: no lleva nota de crédito. '.($original['facturarPendiente'] ? 'Está pendiente de facturar — facturala primero, o anulala si la venta no va.' : 'Anulala.'));
        }
        $this->exigirSucursal($original, $opciones, 'Esa venta');
        $motivo = trim($dto['motivo'] ?? '');
        if ($motivo === '') {
            throw new ErrorDeNegocio('Indicá por qué se emite la nota de crédito.');
        }
        $usuarioId = (int) $opciones['usuarioId'];

        $previo = $this->acreditado($ventaId);
        $pedidos = [];
        foreach ($dto['items'] ?? [] as $l) {
            $pedidos[(int) $l['itemId']] = (float) ($l['cantidad'] ?? 0);
        }
        $elegidos = ! empty($dto['items']);
        $renglones = [];
        foreach ($original['items'] as $it) {
            $clave = $it['productoId'].':'.($it['presentacionId'] ?? '');
            $yaVuelto = $previo['porClave'][$clave] ?? 0;
            $disponible = Pricing::money((float) $it['cantidad'] - $yaVuelto);
            $cant = $elegidos ? ($pedidos[$it['id']] ?? 0) : $disponible;
            if ($cant <= 0) {
                continue;
            }
            if ($cant > $disponible + 1e-9) {
                throw new ErrorDeNegocio('De "'.$it['nombre'].'" la venta lleva '.$it['cantidad'].' y ya se acreditaron '.$yaVuelto.': no se pueden devolver '.$cant.', quedan '.$disponible.'.');
            }
            // Precio e IVA de la venta ORIGINAL: la nota devuelve exactamente lo que se cobró.
            $renglones[] = [...$it, 'cantidad' => $cant, 'ofertaDescuento' => Pricing::money((float) $it['ofertaDescuento'] * ($cant / (float) $it['cantidad'])), 'refItemId' => $it['id']];
        }
        if (! $renglones) {
            throw new ErrorDeNegocio($elegidos ? 'No hay nada para devolver: elegí al menos un renglón.' : 'De esta venta ya se devolvió todo: no queda nada para acreditar.');
        }
        $llevaExtras = ! $elegidos && ! $previo['extras'];
        $tot = Portero::calcularTotales($renglones, $llevaExtras ? $original['extras'] : []);
        $tope = Pricing::money($original['total'] - $previo['total']);
        if ($tot['total'] > $tope + 0.01) {
            throw new ErrorDeNegocio('La nota de crédito da '.Pricing::money($tot['total']).' y de esta venta quedan '.$tope.' por acreditar (total '.$original['total'].', ya acreditado '.Pricing::money($previo['total']).').');
        }

        $config = $this->cfg->get('ventas');
        $cliente = $this->cli->get((int) $original['clienteId']);
        $tipoNc = 'nota_credito_'.strtolower(Comprobante::letraDe($original['tipo']) ?? 'b');
        $originalFila = $this->fila($ventaId);
        $fiscal = $this->resolverFiscalNota($tipoNc, $cliente, $config, $originalFila, $tot);
        $fecha = Carbon::now();
        $sucursalId = (int) $original['sucursalId'];
        $puntoVentaFinal = $fiscal['puntoVenta'] ?? $original['puntoVenta'];

        $turnoId = null;
        $entroPorLaVenta = 0.0;
        if (! empty($dto['devolverEfectivo'])) {
            $turno = $this->caja->actual($sucursalId);
            if (! $turno) {
                throw new ErrorDeNegocio('No hay un turno de caja abierto en esta sucursal: no se puede devolver el efectivo. Abrí la caja, o emití la nota de crédito sin devolución y entregá la plata aparte.');
            }
            $turnoId = (int) $turno->id;
            // No se devuelve más plata de la que ENTRÓ por esta venta (pagos del acto + cobranzas imputadas − ya devuelto).
            $pagadoEnElActo = array_sum(array_map(fn ($p) => (float) $p['importe'], $original['pagos']));
            $yaDevuelto = (float) DB::table('ventas')->where('ref_venta_id', $ventaId)->whereNotNull('caja_sesion_id')->where('estado', '!=', 'anulada')->sum('total');
            $entroPorLaVenta = Pricing::money($pagadoEnElActo + $original['cobrado']);
            $disponible = Pricing::money($entroPorLaVenta - $yaDevuelto);
            if ($tot['total'] > $disponible + 0.009) {
                throw new ErrorDeNegocio('No se puede devolver '.Pricing::money($tot['total']).' en efectivo: de esta venta entraron '.$entroPorLaVenta.' y ya se devolvieron '.Pricing::money($entroPorLaVenta - $disponible).', así que quedan '.Pricing::money(max($disponible, 0)).'. Emití la nota de crédito SIN devolución: la deuda del cliente se ajusta igual.');
            }
        }

        $id = DB::transaction(function () use ($ventaId, $original, $tot, $tope, $turnoId, $entroPorLaVenta, $fiscal, $tipoNc, $puntoVentaFinal, $fecha, $sucursalId, $usuarioId, $motivo, $dto, $cliente, $originalFila) {
            $orig = DB::table('ventas')->where('id', $ventaId)->lockForUpdate()->first();
            if (! $orig || $orig->estado !== 'confirmada') {
                throw new ErrorDeNegocio('La venta se anuló mientras se emitía esta nota de crédito.');
            }
            $ahora = $this->acreditado($ventaId);
            $topeReal = Pricing::money((float) $orig->total - $ahora['total']);
            if ($tot['total'] > $topeReal + 0.01) {
                throw new ErrorDeNegocio('Se emitió otra nota de crédito de esta venta hace un instante: quedaban '.$tope.' y ahora quedan '.Pricing::money(max($topeReal, 0)).'. Revisá la venta y volvé a emitirla por lo que falte.');
            }
            $porOriginal = [];
            foreach ($original['items'] as $it) {
                $k = $it['productoId'].':'.($it['presentacionId'] ?? '');
                $porOriginal[$k] = ($porOriginal[$k] ?? 0) + (float) $it['cantidad'];
            }
            foreach ($tot['items'] as $r) {
                $k = $r['producto_id'].':'.($r['presentacion_id'] ?? '');
                $queda = Pricing::money(($porOriginal[$k] ?? 0) - ($ahora['porClave'][$k] ?? 0));
                if ($r['cantidad'] > $queda + 1e-9) {
                    throw new ErrorDeNegocio('Ya no quedan '.$r['cantidad'].' para devolver de un renglón (quedan '.max($queda, 0).'): otra nota de crédito de esta venta se emitió recién.');
                }
            }
            if ($turnoId) {
                $ya = (float) DB::table('ventas')->where('ref_venta_id', $ventaId)->whereNotNull('caja_sesion_id')->where('estado', '!=', 'anulada')->sum('total');
                $disponibleReal = Pricing::money($entroPorLaVenta - $ya);
                if ($tot['total'] > $disponibleReal + 0.009) {
                    throw new ErrorDeNegocio('Otra devolución de esta venta salió del cajón hace un instante: de los '.Pricing::money($entroPorLaVenta).' que habían entrado quedan '.Pricing::money(max($disponibleReal, 0)).'. Emití la nota SIN devolución: la deuda del cliente se ajusta igual.');
                }
            }
            $numero = $fiscal['cbteNro'] ?? $this->siguienteNumero($tipoNc, $puntoVentaFinal);
            $ncId = DB::table('ventas')->insertGetId([
                'tipo' => $tipoNc, 'punto_venta' => $puntoVentaFinal, 'numero' => $numero, 'fecha' => $fecha, 'cliente_id' => $original['clienteId'], 'sucursal_id' => $sucursalId,
                'usuario_id' => $usuarioId, 'caja_sesion_id' => $turnoId, 'estado' => 'confirmada', 'condicion_pago' => $original['condicionPago'], 'ref_venta_id' => $ventaId,
                'lista_precio' => $original['listaPrecio'], 'subtotal_neto' => $tot['subtotalNeto'], 'descuento_total' => $tot['descuentoTotal'], 'iva_total' => $tot['ivaTotal'], 'total' => $tot['total'],
                'cae' => $fiscal['cae'], 'cae_vencimiento' => $fiscal['caeVencimiento'], 'facturar_pendiente' => $fiscal['facturarPendiente'], 'facturar_motivo' => $fiscal['facturarMotivo'],
                'observaciones' => $motivo."\n[Nota de crédito de ".self::etiquetaVenta($originalFila).']', 'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->insertarHijas($ncId, $tot);
            if (($dto['devuelveMercaderia'] ?? true) !== false) {
                $this->inv->reingresarStockItems(['sucursalId' => $sucursalId, 'usuarioId' => $usuarioId,
                    'descripcion' => 'NC '.$puntoVentaFinal.'-'.str_pad((string) $numero, 8, '0', STR_PAD_LEFT).' de '.self::etiquetaVenta($originalFila).': '.$motivo, 'items' => $this->itemsGuardados($ncId)]);
            }
            if ($turnoId) {
                $sesion = DB::table('caja_sesiones')->where('id', $turnoId)->lockForUpdate()->first();
                if (! $sesion || $sesion->estado !== 'abierta') {
                    throw new ErrorDeNegocio('El turno de caja se cerró mientras se emitía la nota de crédito.');
                }
                DB::table('caja_movimientos')->insert(['caja_sesion_id' => $turnoId, 'fecha' => now(), 'tipo' => 'egreso', 'importe' => Pricing::money($tot['total']),
                    'motivo' => 'Devolución NC '.$puntoVentaFinal.'-'.str_pad((string) $numero, 8, '0', STR_PAD_LEFT).' · '.$cliente->nombre, 'usuario_id' => $usuarioId]);
            }

            return $ncId;
        });

        return $this->get($id);
    }

    /** Pasa la venta abierta a otro vendedor. */
    public function delegar(int $id, int $paraUsuarioId, array $opciones): array
    {
        $b = $this->exigirBorrador($id);
        $this->exigirSucursal($b, $opciones);
        $u = DB::table('usuarios')->find($paraUsuarioId);
        if (! $u) {
            throw new ErrorDeNegocio('Usuario inexistente.');
        }
        if (! $u->activo) {
            throw new ErrorDeNegocio($u->nombre.' está dado de baja: no se le puede pasar el ticket.');
        }
        DB::table('ventas')->where('id', $id)->update(['usuario_id' => $paraUsuarioId, 'updated_at' => now()]);

        return $this->get($id);
    }

    /** Descarta un borrador (delete real: no dejó rastro en stock ni numeración). */
    public function descartar(int $id, array $opciones): array
    {
        $b = $this->exigirBorrador($id);
        $this->exigirSucursal($b, $opciones);
        DB::table('ventas')->where('id', $id)->delete();

        return ['ok' => true];
    }

    /**
     * ANULACIÓN: devuelve la mercadería y saca la venta del arqueo. Pide motivo,
     * guarda quién y cuándo, y NO se anula contra un turno cerrado ni un
     * comprobante con CAE (eso se corrige con nota de crédito).
     */
    public function anular(int $id, string $motivo, array $opciones): array
    {
        $v = $this->get($id);
        if ($v['estado'] === 'anulada') {
            throw new ErrorDeNegocio('La venta ya está anulada.');
        }
        if ($v['estado'] === 'borrador') {
            throw new ErrorDeNegocio('Es una venta abierta: descartala en vez de anularla.');
        }
        if ($v['cae']) {
            throw new ErrorDeNegocio('Esta venta tiene CAE de ARCA ('.$v['cae'].') y no se puede anular: el comprobante existe para ellos y borrarlo acá solo haría que los dos sistemas dejen de coincidir. Corregila con una NOTA DE CRÉDITO.');
        }
        if (self::esNotaCredito($v['tipo'])) {
            throw new ErrorDeNegocio('Una nota de crédito no se anula: si está mal, se corrige con una nota de débito.');
        }
        if ($v['cobrado'] > 0.009) {
            throw new ErrorDeNegocio('Tiene cobranzas imputadas. Anulá primero la cobranza.');
        }
        $this->exigirSucursal($v, $opciones, 'Esa venta');
        $razon = trim($motivo);
        if ($razon === '') {
            throw new ErrorDeNegocio('Indicá por qué se anula la venta.');
        }
        if ($v['cajaSesionId']) {
            $turno = $this->caja->getOpcional((int) $v['cajaSesionId']);
            if ($turno && $turno->estado === 'cerrada' && empty($opciones['esJefe'])) {
                throw new ErrorDeNegocio('El turno de caja de esa venta ya está cerrado: su arqueo quedó firmado. Corregila con una nota de crédito en vez de anularla.');
            }
        }
        $usuarioId = (int) $opciones['usuarioId'];
        DB::transaction(function () use ($id, $v, $razon, $usuarioId, $opciones) {
            $fresca = DB::table('ventas')->where('id', $id)->lockForUpdate()->first();
            if (! $fresca || $fresca->estado === 'anulada') {
                throw new ErrorDeNegocio('Esta venta ya se anuló recién desde otra pantalla.');
            }
            if ($v['cajaSesionId'] && empty($opciones['esJefe'])) {
                $sesion = DB::table('caja_sesiones')->where('id', $v['cajaSesionId'])->lockForUpdate()->first();
                if ($sesion && $sesion->estado !== 'abierta') {
                    throw new ErrorDeNegocio('El turno de caja de esa venta se cerró recién y su arqueo quedó firmado contando esta venta. Corregila con una nota de crédito en vez de anularla.');
                }
            }
            DB::table('ventas')->where('id', $id)->update(['estado' => 'anulada', 'anulado_por' => $usuarioId, 'anulado_en' => now(), 'anulado_motivo' => $razon, 'updated_at' => now()]);
            if ($v['sucursalId']) {
                $this->inv->reingresarStockItems(['sucursalId' => (int) $v['sucursalId'], 'usuarioId' => $usuarioId,
                    'descripcion' => 'Anulación venta '.$v['puntoVenta'].'-'.str_pad((string) ($v['numero'] ?? 0), 8, '0', STR_PAD_LEFT).': '.$razon, 'items' => $v['items']]);
            }
        });

        return $this->get($id);
    }

    /** Snapshot del módulo Ventas: SOLO catálogos chicos. */
    public function bootstrap(?int $usuarioSesion): array
    {
        $this->cli->consumidorFinal();
        $usuarios = DB::table('usuarios as u')->join('roles as r', 'r.id', '=', 'u.rol_id')->orderBy('u.nombre')
            ->get(['u.id', 'u.nombre', 'u.activo', 'u.rol_id', 'u.relevo_caja', 'r.clave as rol_clave', 'r.nombre as rol_nombre'])
            ->map(fn ($u) => ['id' => $u->id, 'nombre' => $u->nombre, 'activo' => (bool) $u->activo, 'rolId' => $u->rol_id, 'relevoCaja' => (bool) $u->relevo_caja, 'rolClave' => $u->rol_clave, 'rolNombre' => $u->rol_nombre])->all();

        return [
            'clientes' => $this->cli->listar(),
            'config' => $this->cfg->get('ventas'),
            'sucursales' => DB::table('sucursales')->orderBy('nombre')->get()->map(fn ($s) => ['id' => $s->id, 'nombre' => $s->nombre, 'tipo' => $s->tipo, 'puntoVenta' => $s->punto_venta, 'direccion' => $s->direccion])->all(),
            'usuarios' => $usuarios,
            'listasCatalogo' => $this->listas->catalogo(),
            'marcas' => DB::table('marcas')->where('activa', true)->orderBy('nombre')->get(['id', 'nombre'])->all(),
            'descuentos' => app(\App\Services\DescuentosService::class)->listar(),
        ];
    }
}
