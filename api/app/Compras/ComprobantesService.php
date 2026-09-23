<?php

namespace App\Compras;

use App\Exceptions\ErrorDeNegocio;
use App\Inventario\OperacionesService;
use App\Services\HistorialPreciosService;
use App\Services\PreciosService;
use App\Support\Fila;
use App\Support\Iva;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * COMPROBANTES DE COMPRA — lo que el proveedor emite (ver `Documentos` por
 * los tipos y sus tres preguntas).
 *
 * El pie de la factura, en el orden en que lo lee el papel: los renglones dan
 * el bruto, la bonificación general lo baja, el IVA se calcula sobre el neto
 * YA bonificado y las percepciones se suman al final (no son IVA: son pago a
 * cuenta de otro impuesto). Vive en `armarPie()`, compartido por el alta y la
 * conversión del remito: el mismo papel da el mismo total entre por donde entre.
 *
 * Una NC o ND nace de UNA factura (`ref_comprobante_id`): sin eso la NC solo
 * restaba de la deuda total y la factura seguía ofreciendo su importe entero
 * para pagar. Con la referencia, cada factura tiene su saldo REAL.
 */
class ComprobantesService
{
    private const EPS = Documentos::EPS;

    public function __construct(
        private readonly OperacionesService $inv,
        private readonly PreciosService $precios,
        private readonly HistorialPreciosService $evolucion,
        private readonly PagosProveedorService $pagos,
    ) {}

    /* ============================ Lectura ============================ */

    /** Las notas que ajustan cada factura, en una consulta. `[facturaId => ['ajuste'=>, 'notas'=>[]]]`. */
    private function ajustesDe(array $idsFactura): array
    {
        if (! $idsFactura) {
            return [];
        }
        $out = [];
        $notas = DB::table('comprobantes')->whereIn('ref_comprobante_id', $idsFactura)->whereIn('tipo', ['nota_credito', 'nota_debito'])->where('estado', 'confirmado')
            ->orderBy('id')->get(['id', 'tipo', 'letra', 'punto_venta', 'numero', 'fecha', 'total', 'observaciones', 'ref_comprobante_id']);
        foreach ($notas as $n) {
            $ref = (int) $n->ref_comprobante_id;
            $signo = $n->tipo === 'nota_debito' ? 1 : -1;
            $out[$ref] ??= ['ajuste' => 0.0, 'notas' => []];
            $out[$ref]['ajuste'] = Documentos::money($out[$ref]['ajuste'] + $signo * (float) $n->total);
            $out[$ref]['notas'][] = [...Fila::camel($n), 'etiqueta' => Documentos::etiqueta($n), 'signo' => $signo];
        }

        return $out;
    }

    private function saldoReal(object $c, float $ajuste = 0): float
    {
        return Documentos::money((float) $c->total + $ajuste - (float) $c->pagado);
    }

    private function armar(object $c, array $items, array $percepciones, array $pagos, ?array $aj, string $refEtiqueta): array
    {
        return [...Fila::camel($c), 'etiqueta' => Documentos::etiqueta($c), 'items' => $items, 'percepciones' => $percepciones, 'pagos' => $pagos,
            'ajuste' => $aj['ajuste'] ?? 0.0, 'notas' => $aj['notas'] ?? [], 'refEtiqueta' => $refEtiqueta, 'saldo' => $this->saldoReal($c, $aj['ajuste'] ?? 0.0)];
    }

    private function itemsDe(array $ids): array
    {
        $out = [];
        $filas = DB::table('comprobante_items as i')->join('productos as p', 'p.id', '=', 'i.producto_id')->leftJoin('presentaciones as pr', 'pr.id', '=', 'i.presentacion_id')
            ->whereIn('i.comprobante_id', $ids)->orderBy('i.id')->get(['i.*', 'p.nombre as producto_nombre', 'p.tipo as producto_tipo', 'pr.tam_kg as presentacion_kg']);
        foreach ($filas as $f) {
            $out[$f->comprobante_id][] = Fila::camel($f);
        }

        return $out;
    }

