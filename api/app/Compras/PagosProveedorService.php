<?php

namespace App\Compras;

use App\Auth\Operador;
use App\Exceptions\ErrorDeNegocio;
use App\Support\Fila;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * PAGOS A PROVEEDORES — un solo registro para toda la plata que sale.
 *
 * El caso que lo motiva: la cajera de la sucursal le paga $100.000 del cajón
 * al repartidor y NO carga la factura (no le corresponde). Registra el PAGO y
 * sigue vendiendo; el arqueo ya muestra el egreso. Al día siguiente el admin
 * carga la factura y el sistema le ofrece los $100.000 sin aplicar.
 *
 * Reglas que sostienen el circuito:
 *   · la plata sale UNA vez, al crear el pago; imputar no vuelve a mover plata;
 *   · un pago sin imputar no es gasto ni costo: es un crédito contra el proveedor;
 *   · `aplicado` y `pagado` se RECALCULAN sumando imputaciones (nunca deltas);
 *   · el pago solo se imputa a documentos DEL MISMO proveedor.
 *
 * Candados: pago y documento se leen `FOR UPDATE` dentro de la transacción,
 * siempre en ese orden (pago → documento) en las tres que bloquean.
 */
class PagosProveedorService
{
    private const EPS = Documentos::EPS;

    /* ========================== Recálculo ========================== */

    private function recalcularPago(int $pagoId): void
    {
        $t = (float) DB::table('proveedor_imputaciones')->where('pago_id', $pagoId)->sum('importe');
        DB::table('proveedor_pagos')->where('id', $pagoId)->update(['aplicado' => Documentos::money($t)]);
    }

    private function recalcularGasto(int $gastoId): void
    {
        $t = (float) DB::table('proveedor_imputaciones as i')->join('proveedor_pagos as p', 'p.id', '=', 'i.pago_id')
            ->where('i.gasto_id', $gastoId)->where('p.estado', 'activo')->sum('i.importe');
        $pagado = Documentos::money($t);
        $g = DB::table('gastos')->find($gastoId);
        if (! $g) {
            return;
        }
        DB::table('gastos')->where('id', $gastoId)->update([
            'pagado' => $pagado,
            // Un gasto anulado no vuelve a la vida por una imputación.
            'estado' => $g->estado === 'anulado' ? 'anulado' : ($pagado >= Documentos::money((float) $g->total) - self::EPS ? 'pagado' : 'pendiente'),
        ]);
    }

    /** El ajuste que le hicieron sus notas a un comprobante: la ND suma, la NC resta. */
    public function ajusteDe(int $comprobanteId): float
    {
        $r = DB::table('comprobantes')->where('ref_comprobante_id', $comprobanteId)->whereIn('tipo', ['nota_credito', 'nota_debito'])
            ->where('estado', 'confirmado')->selectRaw("coalesce(sum(case when tipo = 'nota_debito' then total else -total end), 0) as t")->value('t');

        return Documentos::money((float) $r);
    }

    private function recalcularComprobante(int $comprobanteId): void
    {
        $t = (float) DB::table('proveedor_imputaciones as i')->join('proveedor_pagos as p', 'p.id', '=', 'i.pago_id')
            ->where('i.comprobante_id', $comprobanteId)->where('p.estado', 'activo')->sum('i.importe');
        DB::table('comprobantes')->where('id', $comprobanteId)->update(['pagado' => Documentos::money($t)]);
    }

    /* ==================== El puente con los COMPROMISOS ==================== */

    /**
     * Factura SALDADA → se cierran sus compromisos pendientes firmados por el
     * pago que la saldó (y sus echeqs pasan a cobrados). Factura CON SALDO → se
     * reabren los compromisos cuyo cerrador ya no está (pago anulado o
     * desaplicado, NC anulada). Una CUOTA cerrada por un pago que sigue
     * aplicado no se toca. Corre DENTRO de la transacción que cambia el saldo.
     */
    public function sincronizarCompromisos(int $comprobanteId, ?int $pagoCerradorId): void
    {
        $comps = DB::table('proveedor_compromisos')->where('comprobante_id', $comprobanteId)->get();
        if ($comps->isEmpty()) {
            return;
        }
        $c = DB::table('comprobantes')->find($comprobanteId);
        if (! $c || $c->estado !== 'confirmado') {
            return;
        }
        $saldo = Documentos::money((float) $c->total + $this->ajusteDe($comprobanteId) - (float) $c->pagado);

        if ($saldo <= self::EPS) {
            foreach ($comps->where('pagado', 0) as $k) {
                DB::table('proveedor_compromisos')->where('id', $k->id)->update(['pagado' => true, 'pago_id' => $pagoCerradorId]);
                DB::table('proveedor_echeqs')->where('compromiso_id', $k->id)->whereIn('estado', ['emitido', 'entregado'])
                    ->update(['estado' => 'cobrado', 'pago_id' => $pagoCerradorId]);
            }

            return;
        }
        $cerrados = $comps->where('pagado', 1);
        if ($cerrados->isEmpty()) {
            return;
        }
        $vivos = DB::table('proveedor_imputaciones as i')->join('proveedor_pagos as p', 'p.id', '=', 'i.pago_id')
            ->where('i.comprobante_id', $comprobanteId)->where('p.estado', 'activo')->pluck('i.pago_id')->map(fn ($x) => (int) $x)->all();
        foreach ($cerrados as $k) {
            if ($k->pago_id !== null && in_array((int) $k->pago_id, $vivos, true)) {
                continue; // cuota pagada de verdad
            }
            DB::table('proveedor_compromisos')->where('id', $k->id)->update(['pagado' => false, 'pago_id' => null]);
            DB::table('proveedor_echeqs')->where('compromiso_id', $k->id)->where('estado', 'cobrado')->update(['estado' => 'emitido', 'pago_id' => null]);
        }
    }

