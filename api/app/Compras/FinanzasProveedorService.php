<?php

namespace App\Compras;

use App\Auth\Sesion;
use App\Exceptions\ErrorDeNegocio;
use App\Support\Fila;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * FINANZAS DEL PROVEEDOR — compromisos, echeqs y estado de cuenta.
 *
 * La deuda no vive acá: nace en comprobantes y gastos y se cancela en pagos.
 * Este servicio la mira, la promete y la explica.
 *
 *  · COMPROMISOS ("Cuentas corrientes"): el vencimiento como entidad. Se
 *    listan los que NO son echeq (el echeq tiene su propia vitrina).
 *  · ECHEQS: la cartera propia. "Cobrado" no es una etiqueta: ejecuta el
 *    pago real (imputado a su factura) vía PagosProveedorService.
 *  · ESTADO DE CUENTA: el mayor DEBE/HABER por proveedor, el saldo con la
 *    MISMA fórmula que `cuenta()` de pagos más los ajustes, la antigüedad
 *    FIFO, la conciliación y el saldo proyectado.
 */
class FinanzasProveedorService
{
    private const EPS = Documentos::EPS;

    public function __construct(private readonly PagosProveedorService $pagos) {}

    /* ============================ Compromisos ============================ */

    private function baseCompromisos()
    {
        return DB::table('proveedor_compromisos as k')->leftJoin('proveedores as p', 'p.id', '=', 'k.proveedor_id')->leftJoin('comprobantes as c', 'c.id', '=', 'k.comprobante_id')
            ->select('k.*', DB::raw("coalesce(p.nombre,'') as proveedor_nombre"), 'c.tipo as comp_tipo', 'c.letra as comp_letra', 'c.punto_venta as comp_pv', 'c.numero as comp_numero');
    }

    private function mapCompromiso(object $f): array
    {
        $out = Fila::camel($f);
        unset($out['compTipo'], $out['compLetra'], $out['compPv'], $out['compNumero']);
        $out['pagado'] = (bool) $f->pagado;
        $out['comprobanteEtiqueta'] = $f->comprobante_id && $f->comp_tipo
            ? Documentos::etiqueta(['tipo' => $f->comp_tipo, 'letra' => $f->comp_letra, 'punto_venta' => $f->comp_pv, 'numero' => $f->comp_numero, 'id' => $f->comprobante_id]) : '';
        $out['diasRest'] = Documentos::diasHasta($f->fecha_venc);
        $out['diasPlazo'] = $f->fecha_venc && $f->fecha_emision ? (int) Carbon::parse($f->fecha_emision)->diffInDays(Carbon::parse($f->fecha_venc), false) : null;

        return $out;
    }

    public function listarCompromisos(array $q): array
    {
        $qb = $this->baseCompromisos()->where('k.es_echeq', false);
        $hoy = Documentos::hoy();
        $filtro = $q['filtro'] ?? 'pendientes';
        match ($filtro) {
            'pendientes' => $qb->where('k.pagado', false),
            'vencidos' => $qb->where('k.pagado', false)->where('k.fecha_venc', '<', $hoy),
            'semana' => $qb->where('k.pagado', false)->where('k.fecha_venc', '>=', $hoy)->where('k.fecha_venc', '<', $hoy->copy()->addDays(8)),
            'mes' => $qb->where('k.pagado', false)->where('k.fecha_venc', '>=', Carbon::now(Documentos::ZONA)->startOfMonth()->utc())->where('k.fecha_venc', '<', Carbon::now(Documentos::ZONA)->startOfMonth()->addMonth()->utc()),
            'futuros' => $qb->where('k.pagado', false)->where('k.fecha_venc', '>=', $hoy->copy()->addDay()),
            'pagados' => $qb->where('k.pagado', true),
            default => $qb,
        };
        if (! empty($q['proveedorId'])) {
            $qb->where('k.proveedor_id', (int) $q['proveedorId']);
        }
        $filas = $qb->orderBy('k.fecha_venc')->orderBy('k.id')->limit(500)->get();

        return ['filas' => $filas->map(fn ($f) => $this->mapCompromiso($f))->all(), 'total' => $filas->count(), 'totalImporte' => Documentos::money($filas->sum('importe'))];
    }