    /**
     * @param  array{proveedorId?:int, tipo?:string, estado?:string, sucursalId?:int, desde?:string, hasta?:string, verLiquidaciones?:bool, limit?:int}  $q
     */
    public function listar(array $q): array
    {
        $qb = DB::table('comprobantes as c')->join('proveedores as p', 'p.id', '=', 'c.proveedor_id')->leftJoin('sucursales as s', 's.id', '=', 'c.sucursal_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->select('c.*', 'p.nombre as proveedor_nombre', DB::raw("coalesce(s.nombre,'') as sucursal_nombre"), DB::raw("coalesce(u.nombre,'') as usuario_nombre"));
        if (! empty($q['proveedorId'])) {
            $qb->where('c.proveedor_id', (int) $q['proveedorId']);
        }
        if (! empty($q['tipo'])) {
            $qb->where('c.tipo', $q['tipo']);
        }
        if (! empty($q['estado'])) {
            $qb->where('c.estado', $q['estado']);
        }
        if (! empty($q['sucursalId'])) {
            $qb->where('c.sucursal_id', (int) $q['sucursalId']);
        }
        if ($d = Documentos::fecha($q['desde'] ?? null)) {
            $qb->where('c.fecha', '>=', $d);
        }
        if ($h = Documentos::finDeDia($q['hasta'] ?? null)) {
            $qb->where('c.fecha', '<=', $h);
        }
        // Sin el permiso `liquidaciones`, la mitad no facturada no viaja — ni pidiéndola por tipo.
        if (empty($q['verLiquidaciones'])) {
            $qb->where('c.tipo', '!=', 'liquidacion');
        }
        $limit = min(max((int) ($q['limit'] ?? 300), 1), 1000);
        $rows = $qb->orderByDesc('c.id')->limit($limit)->get();
        if ($rows->isEmpty()) {
            return [];
        }
        $ids = $rows->pluck('id')->all();
        $items = $this->itemsDe($ids);
        $percs = DB::table('comprobante_percepciones')->whereIn('comprobante_id', $ids)->orderBy('id')->get()->groupBy('comprobante_id');
        $ajustes = $this->ajustesDe($ids);
        $etiquetas = $rows->mapWithKeys(fn ($c) => [$c->id => Documentos::etiqueta($c)])->all();
        $faltan = $rows->pluck('ref_comprobante_id')->filter()->unique()->reject(fn ($x) => isset($etiquetas[$x]))->all();
        if ($faltan) {
            foreach (DB::table('comprobantes')->whereIn('id', $faltan)->get(['id', 'tipo', 'letra', 'punto_venta', 'numero']) as $r) {
                $etiquetas[$r->id] = Documentos::etiqueta($r);
            }
        }

        return $rows->map(fn ($c) => $this->armar($c, $items[$c->id] ?? [], Fila::camelTodos($percs->get($c->id) ?? []), [], $ajustes[$c->id] ?? null,
            $c->ref_comprobante_id ? ($etiquetas[$c->ref_comprobante_id] ?? '') : ''))->all();
    }

    public function get(int $id): array
    {
        $c = DB::table('comprobantes as c')->join('proveedores as p', 'p.id', '=', 'c.proveedor_id')->leftJoin('sucursales as s', 's.id', '=', 'c.sucursal_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')->where('c.id', $id)
            ->select('c.*', 'p.nombre as proveedor_nombre', 'p.condicion_iva as proveedor_condicion_iva', DB::raw("coalesce(s.nombre,'') as sucursal_nombre"), DB::raw("coalesce(u.nombre,'') as usuario_nombre"))->first();
        if (! $c) {
            throw new NotFoundHttpException('Comprobante inexistente.');
        }
        $ref = null;
        if ($c->ref_comprobante_id) {
            $r = DB::table('comprobantes')->find($c->ref_comprobante_id);
            if ($r) {
                $ref = ['id' => $r->id, 'etiqueta' => Documentos::etiqueta($r), 'fecha' => Fila::iso($r->fecha), 'total' => (float) $r->total];
            }
        }
        $aj = $this->ajustesDe([$id])[$id] ?? null;
        $out = $this->armar($c, $this->itemsDe([$id])[$id] ?? [], Fila::camelTodos(DB::table('comprobante_percepciones')->where('comprobante_id', $id)->orderBy('id')->get()),
            $this->pagos->pagosDe(null, $id), $aj, $ref['etiqueta'] ?? '');
        $out['ref'] = $ref;
        $out['compromisos'] = array_map(fn ($k) => [...$k, 'pagado' => (bool) $k['pagado']],
            Fila::camelTodos(DB::table('proveedor_compromisos')->where('comprobante_id', $id)->orderBy('fecha_venc')->get()));

        return $out;
    }

    /** Las facturas confirmadas del proveedor que una NC/ND puede ajustar, con su saldo real. */
    public function referenciables(int $proveedorId): array
    {
        $facturas = DB::table('comprobantes')->where('proveedor_id', $proveedorId)->where('tipo', 'factura')->where('estado', 'confirmado')->orderByDesc('fecha')->orderByDesc('id')->get();
        if ($facturas->isEmpty()) {
            return [];
        }
        $ajustes = $this->ajustesDe($facturas->pluck('id')->all());

        return $facturas->map(fn ($f) => ['id' => $f->id, 'etiqueta' => Documentos::etiqueta($f), 'fecha' => Fila::iso($f->fecha), 'total' => (float) $f->total, 'pagado' => (float) $f->pagado,
            'ajuste' => $ajustes[$f->id]['ajuste'] ?? 0.0, 'notas' => count($ajustes[$f->id]['notas'] ?? []), 'saldo' => $this->saldoReal($f, $ajustes[$f->id]['ajuste'] ?? 0.0)])->all();
    }

    /** Los remitos confirmados que todavía esperan su factura. */
    public function remitosPendientes(?int $proveedorId = null): array
    {
        $qb = DB::table('comprobantes as c')->join('proveedores as p', 'p.id', '=', 'c.proveedor_id')->where('c.tipo', 'remito')->where('c.estado', 'confirmado');
        if ($proveedorId) {
            $qb->where('c.proveedor_id', $proveedorId);
        }

        return $qb->orderBy('c.fecha')->get(['c.*', 'p.nombre as proveedor_nombre'])->map(fn ($c) => [...Fila::camel($c), 'etiqueta' => Documentos::etiqueta($c)])->all();
    }

    /** Cuenta corriente del proveedor por MERCADERÍA (la completa, con gastos, la arma Pagos). */
    public function cuenta(int $proveedorId): array
    {
        $cs = DB::table('comprobantes')->where('proveedor_id', $proveedorId)->where('estado', 'confirmado')->orderByDesc('id')->get();
        $deuda = 0.0;
        $pagado = 0.0;
        foreach ($cs as $c) {
            if (Documentos::generaDeuda($c->tipo)) {
                $deuda += (float) $c->total;
                $pagado += (float) $c->pagado;
            } elseif ($c->tipo === 'nota_credito') {
                $deuda -= (float) $c->total;
            }
        }
        $ajustes = $this->ajustesDe($cs->pluck('id')->all());
        $etiquetas = $cs->mapWithKeys(fn ($c) => [$c->id => Documentos::etiqueta($c)])->all();

        return ['proveedorId' => $proveedorId, 'saldo' => Documentos::money($deuda - $pagado), 'deuda' => Documentos::money($deuda), 'pagado' => Documentos::money($pagado),
            'comprobantes' => $cs->map(fn ($c) => $this->armar($c, [], [], [], $ajustes[$c->id] ?? null, $c->ref_comprobante_id ? ($etiquetas[$c->ref_comprobante_id] ?? '') : ''))->all()];
    }

    /** El saldo de todos los proveedores, en una consulta agrupada. */
    public function saldos(): array
    {
        $filas = DB::table('comprobantes')->where('estado', 'confirmado')->groupBy('proveedor_id')->selectRaw(
            "proveedor_id, coalesce(sum(case when tipo in ('factura','liquidacion','nota_debito') then total when tipo = 'nota_credito' then -total else 0 end),0) as deuda,"
            ."coalesce(sum(case when tipo in ('factura','liquidacion','nota_debito') then pagado else 0 end),0) as pagado")->get();
        $por = [];
        $total = 0.0;
        foreach ($filas as $f) {
            $s = Documentos::money((float) $f->deuda - (float) $f->pagado);
            $por[$f->proveedor_id] = $s;
            $total += $s;
        }

        return ['total' => Documentos::money($total), 'porProveedor' => $por];
    }

    /* ============================ El pie ============================ */

    /** Lo que ya no se trae NO entra por una factura de compra. */
    private function validarProductosComprables(array $items): void
    {
        $ids = array_values(array_unique(array_filter(array_map(fn ($it) => (int) ($it['productoId'] ?? 0), $items))));
        if (! $ids) {
            return;
        }
        $existen = DB::table('productos')->whereIn('id', $ids)->get(['id', 'nombre', 'estado']);
        if ($existen->count() !== count($ids)) {
            throw new ErrorDeNegocio('Hay un producto inexistente en el detalle.');
        }
        $dados = $existen->where('estado', '!=', 'activo');
        if ($dados->isNotEmpty()) {
            throw new ErrorDeNegocio('Estos productos ya no se compran: '.$dados->map(fn ($d) => $d->nombre.' ('.$d->estado.')')->implode(', ').'. Si volvés a traerlos, reactivalos en Productos y cargá la factura de nuevo.');
        }
    }

    /**
     * @param  array{items:array, bonificacion?:float, bonificacionImporte?:float, percepciones?:array}  $entrada
     * @return array{items:array, bonifPct:float, bonificacionImporte:float, subtotalNeto:float, ivaTotal:float, percepciones:array, percepcionesTotal:float, total:float}
     */
    private function armarPie(array $entrada, bool $fiscal, float $ivaDefault): array
    {
        $bruto = 0.0;
        $items = [];
        foreach ($entrada['items'] as $it) {
            $cantidad = (float) ($it['cantidad'] ?? 0);
            $costo = (float) ($it['costoUnitario'] ?? 0);
            $desc = (float) ($it['descuento'] ?? 0);
            if ($cantidad < 0 || $cantidad > 1_000_000 || $costo < 0 || $costo > 1_000_000_000 || $desc < 0 || $desc > 100) {
                throw new ErrorDeNegocio('Un renglón tiene cantidad, costo o descuento fuera de rango.');
            }
            $ivaP = isset($it['iva']) && $it['iva'] !== null && $it['iva'] !== '' ? (float) $it['iva'] : $ivaDefault;
            if (! Iva::esValida($ivaP)) {
                throw new ErrorDeNegocio('Alícuota de IVA inválida. Las válidas son: '.Iva::texto().'%.');
            }
            $neto = $cantidad * $costo * (1 - $desc / 100);
            $bruto += $neto;
            $items[] = [...$it, 'cantidad' => $cantidad, 'costoUnitario' => $costo, 'descuento' => $desc, 'iva' => $ivaP, 'subtotal' => $neto];
        }
        $bonifPct = (float) ($entrada['bonificacion'] ?? 0);
        if ($bonifPct !== 0.0 && ($bonifPct < 0 || $bonifPct >= 100)) {
            throw new ErrorDeNegocio('La bonificación tiene que estar entre 0 y 100%.');
        }
        $bonificacionImporte = isset($entrada['bonificacionImporte']) && $entrada['bonificacionImporte'] !== null && $entrada['bonificacionImporte'] !== ''
            ? (float) $entrada['bonificacionImporte'] : Documentos::money($bruto * $bonifPct / 100);
        if (! ($bonificacionImporte >= 0)) {
            throw new ErrorDeNegocio('La bonificación no puede ser negativa.');
        }
        if ($bonificacionImporte > $bruto + self::EPS) {
            throw new ErrorDeNegocio('La bonificación no puede ser mayor que el subtotal de los ítems.');
        }
        $factor = $bruto > 0 ? 1 - $bonificacionImporte / $bruto : 1;
        $subtotalNeto = 0.0;
        $ivaTotal = 0.0;
        foreach ($items as &$it) {
            $neto = $it['subtotal'] * $factor;
            $it['subtotal'] = $neto;
            $subtotalNeto += $neto;
            // En una liquidación el IVA es CERO: nada de crédito fiscal de una factura que no existe.
            if (! $fiscal) {
                $it['iva'] = 0.0;
            }
            $ivaTotal += $neto * $it['iva'] / 100;
        }
        unset($it);
        $conIva = $subtotalNeto + $ivaTotal;
        $percepciones = [];
        foreach ($fiscal ? ($entrada['percepciones'] ?? []) : [] as $p) {
            $nombre = trim((string) ($p['nombre'] ?? ''));
            if ($nombre === '') {
                continue;
            }
            $base = ($p['base'] ?? 'neto') === 'total' ? 'total' : 'neto';
            $alic = (float) ($p['alicuota'] ?? 0);
            $calc = ($base === 'total' ? $conIva : $subtotalNeto) * $alic / 100;
            $importe = isset($p['importe']) && $p['importe'] !== null && $p['importe'] !== '' ? (float) $p['importe'] : Documentos::money($calc);
            if ($importe > self::EPS) {
                $percepciones[] = ['nombre' => mb_substr($nombre, 0, 120), 'alicuota' => $alic, 'base' => $base, 'importe' => Documentos::money($importe)];
            }
        }
        $percTotal = array_sum(array_column($percepciones, 'importe'));

        return ['items' => $items, 'bonifPct' => $bonifPct, 'bonificacionImporte' => Documentos::money($bonificacionImporte), 'subtotalNeto' => Documentos::money($subtotalNeto),
            'ivaTotal' => Documentos::money($ivaTotal), 'percepciones' => $percepciones, 'percepcionesTotal' => Documentos::money($percTotal),
            'total' => Documentos::money($subtotalNeto + $ivaTotal + $percTotal)];
    }

    /** Las cuotas del compromiso, validadas contra lo que queda en cuenta corriente. */
    private function normalizarCompromisos(array $dto, float $total): array
    {
        $norm = [];
        foreach ($dto['compromisos'] ?? [] as $k) {
            $norm[] = ['importe' => Documentos::money($k['importe'] ?? 0), 'fechaVenc' => Documentos::fecha($k['fechaVenc'] ?? null, true), 'obs' => mb_substr(trim((string) ($k['obs'] ?? '')), 0, 300)];
        }
        if (! $norm) {
            return [];
        }
        foreach ($norm as $k) {
            if ($k['importe'] <= 0) {
                throw new ErrorDeNegocio('Cada cuota del compromiso tiene que ser mayor a 0.');
            }
        }
        $suma = Documentos::money(array_sum(array_column($norm, 'importe')));
        $contado = Documentos::money((float) ($dto['pagoContado']['importe'] ?? 0) + array_sum(array_map(fn ($t) => (float) ($t['importe'] ?? 0), $dto['tomarPagos'] ?? [])));
        $saldo = Documentos::money($total - $contado);
        if (abs($suma - $saldo) > self::EPS) {
            throw new ErrorDeNegocio('Los compromisos suman '.number_format($suma, 2, '.', '').' y lo que queda en cuenta corriente es '.number_format($saldo, 2, '.', '').': las cuotas tienen que cubrir ese saldo exacto.');
        }

        return $norm;
    }

    /** El compromiso nace con la factura, en la misma transacción. Con proveedor a echeq, nace también el echeq "a completar". */
    private function crearCompromisos(object $c, object $prov, array $norm, string $nombreDoc): void
    {
        $esEcheq = ($prov->medio_habitual ?? null) === 'echeq';
        $n = count($norm);
        foreach ($norm as $i => $k) {
            $compId = DB::table('proveedor_compromisos')->insertGetId([
                'proveedor_id' => $prov->id, 'comprobante_id' => $c->id, 'importe' => $k['importe'], 'fecha_emision' => $c->fecha, 'fecha_venc' => $k['fechaVenc'],
                'origen' => 'factura', 'es_echeq' => $esEcheq, 'cuota' => $n > 1 ? $i + 1 : null, 'cuotas' => $n > 1 ? $n : null, 'obs' => $k['obs'], 'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($esEcheq) {
                DB::table('proveedor_echeqs')->insert([
                    'numero' => 'PEND-'.$compId, 'banco' => 'A definir', 'importe' => $k['importe'], 'fecha_emision' => $c->fecha, 'fecha_venc' => $k['fechaVenc'],
                    'proveedor_id' => $prov->id, 'compromiso_id' => $compId, 'obs' => 'Auto-creado con '.$nombreDoc.' '.Documentos::etiqueta($c).' — completar número y banco reales.',
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    /**
     * El pago en el mismo acto, DESPUÉS del commit del comprobante y a
     * propósito: si el pago falla, el comprobante queda cargado y con deuda —
     * un estado válido y recuperable. Al final, la condición se deriva de lo
     * que realmente se pagó.
     */
    private function saldarEnElActo(int $id, array $args, array $opciones): void
    {
        foreach ($args['tomarPagos'] ?? [] as $t) {
            $this->pagos->imputar((int) $t['pagoId'], [['comprobanteId' => $id, 'importe' => (float) $t['importe']]], $args['usuarioId'] ?? null, ! empty($opciones['cruzaSucursales']), true);
        }
        $contado = (float) ($args['pagoContado']['importe'] ?? 0);
        if ($contado > 0) {
            $this->pagos->crear([
                'proveedorId' => $args['proveedorId'], 'destino' => 'mercaderia', 'importe' => $contado, 'medio' => $args['pagoContado']['medio'] ?? 'efectivo',
                'fecha' => $args['fecha'] ?? null, 'concepto' => $args['concepto'], 'referencia' => $args['pagoContado']['referencia'] ?? '', 'sucursalId' => $args['sucursalId'] ?? null,
                'cajaSesionId' => $args['pagoContado']['cajaSesionId'] ?? null, 'usuarioId' => $args['usuarioId'] ?? null, 'operadorId' => $args['pagoContado']['operadorId'] ?? null,
                'imputaciones' => [['comprobanteId' => $id, 'importe' => $contado]],
            ], (int) $opciones['sucursalSesion'], ! empty($opciones['cruzaSucursales']), true);
        }
        if (($args['tomarPagos'] ?? []) || $contado > 0) {
            $final = DB::table('comprobantes')->find($id);
            $saldado = $final && (float) $final->pagado >= (float) $final->total - self::EPS;
            DB::table('comprobantes')->where('id', $id)->update(['condicion_pago' => $saldado ? 'contado' : 'cuenta_corriente']);
        }
    }

    /** Los costos que el usuario aceptó actualizar, dentro de la transacción del comprobante. */
    private function aplicarCostos(array $dto, object $prov, int $comprobanteId, string $motivo, ?int $usuarioId): void
    {
        $pedidos = array_values(array_filter($dto['actualizarCostos'] ?? [], fn ($x) => (float) ($x['costo'] ?? 0) > 0));
        if ($pedidos) {
            $entradas = DB::table('producto_proveedores')->where('proveedor_id', $prov->id)->whereIn('producto_id', array_map(fn ($x) => (int) $x['productoId'], $pedidos))->get();
            $porProducto = $entradas->keyBy('producto_id');
            $cambios = [];
            foreach ($pedidos as $x) {
                $e = $porProducto->get((int) $x['productoId']);
                if (! $e) {
                    continue;
                }
                // El tamaño del bulto de ESTA entrega, antes que el costo: el $/kg lo fija la góndola.
                if ((float) ($x['cantidad'] ?? 0) > 0) {
                    DB::table('producto_proveedores')->where('id', $e->id)->update(['cantidad' => (float) $x['cantidad']]);
                }
                $cambios[] = ['id' => $e->id, 'costo' => (float) $x['costo'], 'descuento' => $x['descuento'] ?? null, 'flete' => $x['flete'] ?? null];
            }
            if ($cambios) {
                $this->precios->actualizarCostos(['cambios' => $cambios, 'origen' => 'recepcion', 'motivo' => $motivo, 'usuarioId' => $usuarioId, 'comprobanteId' => $comprobanteId], true);
            }
        }
        if (! empty($dto['activarProveedor'])) {
            $this->precios->activarProveedor(['productoIds' => $dto['activarProveedor'], 'proveedorId' => $prov->id, 'origen' => 'recepcion', 'motivo' => $motivo, 'usuarioId' => $usuarioId, 'comprobanteId' => $comprobanteId], true);
        }
    }

    private function registrarEvolucion(array $dto, string $detalle, ?int $usuarioId): void
    {
        $tocados = [...array_map(fn ($x) => (int) $x['productoId'], $dto['actualizarCostos'] ?? []), ...array_map('intval', $dto['activarProveedor'] ?? [])];
        if ($tocados) {
            $this->evolucion->snapshot($tocados, 'costo', ['detalle' => $detalle, 'usuarioId' => $usuarioId]);
        }
    }

    private function exigirPermisoPrecios(array $dto, array $opciones, string $accion): void
    {
        if (empty($opciones['puedeTocarPrecios']) && (! empty($dto['actualizarCostos']) || ! empty($dto['activarProveedor']))) {
            throw new AccessDeniedHttpException('Para actualizar costos o cambiar el proveedor activo hace falta el permiso de precios. '.$accion.' sin esa parte y pedile a quien maneja precios que la haga.');
        }
    }

    /* ============================ Alta ============================ */

    /**
     * @param  array  $opciones  puedeTocarPrecios, sucursalSesion, cruzaSucursales, usuarioId, puedeLiquidaciones
     */
    public function crear(array $dto, array $opciones): array
    {
        $this->exigirPermisoPrecios($dto, $opciones, 'Registrá el comprobante');
        $tipo = $dto['tipo'] ?? '';
        if (! in_array($tipo, Documentos::TIPOS, true)) {
            throw new ErrorDeNegocio('Tipo de comprobante inválido.');
        }
        if ($tipo === 'liquidacion' && empty($opciones['puedeLiquidaciones'])) {
            throw new AccessDeniedHttpException('Cargar liquidaciones pide su propio permiso.');
        }
        $prov = DB::table('proveedores')->find((int) ($dto['proveedorId'] ?? 0));
        if (! $prov) {
            throw new ErrorDeNegocio('Proveedor inválido.');
        }
        if (empty($dto['items'])) {
            throw new ErrorDeNegocio('Agregá al menos un ítem.');
        }
        $this->validarProductosComprables($dto['items']);
        $usuarioId = $opciones['usuarioId'] ?? null;

        // Un monotributista o exento NO discrimina IVA.
        $ivaDefault = $prov->condicion_iva === 'responsable_inscripto' ? 21.0 : 0.0;
        $fiscal = Documentos::esFiscal($tipo);
        $pie = $this->armarPie($dto, $fiscal, $ivaDefault);
        if (in_array($tipo, ['factura', 'liquidacion', 'nota_debito'], true) && $pie['total'] <= 0) {
            throw new ErrorDeNegocio('El total de '.Documentos::NOMBRE_TIPO[$tipo].' da '.number_format($pie['total'], 2, '.', '').': revisá las cantidades, los costos y la bonificación.');
        }
        $estado = $dto['estado'] ?? 'confirmado';
        if (! in_array($estado, ['borrador', 'confirmado'], true)) {
            throw new ErrorDeNegocio('Estado inválido.');
        }
        if ($estado === 'borrador' && ! empty($dto['recepcion'])) {
            throw new ErrorDeNegocio('Un borrador no puede recibir mercadería: cargá el comprobante confirmado, o sin recepción.');
        }
        $puntoVenta = Documentos::puntoVenta($dto['puntoVenta'] ?? '1');
        $numero = ! empty($dto['numero']) ? (int) $dto['numero'] : null;
        $ingresaStock = $estado === 'confirmado' && ! empty($dto['recepcion']) && in_array($tipo, Documentos::INGRESAN_STOCK, true);
        // Una NC con recepción SACA mercadería (devolución). No es automático: una NC también ajusta un precio.
        $egresaStock = $estado === 'confirmado' && ! empty($dto['recepcion']) && $tipo === 'nota_credito';
        $sucursalId = ! empty($dto['sucursalId']) ? (int) $dto['sucursalId'] : null;
        if (($ingresaStock || $egresaStock) && ! $sucursalId) {
            throw new ErrorDeNegocio('Indicá la sucursal de recepción.');
        }
        if ($sucursalId && ! empty($opciones['soloSuSucursal']) && $sucursalId !== (int) $opciones['soloSuSucursal']) {
            throw new AccessDeniedHttpException('La recepción se registra en la sucursal con la que entraste.');
        }

        $esNota = in_array($tipo, ['nota_credito', 'nota_debito'], true);
        $refId = ! empty($dto['refComprobanteId']) ? (int) $dto['refComprobanteId'] : null;
        if ($refId !== null) {
            if (! $esNota) {
                throw new ErrorDeNegocio('Solo una nota de crédito o de débito ajusta a otro comprobante.');
            }
            $ref = DB::table('comprobantes')->find($refId);
            if (! $ref) {
                throw new ErrorDeNegocio('La factura que se quiere ajustar no existe.');
            }
            if ((int) $ref->proveedor_id !== (int) $prov->id) {
                throw new ErrorDeNegocio('Esa factura no es de '.$prov->nombre.': una nota no puede ajustar la factura de otro proveedor.');
            }
            if ($ref->tipo !== 'factura') {
                throw new ErrorDeNegocio('Una nota solo ajusta una factura, y '.Documentos::etiqueta($ref).' no lo es.');
            }
            if ($ref->estado !== 'confirmado') {
                throw new ErrorDeNegocio(Documentos::etiqueta($ref).' está '.$ref->estado.': no se le pueden aplicar notas.');
            }
        }
        $puedeComprometer = $estado === 'confirmado' && in_array($tipo, ['factura', 'liquidacion'], true);
        if (! empty($dto['compromisos']) && ! $puedeComprometer) {
            throw new ErrorDeNegocio('Los compromisos de pago son de una factura o liquidación confirmada.');
        }
        $compromisos = $this->normalizarCompromisos($dto, $pie['total']);
        if ($numero !== null) {
            $ya = DB::table('comprobantes')->where('proveedor_id', $prov->id)->where('tipo', $tipo)->where('punto_venta', $puntoVenta)->where('numero', $numero)->value('id');
            if ($ya) {
                throw new ErrorDeNegocio($prov->nombre.' ya tiene cargada '.Documentos::NOMBRE_TIPO[$tipo].' '.$puntoVenta.'-'.$numero.' (comprobante #'.$ya.').');
            }
        }
        $fecha = Documentos::fecha($dto['fecha'] ?? null) ?? now();
        $fechaCarga = Documentos::fecha($dto['fechaCarga'] ?? null) ?? now();
        $venc = Documentos::fecha($dto['vencimientoPago'] ?? null);
        $letra = $fiscal ? ($dto['letra'] ?? 'A') : 'X';
        if (! in_array($letra, Documentos::LETRAS, true)) {
            throw new ErrorDeNegocio('Letra inválida.');
        }

        $id = DB::transaction(function () use ($dto, $prov, $tipo, $estado, $letra, $puntoVenta, $numero, $fecha, $fechaCarga, $venc, $sucursalId, $fiscal, $pie, $refId, $usuarioId, $compromisos, $ingresaStock, $egresaStock) {
            $id = DB::table('comprobantes')->insertGetId([
                'tipo' => $tipo, 'letra' => $letra, 'punto_venta' => $puntoVenta, 'numero' => $numero, 'cae' => $fiscal ? mb_substr((string) ($dto['cae'] ?? ''), 0, 32) : '',
                'fecha' => $fecha, 'fecha_carga' => $fechaCarga, 'proveedor_id' => $prov->id, 'sucursal_id' => $sucursalId, 'estado' => $estado,
                'condicion_pago' => $dto['condicionPago'] ?? 'cuenta_corriente', 'vencimiento_pago' => $venc, 'recepcion' => ! empty($dto['recepcion']),
                'bonificacion' => $pie['bonifPct'], 'bonificacion_importe' => $pie['bonificacionImporte'], 'subtotal_neto' => $pie['subtotalNeto'], 'iva_total' => $pie['ivaTotal'],
                'percepciones_total' => $pie['percepcionesTotal'], 'total' => $pie['total'], 'pagado' => 0, 'ref_comprobante_id' => $refId,
                'observaciones' => trim((string) ($dto['observaciones'] ?? '')), 'usuario_id' => $usuarioId, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $c = DB::table('comprobantes')->find($id);
            DB::table('comprobante_items')->insert(array_map(fn ($it) => [
                'comprobante_id' => $id, 'producto_id' => (int) $it['productoId'], 'presentacion_id' => (int) ($it['presentacionId'] ?? 0) ?: null,
                'cantidad' => $it['cantidad'], 'costo_unitario' => $it['costoUnitario'], 'descuento' => $it['descuento'], 'iva' => $it['iva'], 'subtotal' => Documentos::money($it['subtotal']),
            ], $pie['items']));
            // Aprender el mapeo (proveedor, código del papel) → producto. Upsert: la elección nueva pisa la vieja.
            foreach ($dto['items'] as $it) {
                $codigo = trim((string) ($it['codigoProveedor'] ?? ''));
                if ($codigo === '') {
                    continue;
                }
                DB::table('proveedor_articulos')->updateOrInsert(['proveedor_id' => $prov->id, 'codigo' => mb_substr($codigo, 0, 80)],
                    ['producto_id' => (int) $it['productoId'], 'descripcion' => mb_substr(trim((string) ($it['descripcionPapel'] ?? '')), 0, 200), 'updated_at' => now(), 'created_at' => now()]);
            }
            if ($pie['percepciones']) {
                DB::table('comprobante_percepciones')->insert(array_map(fn ($p) => ['comprobante_id' => $id, ...$p], $pie['percepciones']));
            }
            if ($compromisos) {
                $this->crearCompromisos($c, $prov, $compromisos, Documentos::NOMBRE_TIPO[$tipo]);
            }
            $etiqueta = Documentos::etiqueta($c);
            if ($ingresaStock) {
                $this->inv->ingresarStockItems(['sucursalId' => $sucursalId, 'proveedorId' => $prov->id, 'proveedorNombre' => $prov->nombre, 'usuarioId' => $usuarioId,
                    'descripcion' => 'Recepción '.$etiqueta, 'items' => $pie['items']]);
            }
            if ($egresaStock) {
                $this->inv->egresarStockItems(['sucursalId' => $sucursalId, 'usuarioId' => $usuarioId, 'tipoMovimiento' => 'devolucion',
                    'descripcion' => 'Devolución a '.$prov->nombre.' · '.$etiqueta, 'items' => $pie['items']]);
            }
            $this->aplicarCostos($dto, $prov, $id, $etiqueta.' · '.$prov->nombre, $usuarioId);

            return $id;
        });
        $this->registrarEvolucion($dto, 'Recepción de comprobante', $usuarioId);

        if ($estado === 'confirmado' && Documentos::generaDeuda($tipo)) {
            $this->saldarEnElActo($id, [
                'proveedorId' => $prov->id, 'concepto' => Documentos::etiqueta(DB::table('comprobantes')->find($id)), 'fecha' => $dto['fecha'] ?? null,
                'sucursalId' => $sucursalId, 'usuarioId' => $usuarioId, 'tomarPagos' => $dto['tomarPagos'] ?? [], 'pagoContado' => $dto['pagoContado'] ?? null,
            ], $opciones);
        }
        if ($esNota && $refId && $estado === 'confirmado') {
            $this->pagos->sincronizarComprobante($refId);
        }

        return $this->get($id);
    }

    /**
     * LLEGÓ LA FACTURA DE UN REMITO: el remito PASA A SER la factura (mismo
     * id, misma mercadería) completando lo que no tenía: número y letra del
     * papel, precios reales, pie, la deuda y el pago. NO toca el stock: la
     * mercadería entró UNA vez, con el remito. Producto y cantidad quedan
     * clavados; cada renglón viaja por su `itemId`.
     */
    public function facturar(int $id, array $dto, array $opciones): array
    {
        $this->exigirPermisoPrecios($dto, $opciones, 'Facturá el remito');
        $c = DB::table('comprobantes')->find($id);
        if (! $c) {
            throw new NotFoundHttpException('Comprobante inexistente.');
        }
        if ($c->tipo !== 'remito') {
            throw new ErrorDeNegocio(Documentos::etiqueta($c).' no es un remito: solo un remito pendiente se convierte en factura.');
        }
        if ($c->estado !== 'confirmado') {
            throw new ErrorDeNegocio('El remito está '.$c->estado.': no se puede facturar.');
        }
        $prov = DB::table('proveedores')->find($c->proveedor_id);
        if (! $prov) {
            throw new ErrorDeNegocio('El proveedor del remito ya no existe.');
        }
        $filas = DB::table('comprobante_items')->where('comprobante_id', $id)->orderBy('id')->get();
        if ($filas->isEmpty()) {
            throw new ErrorDeNegocio('El remito no tiene ítems.');
        }
        $porItem = collect($dto['items'] ?? [])->keyBy(fn ($x) => (int) $x['itemId']);
        foreach ($porItem->keys() as $k) {
            if (! $filas->contains('id', $k)) {
                throw new ErrorDeNegocio('Uno de los renglones enviados no pertenece a este remito.');
            }
        }
        $ivaDefault = $prov->condicion_iva === 'responsable_inscripto' ? 21.0 : 0.0;
        $base = $filas->map(function ($f) use ($porItem, $ivaDefault) {
            $o = $porItem->get($f->id);
            $iva = $o['iva'] ?? null;

            return ['itemId' => $f->id, 'productoId' => $f->producto_id, 'presentacionId' => $f->presentacion_id, 'cantidad' => (float) $f->cantidad,
                'costoUnitario' => isset($o['costoUnitario']) ? (float) $o['costoUnitario'] : (float) $f->costo_unitario,
                'descuento' => isset($o['descuento']) ? (float) $o['descuento'] : (float) $f->descuento,
                'iva' => ($iva !== null && $iva !== '') ? (float) $iva : ($f->iva !== null ? (float) $f->iva : $ivaDefault)];
        })->all();
        $pie = $this->armarPie(['items' => $base, 'bonificacion' => $dto['bonificacion'] ?? 0, 'bonificacionImporte' => $dto['bonificacionImporte'] ?? null, 'percepciones' => $dto['percepciones'] ?? []], true, $ivaDefault);
        if ($pie['total'] <= 0) {
            throw new ErrorDeNegocio('El total de la factura da '.number_format($pie['total'], 2, '.', '').': revisá los costos y la bonificación.');
        }
        $puntoVenta = Documentos::puntoVenta($dto['puntoVenta'] ?? $c->punto_venta ?? '1');
        $numero = ! empty($dto['numero']) ? (int) $dto['numero'] : $c->numero;
        if ($numero !== null) {
            $ya = DB::table('comprobantes')->where('proveedor_id', $prov->id)->where('tipo', 'factura')->where('punto_venta', $puntoVenta)->where('numero', $numero)->where('id', '!=', $id)->value('id');
            if ($ya) {
                throw new ErrorDeNegocio($prov->nombre.' ya tiene cargada la factura '.$puntoVenta.'-'.$numero.' (comprobante #'.$ya.').');
            }
        }
        $letra = $dto['letra'] ?? 'A';
        if (! in_array($letra, Documentos::LETRAS, true)) {
            throw new ErrorDeNegocio('Letra inválida.');
        }
        $compromisos = $this->normalizarCompromisos($dto, $pie['total']);
        $usuarioId = $opciones['usuarioId'] ?? null;
        $etiquetaRemito = Documentos::etiqueta($c);
        $fechaRemito = Fila::iso($c->fecha);
        $fecha = Documentos::fecha($dto['fecha'] ?? null) ?? $c->fecha;

        DB::transaction(function () use ($id, $c, $prov, $dto, $pie, $letra, $puntoVenta, $numero, $fecha, $compromisos, $usuarioId, $etiquetaRemito, $fechaRemito) {
            $rastro = 'Nace del '.$etiquetaRemito.' ('.substr((string) $fechaRemito, 0, 10).'): la mercadería ya había ingresado — el stock no se vuelve a mover.';
            DB::table('comprobantes')->where('id', $id)->update([
                'tipo' => 'factura', 'letra' => $letra, 'punto_venta' => $puntoVenta, 'numero' => $numero, 'fecha' => $fecha,
                'fecha_carga' => Documentos::fecha($dto['fechaCarga'] ?? null) ?? now(), 'vencimiento_pago' => Documentos::fecha($dto['vencimientoPago'] ?? null),
                'condicion_pago' => 'cuenta_corriente', 'bonificacion' => $pie['bonifPct'], 'bonificacion_importe' => $pie['bonificacionImporte'], 'subtotal_neto' => $pie['subtotalNeto'],
                'iva_total' => $pie['ivaTotal'], 'percepciones_total' => $pie['percepcionesTotal'], 'total' => $pie['total'], 'cae' => mb_substr((string) ($dto['cae'] ?? ''), 0, 32),
                'observaciones' => implode("\n", array_filter([trim((string) ($dto['observaciones'] ?? '')), trim((string) ($c->observaciones ?? '')), $rastro])),
                'usuario_id' => $usuarioId ?? $c->usuario_id, 'updated_at' => now(),
            ]);
            foreach ($pie['items'] as $it) {
                DB::table('comprobante_items')->where('id', $it['itemId'])->update(['costo_unitario' => $it['costoUnitario'], 'descuento' => $it['descuento'], 'iva' => $it['iva'], 'subtotal' => Documentos::money($it['subtotal'])]);
            }
            DB::table('comprobante_percepciones')->where('comprobante_id', $id)->delete();
            if ($pie['percepciones']) {
                DB::table('comprobante_percepciones')->insert(array_map(fn ($p) => ['comprobante_id' => $id, ...$p], $pie['percepciones']));
            }
            $actualizado = DB::table('comprobantes')->find($id);
            if ($compromisos) {
                $this->crearCompromisos($actualizado, $prov, $compromisos, 'la factura');
            }
            $this->aplicarCostos($dto, $prov, $id, Documentos::etiqueta($actualizado).' · '.$prov->nombre.' (del '.$etiquetaRemito.')', $usuarioId);
        });
        $this->registrarEvolucion($dto, 'Facturación de remito', $usuarioId);
        $this->saldarEnElActo($id, [
            'proveedorId' => $prov->id, 'concepto' => Documentos::etiqueta(DB::table('comprobantes')->find($id)), 'fecha' => $dto['fecha'] ?? null,
            'sucursalId' => $c->sucursal_id, 'usuarioId' => $usuarioId, 'tomarPagos' => $dto['tomarPagos'] ?? [], 'pagoContado' => $dto['pagoContado'] ?? null,
        ], $opciones);

        return $this->get($id);
    }

    /** Confirmar un borrador (sin recepción: la mercadería no entra por acá). */
    public function confirmar(int $id, ?int $usuarioId): array
    {
        $c = DB::table('comprobantes')->find($id);
        if (! $c) {
            throw new NotFoundHttpException('Comprobante inexistente.');
        }
        if ($c->estado !== 'borrador') {
            throw new ErrorDeNegocio('Solo un borrador se confirma.');
        }
        DB::table('comprobantes')->where('id', $id)->update(['estado' => 'confirmado', 'usuario_id' => $usuarioId ?? $c->usuario_id, 'updated_at' => now()]);

        return $this->get($id);
    }

    /**
     * ANULAR: el documento queda con rastro y deja de contar. Solo sin pagos
     * aplicados y sin notas que lo referencien; si movió stock, se revierte el
     * movimiento (lo que entró sale, lo que devolvió vuelve) en la misma
     * transacción. Sus compromisos pendientes se borran y sus echeqs a
     * completar se anulan.
     */
    public function anular(int $id, string $motivo, ?int $usuarioId, ?int $soloSuSucursal = null): array
    {
        if (trim($motivo) === '') {
            throw new ErrorDeNegocio('Indicá el motivo de la anulación.');
        }
        DB::transaction(function () use ($id, $motivo, $usuarioId, $soloSuSucursal) {
            $c = DB::table('comprobantes')->where('id', $id)->lockForUpdate()->first();
            if (! $c) {
                throw new NotFoundHttpException('Comprobante inexistente.');
            }
            if ($c->estado === 'anulado') {
                throw new ErrorDeNegocio('Ya está anulado.');
            }
            if ($soloSuSucursal !== null && $c->sucursal_id && (int) $c->sucursal_id !== $soloSuSucursal) {
                throw new AccessDeniedHttpException('Ese comprobante es de otra sucursal.');
            }
            if ((float) $c->pagado > self::EPS) {
                throw new ErrorDeNegocio('Tiene pagos aplicados: desaplicalos primero — la plata que salió tiene que quedar rastreable.');
            }
            $notas = DB::table('comprobantes')->where('ref_comprobante_id', $id)->where('estado', 'confirmado')->count();
            if ($notas) {
                throw new ErrorDeNegocio('Tiene notas de crédito o débito aplicadas: anulalas primero.');
            }
            $etiqueta = Documentos::etiqueta($c);
            if ($c->estado === 'confirmado' && $c->recepcion && $c->sucursal_id) {
                $items = DB::table('comprobante_items')->where('comprobante_id', $id)->get()->map(fn ($i) => ['productoId' => $i->producto_id, 'presentacionId' => $i->presentacion_id, 'cantidad' => (float) $i->cantidad])->all();
                if (in_array($c->tipo, Documentos::INGRESAN_STOCK, true)) {
                    $this->inv->egresarStockItems(['sucursalId' => (int) $c->sucursal_id, 'usuarioId' => $usuarioId, 'tipoMovimiento' => 'ajuste', 'descripcion' => 'Anulación de '.$etiqueta, 'items' => $items]);
                } elseif ($c->tipo === 'nota_credito') {
                    $this->inv->reingresarStockItems(['sucursalId' => (int) $c->sucursal_id, 'usuarioId' => $usuarioId, 'descripcion' => 'Anulación de '.$etiqueta.' (la devolución vuelve)', 'items' => $items]);
                }
            }
            $pend = DB::table('proveedor_compromisos')->where('comprobante_id', $id)->where('pagado', false)->pluck('id');
            if ($pend->isNotEmpty()) {
                DB::table('proveedor_echeqs')->whereIn('compromiso_id', $pend)->whereIn('estado', ['emitido', 'entregado'])->update(['estado' => 'anulado']);
                DB::table('proveedor_compromisos')->whereIn('id', $pend)->delete();
            }
            DB::table('comprobantes')->where('id', $id)->update([
                'estado' => 'anulado', 'updated_at' => now(),
                'anulado_por' => $usuarioId, 'anulado_en' => now(),
                'observaciones' => trim(($c->observaciones ? $c->observaciones."\n" : '').'Anulado: '.trim($motivo)),
            ]);
            if ($c->ref_comprobante_id) {
                $this->pagos->sincronizarCompromisos((int) $c->ref_comprobante_id, null);
            }
        });

        return $this->get($id);
    }

    /** Borrar un borrador: no movió nada, no queda historia. */
    public function descartar(int $id): void
    {
        $c = DB::table('comprobantes')->find($id);
        if (! $c) {
            throw new NotFoundHttpException('Comprobante inexistente.');
        }
        if ($c->estado !== 'borrador') {
            throw new ErrorDeNegocio('Solo un borrador se descarta; lo demás se anula.');
        }
        DB::table('comprobantes')->where('id', $id)->delete();
    }
}