    /** El puente con transacción propia: lo llama Comprobantes cuando una NC/ND cambia el saldo de la factura. */
    public function sincronizarComprobante(int $comprobanteId): void
    {
        DB::transaction(fn () => $this->sincronizarCompromisos($comprobanteId, null));
    }

    /* ============================ Lectura ============================ */

    private function base()
    {
        return DB::table('proveedor_pagos as p')->leftJoin('proveedores as pr', 'pr.id', '=', 'p.proveedor_id')
            ->leftJoin('sucursales as s', 's.id', '=', 'p.sucursal_id')->leftJoin('usuarios as u', 'u.id', '=', 'p.usuario_id')
            ->select('p.*', DB::raw("coalesce(pr.nombre, 'Sin proveedor') as proveedor_nombre"), DB::raw("coalesce(s.nombre, '') as sucursal_nombre"), DB::raw("coalesce(u.nombre, '') as usuario_nombre"));
    }

    private function mapear(object $p, array $destinos = [], array $formas = []): array
    {
        return [...Fila::camel($p), 'saldo' => Documentos::money((float) $p->importe - (float) $p->aplicado), 'imputadoA' => $destinos, 'formas' => $formas];
    }

    public function listar(array $q = []): array
    {
        $qb = $this->base();
        if (! empty($q['proveedorId'])) {
            $qb->where('p.proveedor_id', (int) $q['proveedorId']);
        }
        if (! empty($q['sucursalId'])) {
            $qb->where('p.sucursal_id', (int) $q['sucursalId']);
        }
        if (! empty($q['cajaSesionId'])) {
            $qb->where('p.caja_sesion_id', (int) $q['cajaSesionId']);
        }
        if (! empty($q['destino'])) {
            $qb->where('p.destino', $q['destino']);
        }
        if (! empty($q['estado'])) {
            $qb->where('p.estado', $q['estado']);
        }
        if ($d = Documentos::fecha($q['desde'] ?? null)) {
            $qb->where('p.fecha', '>=', $d);
        }
        if ($h = Documentos::finDeDia($q['hasta'] ?? null)) {
            $qb->where('p.fecha', '<=', $h);
        }
        if (filter_var($q['esFlete'] ?? false, FILTER_VALIDATE_BOOL)) {
            $qb->where('p.es_flete', true);
        }
        if (filter_var($q['sinAplicar'] ?? false, FILTER_VALIDATE_BOOL)) {
            $qb->where('p.estado', 'activo')->whereRaw('p.importe - p.aplicado > ?', [self::EPS]);
        }
        $limit = min(max((int) ($q['limit'] ?? 300), 1), 1000);
        $filas = $qb->orderByDesc('p.fecha')->orderByDesc('p.id')->limit($limit)->get();
        if ($filas->isEmpty()) {
            return [];
        }
        $ids = $filas->pluck('id')->all();
        $destinos = $this->destinosDe($ids);
        $formas = $this->formasDe($ids);

        return $filas->map(fn ($p) => $this->mapear($p, $destinos[$p->id] ?? [], $formas[$p->id] ?? []))->all();
    }

    /** `[pagoId => [{medio, importe, fecha}]]` — el split multi-forma. */
    private function formasDe(array $ids): array
    {
        $out = [];
        foreach (DB::table('pago_formas')->whereIn('pago_id', $ids)->orderBy('id')->get() as $f) {
            $out[$f->pago_id][] = ['medio' => $f->medio, 'importe' => (float) $f->importe, 'fecha' => Fila::iso($f->fecha)];
        }

        return $out;
    }

    /** `[pagoId => [{etiqueta, importe}]]`: a qué documento fue cada pago. */
    private function destinosDe(array $ids): array
    {
        $out = [];
        $filas = DB::table('proveedor_imputaciones as i')->leftJoin('gastos as g', 'g.id', '=', 'i.gasto_id')->leftJoin('comprobantes as c', 'c.id', '=', 'i.comprobante_id')
            ->whereIn('i.pago_id', $ids)->orderBy('i.id')
            ->get(['i.id as imputacion_id', 'i.pago_id', 'i.importe', 'i.gasto_id', 'g.numero as gasto_numero', 'i.comprobante_id', 'c.tipo', 'c.letra', 'c.punto_venta', 'c.numero']);
        foreach ($filas as $f) {
            $etiqueta = $f->gasto_id
                ? 'Gasto #'.$f->gasto_id.($f->gasto_numero ? ' · '.$f->gasto_numero : '')
                : Documentos::etiqueta(['tipo' => $f->tipo, 'letra' => $f->letra, 'punto_venta' => $f->punto_venta, 'numero' => $f->numero, 'id' => $f->comprobante_id]);
            $out[$f->pago_id][] = ['imputacionId' => $f->imputacion_id, 'etiqueta' => $etiqueta, 'importe' => (float) $f->importe, 'gastoId' => $f->gasto_id, 'comprobanteId' => $f->comprobante_id];
        }

        return $out;
    }