    public function statsCompromisos(): array
    {
        $hoy = Documentos::hoy();
        $r = DB::table('proveedor_compromisos')->where('pagado', false)->where('es_echeq', false)->selectRaw(
            'sum(case when fecha_venc < ? then 1 else 0 end) as vencidos_n, coalesce(sum(case when fecha_venc < ? then importe else 0 end),0) as vencidos_m,'
            .'sum(case when fecha_venc >= ? and fecha_venc < ? then 1 else 0 end) as prox3_n, coalesce(sum(case when fecha_venc >= ? and fecha_venc < ? then importe else 0 end),0) as prox3_m,'
            .'sum(case when fecha_venc >= ? and fecha_venc < ? then 1 else 0 end) as semana_n, coalesce(sum(case when fecha_venc >= ? and fecha_venc < ? then importe else 0 end),0) as semana_m,'
            .'count(*) as total_n, coalesce(sum(importe),0) as total_m',
            [$hoy, $hoy, $hoy, $hoy->copy()->addDays(4), $hoy, $hoy->copy()->addDays(4), $hoy, $hoy->copy()->addDays(8), $hoy, $hoy->copy()->addDays(8)])->first();

        return ['vencidos' => ['n' => (int) $r->vencidos_n, 'monto' => Documentos::money((float) $r->vencidos_m)], 'prox3' => ['n' => (int) $r->prox3_n, 'monto' => Documentos::money((float) $r->prox3_m)],
            'semana' => ['n' => (int) $r->semana_n, 'monto' => Documentos::money((float) $r->semana_m)], 'total' => ['n' => (int) $r->total_n, 'monto' => Documentos::money((float) $r->total_m)]];
    }

    public function getCompromiso(int $id): array
    {
        $f = $this->baseCompromisos()->where('k.id', $id)->first();
        if (! $f) {
            throw new NotFoundHttpException('Compromiso inexistente.');
        }

        return $this->mapCompromiso($f);
    }

    public function crearCompromisoManual(array $d): array
    {
        if (! DB::table('proveedores')->where('id', (int) ($d['proveedorId'] ?? 0))->exists()) {
            throw new ErrorDeNegocio('Proveedor inválido.');
        }
        $importe = Documentos::money($d['importe'] ?? 0);
        if ($importe <= 0) {
            throw new ErrorDeNegocio('El importe tiene que ser mayor a 0.');
        }
        $id = DB::table('proveedor_compromisos')->insertGetId([
            'proveedor_id' => (int) $d['proveedorId'], 'importe' => $importe, 'fecha_emision' => Documentos::fecha($d['fechaEmision'] ?? null) ?? now(),
            'fecha_venc' => Documentos::fecha($d['fechaVenc'] ?? null, true), 'origen' => 'manual', 'obs' => mb_substr(trim((string) ($d['obs'] ?? '')), 0, 300),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->getCompromiso($id);
    }

    public function editarCompromiso(int $id, array $d): array
    {
        $k = $this->getCompromiso($id);
        if ($k['pagado']) {
            throw new ErrorDeNegocio('El compromiso ya se pagó: no se edita — la historia no se reescribe.');
        }
        $patch = [];
        if (isset($d['importe'])) {
            $patch['importe'] = Documentos::money($d['importe']);
            if ($patch['importe'] <= 0) {
                throw new ErrorDeNegocio('El importe tiene que ser mayor a 0.');
            }
        }
        if (! empty($d['fechaVenc'])) {
            $patch['fecha_venc'] = Documentos::fecha($d['fechaVenc']);
        }
        if (! empty($d['fechaEmision'])) {
            $patch['fecha_emision'] = Documentos::fecha($d['fechaEmision']);
        }
        if (array_key_exists('obs', $d) && $d['obs'] !== null) {
            $patch['obs'] = mb_substr(trim((string) $d['obs']), 0, 300);
        }
        if ($patch) {
            DB::table('proveedor_compromisos')->where('id', $id)->update([...$patch, 'updated_at' => now()]);
            // El echeq que nació de este compromiso sigue su importe y su fecha.
            $eco = array_intersect_key($patch, ['importe' => 1, 'fecha_venc' => 1]);
            if ($eco) {
                DB::table('proveedor_echeqs')->where('compromiso_id', $id)->whereIn('estado', ['emitido', 'entregado'])->update($eco);
            }
        }

        return $this->getCompromiso($id);
    }

    public function borrarCompromiso(int $id): void
    {
        $k = $this->getCompromiso($id);
        if ($k['pagado']) {
            throw new ErrorDeNegocio('El compromiso ya se pagó: quedó como historia del pago.');
        }
        DB::transaction(function () use ($id) {
            DB::table('proveedor_echeqs')->where('compromiso_id', $id)->whereIn('estado', ['emitido', 'entregado'])->update(['estado' => 'anulado']);
            DB::table('proveedor_compromisos')->where('id', $id)->delete();
        });
    }

    /**
     * PAGAR un compromiso: crea el pago REAL (con su candado de caja, su
     * arqueo, su bandeja) imputado a la factura si la hay, por el saldo VIVO
     * de esa factura (una NC pudo haberla bajado después de pactar).
     */
    public function pagarCompromiso(int $id, array $d, Sesion $auth, bool $desdeEcheq = false): array
    {
        $k = $this->getCompromiso($id);
        if ($k['pagado']) {
            throw new ErrorDeNegocio('Ese compromiso ya está pagado.');
        }
        if ($k['esEcheq'] && ! $desdeEcheq) {
            throw new ErrorDeNegocio('Este compromiso es un echeq: se cobra desde la cartera de Echeqs.');
        }
        if (empty($d['medio']) && empty($d['formas'])) {
            throw new ErrorDeNegocio('Indicá con qué medio REAL se pagó (la promesa decía cuenta corriente; la plata salió por algún lado).');
        }
        $concepto = 'Compromiso #'.$k['id'].($k['comprobanteEtiqueta'] ? ' · '.$k['comprobanteEtiqueta'] : '').($k['cuota'] ? ' · cuota '.$k['cuota'].'/'.$k['cuotas'] : '')
            .(trim((string) ($d['obs'] ?? '')) !== '' ? ' · '.trim($d['obs']) : '');
        $importe = Documentos::money($k['importe']);
        $imputaciones = null;
        if ($k['comprobanteId']) {
            $doc = collect($this->pagos->documentosPendientes((int) $k['proveedorId'], 'mercaderia'))->first(fn ($x) => $x['tipo'] === 'comprobante' && (int) $x['docId'] === (int) $k['comprobanteId']);
            $saldoDoc = $doc ? Documentos::money($doc['saldo']) : 0.0;
            if ($saldoDoc <= self::EPS) {
                DB::table('proveedor_compromisos')->where('id', $id)->where('pagado', false)->update(['pagado' => true, 'updated_at' => now()]);

                return [...$this->getCompromiso($id), 'aviso' => 'La factura ya estaba saldada: el compromiso se cerró sin generar un pago nuevo.'];
            }
            $importe = min($importe, $saldoDoc);
            $imputaciones = [['comprobanteId' => (int) $k['comprobanteId'], 'importe' => $importe]];
        }
        $pago = $this->pagos->crear([
            'proveedorId' => (int) $k['proveedorId'], 'destino' => $k['comprobanteId'] ? 'mercaderia' : null, 'importe' => $importe,
            'medio' => ! empty($d['formas']) ? null : ($d['medio'] ?? null), 'formas' => $d['formas'] ?? [], 'fecha' => $d['fecha'] ?? Documentos::hoyIso(), 'concepto' => $concepto,
            'referencia' => $d['referencia'] ?? '', 'cajaSesionId' => $d['cajaSesionId'] ?? null, 'usuarioId' => $auth->usuarioId, 'imputaciones' => $imputaciones,
        ], $auth->sucursalId, $auth->esJefe());
        /*
         * LA CUOTA: si la factura sigue con saldo, el puente (sincronizarCompromisos)
         * no la cerró — la cierra este método, que es el único que sabe cuál se pagó.
         * No hay que "devolver" hermanos: el puente no empareja por monto, empareja
         * por saldo de la FACTURA entera llegando a cero — si al pagar esta cuota
         * también cerró otras (una NC bajó la deuda real después de pactar el
         * cronograma), esas quedan pagadas de verdad, no por error.
         */
        DB::table('proveedor_compromisos')->where('id', $id)->update(['pagado' => true, 'pago_id' => $pago['id'], 'updated_at' => now()]);
        DB::table('proveedor_echeqs')->where('compromiso_id', $id)->whereIn('estado', ['emitido', 'entregado'])->update(['estado' => 'cobrado', 'pago_id' => $pago['id']]);

        return [...$this->getCompromiso($id), 'pago' => $pago];
    }

    /* ============================ Echeqs ============================ */

    private function baseEcheqs()
    {
        return DB::table('proveedor_echeqs as e')->leftJoin('proveedores as p', 'p.id', '=', 'e.proveedor_id')->select('e.*', DB::raw("coalesce(p.nombre,'') as proveedor_nombre"));
    }

    private function mapEcheq(object $f): array
    {
        return [...Fila::camel($f), 'diasRest' => Documentos::diasHasta($f->fecha_venc)];
    }

    public function listarEcheqs(array $q): array
    {
        $qb = $this->baseEcheqs();
        $hoy = Documentos::hoy();
        match ($q['filtro'] ?? 'activos') {
            'activos' => $qb->whereIn('e.estado', ['emitido', 'entregado']),
            'vencidos' => $qb->whereIn('e.estado', ['emitido', 'entregado'])->where('e.fecha_venc', '<', $hoy),
            'semana' => $qb->whereIn('e.estado', ['emitido', 'entregado'])->where('e.fecha_venc', '>=', $hoy)->where('e.fecha_venc', '<', $hoy->copy()->addDays(8)),
            'cobrados' => $qb->where('e.estado', 'cobrado'),
            'anulados' => $qb->where('e.estado', 'anulado'),
            default => $qb,
        };
        if (! empty($q['proveedorId'])) {
            $qb->where('e.proveedor_id', (int) $q['proveedorId']);
        }
        if (trim((string) ($q['buscar'] ?? '')) !== '') {
            $like = '%'.trim($q['buscar']).'%';
            $qb->where(fn ($w) => $w->where('e.numero', 'like', $like)->orWhere('e.banco', 'like', $like)->orWhere('p.nombre', 'like', $like)->orWhere('e.obs', 'like', $like));
        }
        $filas = $qb->orderBy('e.fecha_venc')->orderByDesc('e.id')->limit(500)->get();

        return ['filas' => $filas->map(fn ($f) => $this->mapEcheq($f))->all(), 'total' => $filas->count(), 'totalImporte' => Documentos::money($filas->sum('importe'))];
    }

    public function statsEcheqs(): array
    {
        $hoy = Documentos::hoy();
        $r = DB::table('proveedor_echeqs')->whereIn('estado', ['emitido', 'entregado'])->selectRaw(
            'count(*) as activos_n, coalesce(sum(importe),0) as activos_m, sum(case when fecha_venc < ? then 1 else 0 end) as vencidos_n,'
            .'coalesce(sum(case when fecha_venc < ? then importe else 0 end),0) as vencidos_m, sum(case when fecha_venc >= ? and fecha_venc < ? then 1 else 0 end) as prox3_n,'
            .'coalesce(sum(case when fecha_venc >= ? and fecha_venc < ? then importe else 0 end),0) as prox3_m',
            [$hoy, $hoy, $hoy, $hoy->copy()->addDays(4), $hoy, $hoy->copy()->addDays(4)])->first();
        $porBanco = DB::table('proveedor_echeqs')->whereIn('estado', ['emitido', 'entregado'])->groupBy('banco')->selectRaw('banco, count(*) as n, coalesce(sum(importe),0) as monto')->orderByDesc('monto')->limit(5)->get()
            ->map(fn ($b) => ['banco' => $b->banco, 'n' => (int) $b->n, 'monto' => Documentos::money((float) $b->monto)])->all();

        return ['activos' => ['n' => (int) $r->activos_n, 'monto' => Documentos::money((float) $r->activos_m)], 'vencidos' => ['n' => (int) $r->vencidos_n, 'monto' => Documentos::money((float) $r->vencidos_m)],
            'prox3' => ['n' => (int) $r->prox3_n, 'monto' => Documentos::money((float) $r->prox3_m)], 'porBanco' => $porBanco];
    }

    public function getEcheq(int $id): array
    {
        $f = $this->baseEcheqs()->where('e.id', $id)->first();
        if (! $f) {
            throw new NotFoundHttpException('Echeq inexistente.');
        }

        return $this->mapEcheq($f);
    }

    public function crearEcheq(array $d): array
    {
        if (empty($d['proveedorId']) || ! DB::table('proveedores')->where('id', (int) $d['proveedorId'])->exists()) {
            throw new ErrorDeNegocio('Elegí el proveedor del echeq.');
        }
        if (empty($d['fechaVenc'])) {
            throw new ErrorDeNegocio('El echeq necesita su fecha de cobro.');
        }
        $importe = Documentos::money($d['importe'] ?? 0);
        if ($importe <= 0) {
            throw new ErrorDeNegocio('El importe del echeq tiene que ser mayor a 0.');
        }
        $id = DB::table('proveedor_echeqs')->insertGetId([
            'numero' => mb_substr(trim((string) ($d['numero'] ?? '')), 0, 40), 'banco' => mb_substr(trim((string) ($d['banco'] ?? '')), 0, 100), 'importe' => $importe,
            'fecha_emision' => Documentos::fecha($d['fechaEmision'] ?? null) ?? now(), 'fecha_venc' => Documentos::fecha($d['fechaVenc'], true), 'proveedor_id' => (int) $d['proveedorId'],
            'obs' => trim((string) ($d['obs'] ?? '')), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->getEcheq($id);
    }

    public function editarEcheq(int $id, array $d): array
    {
        $e = $this->getEcheq($id);
        if ($e['estado'] === 'cobrado') {
            throw new ErrorDeNegocio('El echeq ya se cobró: el pago quedó registrado y no se reescribe.');
        }
        if (isset($d['importe']) && $e['compromisoId']) {
            throw new ErrorDeNegocio('Este echeq nació de una factura: su importe es el del compromiso.');
        }
        $patch = [];
        if (array_key_exists('numero', $d) && $d['numero'] !== null) {
            $patch['numero'] = mb_substr(trim((string) $d['numero']), 0, 40);
        }
        if (array_key_exists('banco', $d) && $d['banco'] !== null) {
            $patch['banco'] = mb_substr(trim((string) $d['banco']), 0, 100);
        }
        if (isset($d['importe']) && ! $e['compromisoId']) {
            $patch['importe'] = Documentos::money($d['importe']);
            if ($patch['importe'] <= 0) {
                throw new ErrorDeNegocio('El importe del echeq tiene que ser mayor a 0.');
            }
        }
        if (! empty($d['fechaEmision'])) {
            $patch['fecha_emision'] = Documentos::fecha($d['fechaEmision']);
        }
        if (! empty($d['fechaVenc'])) {
            $patch['fecha_venc'] = Documentos::fecha($d['fechaVenc']);
        }
        if (array_key_exists('obs', $d) && $d['obs'] !== null) {
            $patch['obs'] = trim((string) $d['obs']);
        }
        if ($patch) {
            DB::table('proveedor_echeqs')->where('id', $id)->update([...$patch, 'updated_at' => now()]);
        }

        return $this->getEcheq($id);
    }

    /** 'cobrado' es EL momento contable: el banco debitó — se crea el pago real (medio echeq, fecha = vencimiento). */
    public function estadoEcheq(int $id, string $estado, Sesion $auth): array
    {
        if (! in_array($estado, ['emitido', 'entregado', 'cobrado', 'anulado'], true)) {
            throw new ErrorDeNegocio('Estado inválido.');
        }
        $e = $this->getEcheq($id);
        if ($e['estado'] === $estado) {
            return $e;
        }
        if ($e['estado'] === 'cobrado') {
            throw new ErrorDeNegocio('El echeq ya se cobró: si el pago está mal, se anula desde Pagos (eso lo devuelve a emitido).');
        }
        if ($estado === 'cobrado') {
            $fechaVenc = substr((string) $e['fechaVenc'], 0, 10);
            if ($e['pagoId']) {
                DB::table('proveedor_echeqs')->where('id', $id)->update(['estado' => 'cobrado', 'updated_at' => now()]);
            } elseif ($e['compromisoId']) {
                $k = $this->getCompromiso((int) $e['compromisoId']);
                if (! $k['pagado']) {
                    $this->pagarCompromiso($k['id'], ['medio' => 'echeq', 'fecha' => Carbon::parse($e['fechaVenc'])->setTimezone(Documentos::ZONA)->format('Y-m-d')], $auth, true);
                } elseif ($k['pagoId']) {
                    DB::table('proveedor_echeqs')->where('id', $id)->update(['estado' => 'cobrado', 'pago_id' => $k['pagoId'], 'updated_at' => now()]);
                }
            } else {
                $pago = $this->pagos->crear([
                    'proveedorId' => (int) $e['proveedorId'], 'importe' => Documentos::money($e['importe']), 'medio' => 'echeq',
                    'fecha' => Carbon::parse($e['fechaVenc'])->setTimezone(Documentos::ZONA)->format('Y-m-d'),
                    'concepto' => 'Cobro de echeq '.($e['numero'] ?: '#'.$e['id']).($e['banco'] ? ' ('.$e['banco'].')' : ''), 'usuarioId' => $auth->usuarioId,
                ], $auth->sucursalId, $auth->esJefe());
                DB::table('proveedor_echeqs')->where('id', $id)->update(['estado' => 'cobrado', 'pago_id' => $pago['id'], 'updated_at' => now()]);
            }

            return $this->getEcheq($id);
        }
        DB::table('proveedor_echeqs')->where('id', $id)->update(['estado' => $estado, 'updated_at' => now()]);

        return $this->getEcheq($id);
    }

    public function borrarEcheq(int $id): void
    {
        $e = $this->getEcheq($id);
        if ($e['estado'] === 'cobrado' || $e['pagoId']) {
            throw new ErrorDeNegocio('El echeq ya se cobró: tiene un pago atrás. Anulá el pago primero si está mal.');
        }
        DB::table('proveedor_echeqs')->where('id', $id)->delete();
    }

    /* ============================ Estado de cuenta ============================ */

    /** Una fila por proveedor con movimiento: la cuenta por pagar de la MERCADERÍA (el que solo factura gastos se mira en Gastos). */
    public function edocGlobal(): array
    {
        $comp = DB::table('comprobantes')->where('estado', 'confirmado')->groupBy('proveedor_id')->selectRaw(
            "proveedor_id, coalesce(sum(case when tipo in ('factura','liquidacion','nota_debito') then total when tipo = 'nota_credito' then -total else 0 end),0) as deuda,"
            ."min(case when tipo in ('factura','liquidacion','nota_debito') and total - pagado > ".self::EPS.' then fecha else null end) as impaga_desde')->get()->keyBy('proveedor_id');
        $gasto = DB::table('gastos')->where('estado', '!=', 'anulado')->whereNotNull('proveedor_id')->groupBy('proveedor_id')
            ->selectRaw('proveedor_id, coalesce(sum(total),0) as deuda, min(case when total - pagado > '.self::EPS.' then fecha else null end) as impaga_desde')->get()->keyBy('proveedor_id');
        $pago = DB::table('proveedor_pagos')->where('estado', 'activo')->whereNotNull('proveedor_id')->groupBy('proveedor_id')
            ->selectRaw('proveedor_id, coalesce(sum(importe),0) as pagado, max(fecha) as ultimo_pago')->get()->keyBy('proveedor_id');
        $ajuste = DB::table('proveedor_ajustes')->groupBy('proveedor_id')->selectRaw('proveedor_id, coalesce(sum(importe),0) as ajustes')->get()->keyBy('proveedor_id');
        $comprom = DB::table('proveedor_compromisos')->where('pagado', false)->groupBy('proveedor_id')->selectRaw('proveedor_id, coalesce(sum(importe),0) as pendiente')->get()->keyBy('proveedor_id');
        $provs = DB::table('proveedores')->orderBy('nombre')->get(['id', 'nombre', 'dias_pago', 'modo_cuenta', 'medio_habitual', 'conciliado_hasta', 'provee_mercaderia']);

        $hoy = Documentos::hoy();
        $filas = [];
        foreach ($provs as $p) {
            $mercaderia = Documentos::money((float) ($comp[$p->id]->deuda ?? 0));
            $gastos = Documentos::money((float) ($gasto[$p->id]->deuda ?? 0));
            $pagado = Documentos::money((float) ($pago[$p->id]->pagado ?? 0));
            $ajustes = Documentos::money((float) ($ajuste[$p->id]->ajustes ?? 0));
            $pendientes = Documentos::money((float) ($comprom[$p->id]->pendiente ?? 0));
            if (! $mercaderia && ! $gastos && ! $pagado && ! $ajustes && ! $pendientes) {
                continue;
            }
            if (! $p->provee_mercaderia && ! isset($comp[$p->id])) {
                continue;
            }
            $saldo = Documentos::money($mercaderia + $gastos + $ajustes - $pagado);
            $estado = 'al_dia';
            if ($saldo < -self::EPS) {
                $estado = 'a_favor';
            } elseif ($saldo > self::EPS) {
                $estado = 'pendiente';
                $desde = $comp[$p->id]->impaga_desde ?? $gasto[$p->id]->impaga_desde ?? null;
                if ($desde && $p->dias_pago > 0 && Carbon::parse($desde)->addDays((int) $p->dias_pago)->lt($hoy)) {
                    $estado = 'vencido';
                }
            }
            $filas[] = ['id' => $p->id, 'nombre' => $p->nombre, 'diasPago' => $p->dias_pago, 'modoCuenta' => $p->modo_cuenta, 'medioHabitual' => $p->medio_habitual,
                'conciliadoHasta' => Fila::iso($p->conciliado_hasta), 'mercaderia' => $mercaderia, 'gastos' => $gastos, 'ajustes' => $ajustes, 'pagado' => $pagado, 'saldo' => $saldo,
                'compromisosPendientes' => $pendientes, 'saldoProyectado' => Documentos::money($saldo - $pendientes), 'ultimoPago' => Fila::iso($pago[$p->id]->ultimo_pago ?? null), 'estado' => $estado];
        }

        return $filas;
    }

    /** El mayor de UN proveedor: cada movimiento al DEBE o al HABER, antigüedad FIFO, compromisos pendientes y cuentas. */
    public function edocProveedor(int $proveedorId): array
    {
        $prov = DB::table('proveedores')->find($proveedorId);
        if (! $prov) {
            throw new NotFoundHttpException('Proveedor inexistente.');
        }
        $comps = DB::table('comprobantes')->where('proveedor_id', $proveedorId)->where('estado', 'confirmado')->whereIn('tipo', ['factura', 'liquidacion', 'nota_debito', 'nota_credito'])->get();
        $gs = DB::table('gastos')->where('proveedor_id', $proveedorId)->where('estado', '!=', 'anulado')->get();
        $pgs = DB::table('proveedor_pagos as p')->leftJoin('usuarios as u', 'u.id', '=', 'p.usuario_id')->leftJoin('sucursales as s', 's.id', '=', 'p.sucursal_id')
            ->where('p.proveedor_id', $proveedorId)->where('p.estado', 'activo')->get(['p.*', DB::raw("coalesce(u.nombre,'') as usuario_nombre"), DB::raw("coalesce(s.nombre,'') as sucursal_nombre")]);
        $ajs = DB::table('proveedor_ajustes')->where('proveedor_id', $proveedorId)->get();
        $formas = DB::table('pago_formas')->whereIn('pago_id', $pgs->pluck('id'))->orderBy('id')->get()->groupBy('pago_id');

        $movs = [];
        foreach ($comps as $c) {
            $esNc = $c->tipo === 'nota_credito';
            $movs[] = ['kind' => $esNc ? 'nc' : 'comprobante', 'id' => $c->id, 'fecha' => Fila::iso($c->fecha), 'etiqueta' => Documentos::etiqueta($c), 'detalle' => $c->observaciones ?? '',
                'debe' => $esNc ? 0.0 : Documentos::money((float) $c->total), 'haber' => $esNc ? Documentos::money((float) $c->total) : 0.0,
                'saldoDoc' => $esNc ? null : Documentos::money((float) $c->total - (float) $c->pagado)];
        }
        foreach ($gs as $g) {
            $movs[] = ['kind' => 'gasto', 'id' => $g->id, 'fecha' => Fila::iso($g->fecha), 'etiqueta' => 'Gasto #'.$g->id.($g->numero ? ' · '.$g->numero : ''), 'detalle' => $g->descripcion ?? '',
                'debe' => Documentos::money((float) $g->total), 'haber' => 0.0, 'saldoDoc' => Documentos::money((float) $g->total - (float) $g->pagado)];
        }
        foreach ($pgs as $p) {
            $fs = ($formas->get($p->id) ?? collect())->map(fn ($f) => ['medio' => $f->medio, 'importe' => (float) $f->importe, 'fecha' => Fila::iso($f->fecha)])->all();
            $movs[] = ['kind' => 'pago', 'id' => $p->id, 'fecha' => Fila::iso($p->fecha),
                'etiqueta' => $p->es_flete ? 'Flete ('.$p->medio.')' : (count($fs) > 1 ? 'Pago mixto ('.implode(' + ', array_column($fs, 'medio')).')' : 'Pago ('.$p->medio.')'),
                'detalle' => $p->concepto ?? '', 'debe' => 0.0, 'haber' => Documentos::money((float) $p->importe), 'esFlete' => (bool) $p->es_flete, 'formas' => $fs, 'medio' => $p->medio, 'destino' => $p->destino,
                'aplicado' => Documentos::money((float) $p->aplicado), 'sinAplicar' => Documentos::money((float) $p->importe - (float) $p->aplicado), 'referencia' => $p->referencia ?? '',
                'cajaSesionId' => $p->caja_sesion_id, 'usuarioNombre' => $p->usuario_nombre, 'sucursalNombre' => $p->sucursal_nombre];
        }
        foreach ($ajs as $a) {
            $esDebe = (float) $a->importe >= 0;
            $movs[] = ['kind' => $esDebe ? 'ajuste_debe' : 'ajuste_haber', 'id' => $a->id, 'fecha' => Fila::iso($a->fecha), 'etiqueta' => 'Ajuste '.($esDebe ? 'DEBE' : 'HABER'), 'detalle' => $a->motivo,
                'debe' => $esDebe ? Documentos::money((float) $a->importe) : 0.0, 'haber' => $esDebe ? 0.0 : Documentos::money(-(float) $a->importe)];
        }
        usort($movs, fn ($a, $b) => strcmp((string) $b['fecha'], (string) $a['fecha']) ?: $b['id'] <=> $a['id']);
        $totDebe = Documentos::money(array_sum(array_column($movs, 'debe')));
        $totHaber = Documentos::money(array_sum(array_column($movs, 'haber')));
        $saldo = Documentos::money($totDebe - $totHaber);

        // Antigüedad FIFO: lo cobrado cancela primero lo más viejo; el primer DEBE sin cubrir marca desde cuándo se debe.
        $deudaDesde = null;
        if ($saldo > self::EPS) {
            $cron = $movs;
            usort($cron, fn ($a, $b) => strcmp((string) $a['fecha'], (string) $b['fecha']) ?: $a['id'] <=> $b['id']);
            $haberDisp = $totHaber;
            foreach ($cron as $m) {
                if ($m['debe'] <= self::EPS) {
                    continue;
                }
                if ($haberDisp >= $m['debe'] - self::EPS) {
                    $haberDisp = Documentos::money($haberDisp - $m['debe']);

                    continue;
                }
                $deudaDesde = $m['fecha'];
                break;
            }
        }
        $sumar = fn (callable $pred, string $campo) => Documentos::money(array_sum(array_map(fn ($m) => $pred($m) ? $m[$campo] : 0, $movs)));
        $totales = [
            'mercaderia' => $sumar(fn ($m) => $m['kind'] === 'comprobante', 'debe'), 'notasCredito' => $sumar(fn ($m) => $m['kind'] === 'nc', 'haber'),
            'gastos' => $sumar(fn ($m) => $m['kind'] === 'gasto', 'debe'), 'ajustesDebe' => $sumar(fn ($m) => $m['kind'] === 'ajuste_debe', 'debe'),
            'ajustesHaber' => $sumar(fn ($m) => $m['kind'] === 'ajuste_haber', 'haber'), 'pagos' => $sumar(fn ($m) => $m['kind'] === 'pago', 'haber'),
            'fletes' => $sumar(fn ($m) => $m['kind'] === 'pago' && ! empty($m['esFlete']), 'haber'),
        ];
        $compromisos = $this->baseCompromisos()->where('k.proveedor_id', $proveedorId)->where('k.pagado', false)->orderBy('k.fecha_venc')->get()->map(fn ($k) => $this->mapCompromiso($k))->all();

        return [
            'proveedor' => ['id' => $prov->id, 'nombre' => $prov->nombre, 'cuit' => $prov->cuit, 'modoCuenta' => $prov->modo_cuenta, 'medioHabitual' => $prov->medio_habitual, 'diasPago' => $prov->dias_pago,
                'condicionCompra' => $prov->condicion_compra, 'porcSinFactura' => (float) $prov->porc_sin_factura, 'proveeMercaderia' => (bool) $prov->provee_mercaderia, 'proveeGastos' => (bool) $prov->provee_gastos,
                'telefono' => $prov->telefono, 'email' => $prov->email, 'conciliadoHasta' => Fila::iso($prov->conciliado_hasta), 'conciliadoAt' => Fila::iso($prov->conciliado_at)],
            'movs' => $movs, 'totDebe' => $totDebe, 'totHaber' => $totHaber, 'saldo' => $saldo, 'deudaDesde' => $deudaDesde, 'totales' => $totales,
            'pagosSinAplicar' => Documentos::money($pgs->sum(fn ($p) => (float) $p->importe - (float) $p->aplicado)),
            'docsPendientes' => $this->pagos->documentosPendientes($proveedorId), 'compromisos' => $compromisos,
            'cuentas' => Fila::camelTodos(DB::table('proveedor_cuentas')->where('proveedor_id', $proveedorId)->orderBy('id')->get()),
        ];
    }

    public function crearAjuste(array $d, ?int $usuarioId): array
    {
        if (! DB::table('proveedores')->where('id', (int) ($d['proveedorId'] ?? 0))->exists()) {
            throw new ErrorDeNegocio('Proveedor inválido.');
        }
        $motivo = trim((string) ($d['motivo'] ?? ''));
        if ($motivo === '') {
            throw new ErrorDeNegocio('El motivo del ajuste es obligatorio: sin explicación no se audita.');
        }
        $monto = Documentos::money($d['monto'] ?? 0);
        if ($monto <= 0) {
            throw new ErrorDeNegocio('El monto del ajuste tiene que ser mayor a 0.');
        }
        if (! in_array($d['tipo'] ?? '', ['debe', 'haber'], true)) {
            throw new ErrorDeNegocio('El ajuste es al debe o al haber.');
        }
        $id = DB::table('proveedor_ajustes')->insertGetId([
            'proveedor_id' => (int) $d['proveedorId'], 'importe' => $d['tipo'] === 'haber' ? -$monto : $monto, 'motivo' => mb_substr($motivo, 0, 500),
            'fecha' => Documentos::fecha($d['fecha'] ?? null) ?? now(), 'usuario_id' => $usuarioId, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return Fila::camel(DB::table('proveedor_ajustes')->find($id));
    }

    public function borrarAjuste(int $id): void
    {
        if (! DB::table('proveedor_ajustes')->where('id', $id)->delete()) {
            throw new NotFoundHttpException('Ajuste inexistente.');
        }
    }

    /** "Cuadré con el resumen del proveedor hasta hoy" — con quién y cuándo. */
    public function conciliar(int $proveedorId, int $usuarioId): array
    {
        if (! DB::table('proveedores')->where('id', $proveedorId)->update(['conciliado_hasta' => now(), 'conciliado_por' => $usuarioId, 'conciliado_at' => now()])) {
            throw new NotFoundHttpException('Proveedor inexistente.');
        }

        return ['proveedorId' => $proveedorId, 'conciliadoHasta' => now()->toIso8601String()];
    }

    public function desconciliar(int $proveedorId): array
    {
        DB::table('proveedores')->where('id', $proveedorId)->update(['conciliado_hasta' => null, 'conciliado_por' => null, 'conciliado_at' => null]);

        return ['proveedorId' => $proveedorId, 'conciliadoHasta' => null];
    }
}