    public function get(int $id): array
    {
        $p = $this->base()->where('p.id', $id)->first();
        if (! $p) {
            throw new NotFoundHttpException('Pago inexistente.');
        }

        return [...$this->mapear($p, [], $this->formasDe([$id])[$id] ?? []), 'imputaciones' => $this->imputacionesDe($id)];
    }

    private function imputacionesDe(int $pagoId): array
    {
        $filas = DB::table('proveedor_imputaciones as i')->leftJoin('gastos as g', 'g.id', '=', 'i.gasto_id')->leftJoin('comprobantes as c', 'c.id', '=', 'i.comprobante_id')
            ->where('i.pago_id', $pagoId)->orderBy('i.id')
            ->get(['i.id', 'i.importe', 'i.fecha', 'i.gasto_id', 'i.comprobante_id', 'g.descripcion as gasto_descripcion', 'g.numero as gasto_numero', 'c.tipo', 'c.letra', 'c.punto_venta', 'c.numero']);

        return $filas->map(fn ($f) => [
            'id' => $f->id, 'importe' => (float) $f->importe, 'fecha' => Fila::iso($f->fecha),
            'tipo' => $f->gasto_id ? 'gasto' : 'comprobante', 'docId' => $f->gasto_id ?? $f->comprobante_id,
            'etiqueta' => $f->gasto_id
                ? 'Gasto #'.$f->gasto_id.($f->gasto_numero ? ' · '.$f->gasto_numero : '').($f->gasto_descripcion ? ' · '.$f->gasto_descripcion : '')
                : Documentos::etiqueta(['tipo' => $f->tipo, 'letra' => $f->letra, 'punto_venta' => $f->punto_venta, 'numero' => $f->numero, 'id' => $f->comprobante_id]),
        ])->all();
    }

    /** Pagos de un proveedor con saldo sin aplicar: lo que se puede usar hoy. */
    public function disponibles(int $proveedorId, ?string $destino = null): array
    {
        return $this->listar(['proveedorId' => $proveedorId, 'destino' => $destino, 'sinAplicar' => true, 'limit' => 200]);
    }

    /**
     * Documentos del proveedor que todavía deben plata: gastos y facturas,
     * liquidaciones o ND de compra. El saldo de la factura DESCUENTA sus notas.
     * La ND que referencia una factura no se lista aparte: su importe ya está
     * en el saldo de esa factura.
     */
    public function documentosPendientes(int $proveedorId, ?string $destino = null): array
    {
        $out = [];
        if ($destino !== 'mercaderia') {
            $gs = DB::table('gastos')->where('proveedor_id', $proveedorId)->where('estado', '!=', 'anulado')->whereRaw('total - pagado > ?', [self::EPS])->orderBy('fecha')->get();
            foreach ($gs as $g) {
                $out[] = ['tipo' => 'gasto', 'docId' => $g->id, 'fecha' => Fila::iso($g->fecha), 'vencimiento' => Fila::iso($g->vencimiento),
                    'etiqueta' => 'Gasto #'.$g->id.($g->numero ? ' · '.$g->numero : ''), 'detalle' => $g->descripcion, 'total' => (float) $g->total,
                    'pagado' => (float) $g->pagado, 'ajuste' => 0.0, 'saldo' => Documentos::money((float) $g->total - (float) $g->pagado)];
            }
        }
        if ($destino !== 'gastos') {
            $cs = DB::table('comprobantes')->where('proveedor_id', $proveedorId)->where('estado', 'confirmado')->whereIn('tipo', Documentos::GENERAN_DEUDA)
                ->where(fn ($w) => $w->where('tipo', '!=', 'nota_debito')->orWhereNull('ref_comprobante_id'))->orderBy('fecha')->get();
            $ajustes = [];
            if ($cs->isNotEmpty()) {
                $notas = DB::table('comprobantes')->whereIn('ref_comprobante_id', $cs->pluck('id'))->whereIn('tipo', ['nota_credito', 'nota_debito'])->where('estado', 'confirmado')->get(['ref_comprobante_id', 'tipo', 'total']);
                foreach ($notas as $n) {
                    $ajustes[$n->ref_comprobante_id] = Documentos::money(($ajustes[$n->ref_comprobante_id] ?? 0) + ($n->tipo === 'nota_debito' ? 1 : -1) * (float) $n->total);
                }
            }
            foreach ($cs as $c) {
                $aj = $ajustes[$c->id] ?? 0.0;
                $saldo = Documentos::money((float) $c->total + $aj - (float) $c->pagado);
                if ($saldo <= self::EPS) {
                    continue;
                }
                $out[] = ['tipo' => 'comprobante', 'docId' => $c->id, 'fecha' => Fila::iso($c->fecha), 'vencimiento' => Fila::iso($c->vencimiento_pago),
                    'etiqueta' => Documentos::etiqueta($c), 'detalle' => $c->observaciones ?? '', 'total' => (float) $c->total, 'pagado' => (float) $c->pagado,
                    'ajuste' => $aj, 'saldo' => $saldo];
            }
        }
        usort($out, fn ($a, $b) => strcmp((string) $a['fecha'], (string) $b['fecha']));

        return $out;
    }

    /** Cuenta corriente REAL del proveedor: mercadería + gastos − pagos. */
    public function cuenta(int $proveedorId): array
    {
        $merc = (float) DB::table('comprobantes')->where('proveedor_id', $proveedorId)->where('estado', 'confirmado')
            ->selectRaw("coalesce(sum(case when tipo in ('factura','liquidacion','nota_debito') then total when tipo = 'nota_credito' then -total else 0 end), 0) as t")->value('t');
        $gas = (float) DB::table('gastos')->where('proveedor_id', $proveedorId)->where('estado', '!=', 'anulado')->sum('total');
        $pag = DB::table('proveedor_pagos')->where('proveedor_id', $proveedorId)->where('estado', 'activo')
            ->selectRaw('coalesce(sum(importe),0) as pagado, coalesce(sum(importe - aplicado),0) as sin_aplicar')->first();
        $mercaderia = Documentos::money($merc);
        $gastos = Documentos::money($gas);
        $pagado = Documentos::money((float) $pag->pagado);

        return ['proveedorId' => $proveedorId, 'mercaderia' => $mercaderia, 'gastos' => $gastos, 'comprado' => Documentos::money($mercaderia + $gastos),
            'pagado' => $pagado, 'saldo' => Documentos::money($mercaderia + $gastos - $pagado), 'sinAplicar' => Documentos::money((float) $pag->sin_aplicar)];
    }

    /** Contador liviano: cuánta plata está sin rendir. */
    public function resumenSinAplicar(?string $destino = null): array
    {
        $qb = DB::table('proveedor_pagos')->where('estado', 'activo')->whereRaw('importe - aplicado > ?', [self::EPS]);
        if (in_array($destino, ['mercaderia', 'gastos'], true)) {
            $qb->where('destino', $destino);
        }
        $r = $qb->selectRaw('count(*) as n, coalesce(sum(importe - aplicado),0) as t')->first();

        return ['cantidad' => (int) $r->n, 'total' => Documentos::money((float) $r->t)];
    }

    /* ============================ Escritura ============================ */

    /**
     * @param  array  $dto  proveedorId?, destino?, importe, medio?, fecha?, concepto?, referencia?, esFlete?, sucursalId?, cajaSesionId?, usuarioId?, operadorId?, observaciones?, imputaciones?, formas?, fletes?
     * @param  int  $sucursalSesion  la sucursal con la que se logueó quien pide: el turno de caja tiene que ser de ella
     * @param  bool  $cruzaSucursales  el jefe puede imputar a documentos de otra sucursal
     * @param  bool  $enAltaComprobante  solo lo pone Comprobantes: ahí el total ya se validó completo y el candado "por facturas" no corresponde
     */
    public function crear(array $dto, int $sucursalSesion, bool $cruzaSucursales = false, bool $enAltaComprobante = false): array
    {
        $importe = Documentos::money($dto['importe'] ?? 0);
        if ($importe <= 0) {
            throw new ErrorDeNegocio('El importe del pago tiene que ser mayor a 0.');
        }
        $usuarioId = ! empty($dto['usuarioId']) ? Operador::resolver($dto['operadorId'] ?? null, (int) $dto['usuarioId']) : null;

        $prov = null;
        if (! empty($dto['proveedorId'])) {
            $prov = DB::table('proveedores')->find((int) $dto['proveedorId']);
            if (! $prov) {
                throw new ErrorDeNegocio('Proveedor inválido.');
            }
        }
        $imputaciones = $dto['imputaciones'] ?? [];
        if (! $prov && ! $imputaciones) {
            throw new ErrorDeNegocio('Elegí el proveedor: un pago a cuenta necesita saber a quién se le pagó para poder aplicarlo después.');
        }
        $provSoloGastos = $prov && $prov->provee_gastos && ! $prov->provee_mercaderia;
        $destino = $dto['destino'] ?? (collect($imputaciones)->contains(fn ($x) => ! empty($x['gastoId'])) ? 'gastos'
            : (collect($imputaciones)->contains(fn ($x) => ! empty($x['comprobanteId'])) ? 'mercaderia' : (($provSoloGastos || ! $prov) ? 'gastos' : 'mercaderia')));
        if (! in_array($destino, ['mercaderia', 'gastos'], true)) {
            throw new ErrorDeNegocio('Destino inválido: mercadería o gastos.');
        }

        $esFlete = ! empty($dto['esFlete']);
        if ($esFlete && $destino !== 'mercaderia') {
            throw new ErrorDeNegocio('El flete que el proveedor descuenta se registra contra su cuenta de MERCADERÍA. Si es un flete propio que nadie te reintegra, va como gasto.');
        }
        if ($esFlete && ! $prov) {
            throw new ErrorDeNegocio('Elegí el proveedor: el flete se descuenta de la factura de alguien.');
        }
        $concepto = trim((string) ($dto['concepto'] ?? '')) ?: ($esFlete ? 'Flete de la entrega' : '');

        $formas = [];
        foreach ($dto['formas'] ?? [] as $f) {
            if (! in_array($f['medio'] ?? '', Documentos::MEDIOS, true)) {
                throw new ErrorDeNegocio('Medio de pago inválido en una de las partes.');
            }
            $fi = Documentos::money($f['importe'] ?? 0);
            if ($fi <= 0) {
                throw new ErrorDeNegocio('Cada parte del pago tiene que ser mayor a 0.');
            }
            $formas[] = ['medio' => $f['medio'], 'importe' => $fi, 'fecha' => Documentos::fecha($f['fecha'] ?? null)];
        }
        if ($formas) {
            $suma = Documentos::money(array_sum(array_column($formas, 'importe')));
            if (abs($suma - $importe) > self::EPS) {
                throw new ErrorDeNegocio('Las partes del pago suman '.number_format($suma, 2, '.', '').' pero el pago dice '.number_format($importe, 2, '.', '').': tienen que coincidir.');
            }
        }
        $medio = $formas[0]['medio'] ?? ($dto['medio'] ?? 'efectivo');
        if (! in_array($medio, Documentos::MEDIOS, true)) {
            throw new ErrorDeNegocio('Medio de pago inválido.');
        }
        // Lo que sale del CAJÓN: la parte en efectivo del split, o todo si es simple y en efectivo.
        $importeEfectivo = $formas
            ? Documentos::money(array_sum(array_map(fn ($f) => $f['medio'] === 'efectivo' ? $f['importe'] : 0, $formas)))
            : ($medio === 'efectivo' ? $importe : 0.0);
        $fecha = Documentos::fecha($dto['fecha'] ?? null) ?? now();

        $id = DB::transaction(function () use ($dto, $prov, $importe, $importeEfectivo, $formas, $medio, $destino, $esFlete, $concepto, $fecha, $usuarioId, $sucursalSesion, $cruzaSucursales, $enAltaComprobante, $imputaciones) {
            $cajaMovimientoId = null;
            $cajaSesionId = null;
            $sucursalId = ! empty($dto['sucursalId']) ? (int) $dto['sucursalId'] : null;

            if ($importeEfectivo > self::EPS && ! empty($dto['cajaSesionId'])) {
                // Con candado contra el CIERRE: o el cierre cuenta este egreso, o el pago se rechaza porque el turno ya cerró.
                $sesion = DB::table('caja_sesiones')->where('id', (int) $dto['cajaSesionId'])->lockForUpdate()->first();
                if (! $sesion) {
                    throw new ErrorDeNegocio('Turno de caja inexistente.');
                }
                if ($sesion->estado !== 'abierta') {
                    throw new ErrorDeNegocio('Ese turno de caja está cerrado: no se le pueden cargar egresos.');
                }
                // El turno tiene que ser el de la sucursal con la que se logueó quien pide.
                if ((int) $sesion->sucursal_id !== $sucursalSesion) {
                    throw new AccessDeniedHttpException('Ese turno de caja es de otra sucursal. El egreso en efectivo sale del cajón de la sucursal con la que entraste.');
                }
                if ($sucursalId !== null && $sucursalId !== (int) $sesion->sucursal_id) {
                    throw new ErrorDeNegocio('Ese turno de caja es de otra sucursal: el egreso sale del cajón donde está abierto el turno.');
                }
                $sucursalId = (int) $sesion->sucursal_id;
                $cajaMovimientoId = DB::table('caja_movimientos')->insertGetId([
                    'caja_sesion_id' => $sesion->id, 'fecha' => now(), 'tipo' => 'egreso', 'importe' => $importeEfectivo,
                    'motivo' => mb_substr(($esFlete ? 'Flete a cuenta del proveedor' : 'Pago a proveedor').($prov ? ' · '.$prov->nombre : '').($concepto ? ' · '.$concepto : '')
                        .($formas && $importeEfectivo < $importe - self::EPS ? ' · efectivo de un pago mixto de '.number_format($importe, 2, '.', '') : ''), 0, 200),
                    'usuario_id' => $usuarioId,
                ]);
                $cajaSesionId = (int) $sesion->id;
            }

            $pagoId = DB::table('proveedor_pagos')->insertGetId([
                'fecha' => $fecha, 'proveedor_id' => $prov?->id, 'medio' => $medio, 'destino' => $destino, 'importe' => $importe, 'aplicado' => 0,
                'es_flete' => $esFlete, 'concepto' => mb_substr($concepto, 0, 300), 'referencia' => mb_substr(trim((string) ($dto['referencia'] ?? '')), 0, 200),
                'sucursal_id' => $sucursalId, 'caja_sesion_id' => $cajaSesionId, 'caja_movimiento_id' => $cajaMovimientoId, 'usuario_id' => $usuarioId,
                'estado' => 'activo', 'observaciones' => trim((string) ($dto['observaciones'] ?? '')), 'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($formas) {
                DB::table('pago_formas')->insert(array_map(fn ($f) => ['pago_id' => $pagoId, 'medio' => $f['medio'], 'importe' => $f['importe'], 'fecha' => $f['fecha']], $formas));
            }
            // Los fletes se aplican PRIMERO: bajan el saldo del documento para que el pago nuevo caiga por el saldo exacto.
            $this->aplicarFletes($dto['fletes'] ?? [], $prov?->id, $usuarioId, $cruzaSucursales);
            if ($imputaciones) {
                $this->aplicar($pagoId, $imputaciones, $usuarioId, $cruzaSucursales, $enAltaComprobante);
            }

            return $pagoId;
        });

        return $this->get($id);
    }

    /** Descontar fletes YA pagados contra los documentos que se están pagando. No mueve plata nueva. */
    private function aplicarFletes(array $fletes, ?int $proveedorId, ?int $usuarioId, bool $cruzaSucursales): void
    {
        foreach ($fletes as $f) {
            $fp = DB::table('proveedor_pagos')->find((int) ($f['pagoId'] ?? 0));
            if (! $fp) {
                throw new ErrorDeNegocio('El flete que se quiere descontar no existe.');
            }
            if (! $fp->es_flete) {
                throw new ErrorDeNegocio('Ese pago no está marcado como flete: los pagos comunes se aplican desde el documento, no descontándolos de otro pago.');
            }
            if (! $proveedorId || (int) $fp->proveedor_id !== $proveedorId) {
                throw new ErrorDeNegocio('Ese flete es de otro proveedor: no se puede descontar acá.');
            }
            $this->aplicar((int) $fp->id, [['gastoId' => $f['gastoId'] ?? null, 'comprobanteId' => $f['comprobanteId'] ?? null, 'importe' => $f['importe'] ?? 0]], $usuarioId, $cruzaSucursales);
        }
    }

    /** Solo fletes, sin pago nuevo (lo adelantado cubre el documento entero). */
    public function descontarFletes(int $proveedorId, array $fletes, ?int $usuarioId, bool $cruzaSucursales): array
    {
        if (! $fletes) {
            throw new ErrorDeNegocio('No indicaste ningún flete a descontar.');
        }
        DB::transaction(fn () => $this->aplicarFletes($fletes, $proveedorId, $usuarioId, $cruzaSucursales));

        return ['ok' => true, 'descontados' => count($fletes)];
    }

    /**
     * Aplica un pago a uno o varios documentos, validando contra el saldo VIVO
     * (con candado) del pago y del documento. Corre DENTRO de una transacción.
     */
    private function aplicar(int $pagoId, array $items, ?int $usuarioId, bool $cruzaSucursales, bool $enAltaComprobante = false): void
    {
        foreach ($items as $item) {
            $importe = Documentos::money($item['importe'] ?? 0);
            $gastoId = (int) ($item['gastoId'] ?? 0) ?: null;
            $comprobanteId = (int) ($item['comprobanteId'] ?? 0) ?: null;
            if ($importe <= 0) {
                throw new ErrorDeNegocio('El importe a aplicar tiene que ser mayor a 0.');
            }
            if (! $gastoId && ! $comprobanteId) {
                throw new ErrorDeNegocio('Indicá a qué documento se aplica.');
            }
            if ($gastoId && $comprobanteId) {
                throw new ErrorDeNegocio('Una imputación va a un solo documento.');
            }
            // Candado 1 de 2: el pago.
            $pago = DB::table('proveedor_pagos')->where('id', $pagoId)->lockForUpdate()->first();
            if (! $pago) {
                throw new NotFoundHttpException('Pago inexistente.');
            }
            if ($pago->estado !== 'activo') {
                throw new ErrorDeNegocio('El pago está anulado.');
            }
            $saldoPago = Documentos::money((float) $pago->importe - (float) $pago->aplicado);
            if ($importe - $saldoPago > self::EPS) {
                throw new ErrorDeNegocio('El pago solo tiene '.number_format($saldoPago, 2, '.', '').' sin aplicar.');
            }
            if ($gastoId && $pago->destino !== 'gastos') {
                throw new ErrorDeNegocio('Ese pago se registró para MERCADERÍA: solo se aplica a facturas de compra. Si el tipo está mal, corregí el destino del pago.');
            }
            if ($comprobanteId && $pago->destino !== 'mercaderia') {
                throw new ErrorDeNegocio('Ese pago se registró para GASTOS: solo se aplica a gastos. Si el tipo está mal, corregí el destino del pago.');
            }

            // Candado 2 de 2: el documento.
            if ($gastoId) {
                $g = DB::table('gastos')->where('id', $gastoId)->lockForUpdate()->first();
                if (! $g) {
                    throw new ErrorDeNegocio('Gasto inexistente.');
                }
                if ($g->estado === 'anulado') {
                    throw new ErrorDeNegocio('Ese gasto está anulado.');
                }
                $docProveedorId = $g->proveedor_id ? (int) $g->proveedor_id : null;
                $docSucursalId = $g->sucursal_id ? (int) $g->sucursal_id : null;
                $saldoDoc = Documentos::money((float) $g->total - (float) $g->pagado);
                $etiqueta = 'gasto #'.$g->id;
            } else {
                $c = DB::table('comprobantes')->where('id', $comprobanteId)->lockForUpdate()->first();
                if (! $c) {
                    throw new ErrorDeNegocio('Comprobante inexistente.');
                }
                if ($c->estado !== 'confirmado') {
                    throw new ErrorDeNegocio('Ese comprobante no está confirmado.');
                }
                if ($c->tipo === 'nota_credito') {
                    throw new ErrorDeNegocio('Una nota de crédito no se paga: descuenta deuda.');
                }
                if (! Documentos::generaDeuda($c->tipo)) {
                    throw new ErrorDeNegocio('Un documento de tipo '.(Documentos::ABREV_TIPO[$c->tipo] ?? $c->tipo).' no genera deuda: solo se pagan facturas, liquidaciones y notas de débito.');
                }
                $docProveedorId = (int) $c->proveedor_id;
                $docSucursalId = $c->sucursal_id ? (int) $c->sucursal_id : null;
                $etiqueta = Documentos::etiqueta($c);
                $saldoDoc = Documentos::money((float) $c->total + $this->ajusteDe((int) $c->id) - (float) $c->pagado);
                if ($c->tipo === 'nota_debito' && $c->ref_comprobante_id) {
                    throw new ErrorDeNegocio($etiqueta.' ajusta a otra factura: se paga dentro del saldo de esa factura, no por separado.');
                }
                /*
                 * EL MODO DE CUENTA: en 'facturas' la factura se paga COMPLETA (o por
                 * una cuota pactada). Exentos: el flete y el alta del comprobante
                 * (ahí el total ya se validó completo por otra vía).
                 */
                $exento = $pago->es_flete || $enAltaComprobante;
                if (! $exento && $pago->proveedor_id && abs($importe - $saldoDoc) > self::EPS) {
                    $modo = DB::table('proveedores')->where('id', $pago->proveedor_id)->value('modo_cuenta');
                    if ($modo === 'facturas') {
                        $cuotas = DB::table('proveedor_compromisos')->where('comprobante_id', $c->id)->where('pagado', false)->pluck('importe');
                        $esCuota = $cuotas->contains(fn ($q) => abs(Documentos::money((float) $q) - $importe) <= self::EPS);
                        if (! $esCuota) {
                            throw new ErrorDeNegocio($etiqueta.' se paga por su saldo completo ('.number_format($saldoDoc, 2, '.', '').') o por una cuota pactada: el proveedor está en modo "por facturas". Para pagos parciales a cuenta, pasalo a modo "libre" en su ficha.');
                        }
                    }
                }
            }
            $pagoProv = $pago->proveedor_id ? (int) $pago->proveedor_id : null;
            if ($pagoProv !== $docProveedorId) {
                throw new ErrorDeNegocio('Ese pago es de otro proveedor: no se puede aplicar a '.$etiqueta.'.');
            }
            // Ni a la de otra sucursal (tapa faltantes moviendo egresos de cajón). Null no restringe; el jefe cruza.
            if (! $cruzaSucursales && $pago->sucursal_id !== null && $docSucursalId !== null && (int) $pago->sucursal_id !== $docSucursalId) {
                throw new ErrorDeNegocio('Ese pago se registró en otra sucursal: no se puede aplicar a '.$etiqueta.', que es de otra. Si está mal cargado, lo corrige un administrador.');
            }
            if ($saldoDoc <= self::EPS) {
                throw new ErrorDeNegocio($etiqueta.' ya está saldado.');
            }
            if ($importe - $saldoDoc > self::EPS) {
                throw new ErrorDeNegocio('A '.$etiqueta.' le faltan '.number_format($saldoDoc, 2, '.', '').': no se le puede aplicar más.');
            }
            DB::table('proveedor_imputaciones')->insert(['pago_id' => $pagoId, 'gasto_id' => $gastoId, 'comprobante_id' => $comprobanteId, 'importe' => $importe, 'fecha' => now(), 'usuario_id' => $usuarioId]);
            $this->recalcularPago($pagoId);
            if ($gastoId) {
                $this->recalcularGasto($gastoId);
            } else {
                $this->recalcularComprobante($comprobanteId);
                $this->sincronizarCompromisos($comprobanteId, $pagoId);
            }
        }
    }

    public function imputar(int $pagoId, array $imputaciones, ?int $usuarioId, bool $cruzaSucursales = false, bool $enAltaComprobante = false): array
    {
        if (! $imputaciones) {
            throw new ErrorDeNegocio('No indicaste ninguna imputación.');
        }
        $p = DB::table('proveedor_pagos')->find($pagoId);
        if (! $p) {
            throw new NotFoundHttpException('Pago inexistente.');
        }
        if (! $p->proveedor_id) {
            throw new ErrorDeNegocio('Ese pago se registró sin proveedor: solo vale para el documento con el que nació.');
        }
        DB::transaction(fn () => $this->aplicar($pagoId, $imputaciones, $usuarioId, $cruzaSucursales, $enAltaComprobante));

        return $this->get($pagoId);
    }

    /**
     * Desaplicar: el pago vuelve a la bandeja de "sin aplicar". No mueve plata.
     * Un pago SIN proveedor nació pegado a su documento: desaplicarlo equivale
     * a anularlo entero (y ahí sí manda la regla de la caja).
     */
    public function desimputar(int $imputacionId): array
    {
        $pagoId = DB::transaction(function () use ($imputacionId) {
            $imp = DB::table('proveedor_imputaciones')->find($imputacionId);
            if (! $imp) {
                throw new NotFoundHttpException('Imputación inexistente.');
            }
            $pago = DB::table('proveedor_pagos')->where('id', $imp->pago_id)->lockForUpdate()->first();
            if ($pago && ! $pago->proveedor_id) {
                $this->quitarEgresoDeCaja($pago);
                DB::table('proveedor_pagos')->where('id', $pago->id)->update(['estado' => 'anulado', 'caja_movimiento_id' => null]);
            }
            if ($imp->gasto_id) {
                DB::table('gastos')->where('id', $imp->gasto_id)->lockForUpdate()->first();
            }
            if ($imp->comprobante_id) {
                DB::table('comprobantes')->where('id', $imp->comprobante_id)->lockForUpdate()->first();
            }
            DB::table('proveedor_imputaciones')->where('id', $imputacionId)->delete();
            $this->recalcularPago((int) $imp->pago_id);
            if ($imp->gasto_id) {
                $this->recalcularGasto((int) $imp->gasto_id);
            }
            if ($imp->comprobante_id) {
                $this->recalcularComprobante((int) $imp->comprobante_id);
                $this->sincronizarCompromisos((int) $imp->comprobante_id, null);
            }

            return (int) $imp->pago_id;
        });

        return $this->get($pagoId);
    }

    /** El egreso que este pago generó en la caja: se quita solo si el turno sigue abierto. */
    private function quitarEgresoDeCaja(object $pago): void
    {
        if (! $pago->caja_movimiento_id) {
            return;
        }
        $sesion = DB::table('caja_sesiones')->where('id', $pago->caja_sesion_id)->lockForUpdate()->first();
        if ($sesion && $sesion->estado !== 'abierta') {
            throw new ErrorDeNegocio('Ese pago salió de un turno de caja ya cerrado: quitarlo rompería el arqueo. Registrá el reintegro como ingreso de caja del turno actual.');
        }
        DB::table('caja_movimientos')->where('id', $pago->caja_movimiento_id)->delete();
    }

    /** Corregir el destino, solo mientras no tenga nada aplicado. */
    public function cambiarDestino(int $id, string $destino): array
    {
        if (! in_array($destino, ['mercaderia', 'gastos'], true)) {
            throw new ErrorDeNegocio('Destino inválido: mercadería o gastos.');
        }
        DB::transaction(function () use ($id, $destino) {
            $p = DB::table('proveedor_pagos')->where('id', $id)->lockForUpdate()->first();
            if (! $p) {
                throw new NotFoundHttpException('Pago inexistente.');
            }
            if ($p->estado !== 'activo') {
                throw new ErrorDeNegocio('El pago está anulado.');
            }
            if ((float) $p->aplicado > self::EPS) {
                throw new ErrorDeNegocio('El pago ya tiene documentos aplicados: quitá las aplicaciones antes de moverlo de bandeja.');
            }
            DB::table('proveedor_pagos')->where('id', $id)->update(['destino' => $destino, 'updated_at' => now()]);
        });

        return $this->get($id);
    }

    /** El papel del pago (referencia y concepto): no toca un peso, así que se permite con el turno cerrado. */
    public function actualizarPapel(int $id, array $dto): array
    {
        $p = DB::table('proveedor_pagos')->find($id);
        if (! $p) {
            throw new NotFoundHttpException('Pago inexistente.');
        }
        if ($p->estado !== 'activo') {
            throw new ErrorDeNegocio('El pago está anulado: no se le cambian los datos.');
        }
        $set = [];
        if (array_key_exists('referencia', $dto)) {
            $set['referencia'] = mb_substr(trim((string) $dto['referencia']), 0, 200);
        }
        if (array_key_exists('concepto', $dto)) {
            $set['concepto'] = mb_substr(trim((string) $dto['concepto']), 0, 300);
        }
        if ($set) {
            DB::table('proveedor_pagos')->where('id', $id)->update([...$set, 'updated_at' => now()]);
        }

        return $this->get($id);
    }

    /** Anular: sin imputaciones vivas, y si salió de un turno YA CERRADO no se puede. */
    public function anular(int $id, ?string $motivo = null): array
    {
        DB::transaction(function () use ($id, $motivo) {
            $p = DB::table('proveedor_pagos')->where('id', $id)->lockForUpdate()->first();
            if (! $p) {
                throw new NotFoundHttpException('Pago inexistente.');
            }
            if ($p->estado === 'anulado') {
                throw new ErrorDeNegocio('Ese pago ya está anulado.');
            }
            if ((float) $p->aplicado > self::EPS) {
                throw new ErrorDeNegocio('El pago está aplicado a un documento: desaplicalo antes de anularlo.');
            }
            $this->quitarEgresoDeCaja($p);
            $nota = trim((string) $motivo);
            DB::table('proveedor_pagos')->where('id', $id)->update([
                'estado' => 'anulado', 'caja_movimiento_id' => null, 'updated_at' => now(),
                'observaciones' => $nota ? trim(($p->observaciones ? $p->observaciones."\n" : '').'Anulado: '.$nota) : $p->observaciones,
            ]);
            // Los compromisos manuales que cerró este pago se reabren; el echeq cobrado vuelve a emitido.
            DB::table('proveedor_compromisos')->where('pago_id', $id)->update(['pagado' => false, 'pago_id' => null]);
            DB::table('proveedor_echeqs')->where('pago_id', $id)->where('estado', 'cobrado')->update(['estado' => 'emitido', 'pago_id' => null]);
        });

        return $this->get($id);
    }

    /** Pagos imputados a un documento, con los datos del pago que los originó. */
    public function pagosDe(?int $gastoId = null, ?int $comprobanteId = null): array
    {
        $qb = DB::table('proveedor_imputaciones as i')->join('proveedor_pagos as p', 'p.id', '=', 'i.pago_id')
            ->leftJoin('sucursales as s', 's.id', '=', 'p.sucursal_id')->leftJoin('usuarios as u', 'u.id', '=', 'p.usuario_id');
        $qb = $gastoId ? $qb->where('i.gasto_id', $gastoId) : $qb->where('i.comprobante_id', $comprobanteId);

        return $qb->orderBy('i.id')->get(['i.id as imputacion_id', 'i.importe', 'p.fecha', 'p.id as pago_id', 'p.medio', 'p.es_flete', 'p.concepto', 'p.referencia', 'p.caja_sesion_id', 'p.sucursal_id', 'p.estado',
            DB::raw("coalesce(s.nombre,'') as sucursal_nombre"), DB::raw("coalesce(u.nombre,'') as usuario_nombre")])
            ->map(fn ($f) => Fila::camel($f))->all();
    }
}
