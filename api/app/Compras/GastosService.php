<?php

namespace App\Compras;

use App\Auth\Sesion;
use App\Exceptions\ErrorDeNegocio;
use App\Support\Fila;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * GASTOS — lo que la empresa paga y no es mercadería. Se carga el comprobante
 * que llegó, se imputa a un rubro y se paga (de una o en partes). De ahí salen
 * las dos preguntas de todos los días: qué tengo que pagar (cuentas a pagar) y
 * en qué se me va la plata (resumen por rubro).
 *
 *  1. El proveedor es el MISMO de compras: un CUIT, una entidad.
 *  2. Pagar en efectivo desde un turno abierto genera el EGRESO en esa caja
 *     (lo hace Pagos, en la misma transacción).
 *  3. Un gasto con pagos no se anula ni se le cambian los importes: primero se
 *     revierte el pago.
 */
class GastosService
{
    private const EPS = Documentos::EPS;

    private const TOPE = 1_000_000_000;

    private const MAX_ADJUNTO = 2_621_440; // 2,5 MB

    private const TIPOS_DOC = ['factura', 'ticket', 'recibo', 'nota_credito', 'otro'];

    private const FRECUENCIAS = ['mensual' => 1, 'bimestral' => 2, 'trimestral' => 3, 'semestral' => 6, 'anual' => 12];

    /** Mover plata: crea el egreso del cajón. Espejo de PagosProveedorController. */
    public const PERMISOS_PAGO = ['gastos_pagar', 'gastos_pagar_proveedor', 'ventas.caja'];

    public function __construct(private readonly PagosProveedorService $pagos) {}

    /* ---------------- Catálogos ---------------- */

    public function bootstrap(Sesion $sesion): array
    {
        return [
            'categorias' => Fila::camelTodos(DB::table('gasto_categorias')->orderBy('orden')->orderBy('nombre')->get()),
            'proveedores' => Fila::camelTodos(DB::table('proveedores')->orderBy('nombre')->get(['id', 'nombre', 'provee_mercaderia', 'provee_gastos', 'letra_gasto'])),
            'sucursales' => Fila::camelTodos(DB::table('sucursales')->orderBy('id')->get(['id', 'nombre'])),
            'usuarios' => Fila::camelTodos(DB::table('usuarios')->orderBy('nombre')->get(['id', 'nombre', 'activo'])),
            'recurrentes' => $sesion->puede('gastos.fijos') ? $this->listarRecurrentes() : [],
        ];
    }

    public function listarCategorias(): array
    {
        return Fila::camelTodos(DB::table('gasto_categorias')->orderBy('orden')->orderBy('nombre')->get());
    }

    public function crearCategoria(array $d): array
    {
        $nombre = trim((string) ($d['nombre'] ?? ''));
        if ($nombre === '') {
            throw new ErrorDeNegocio('Poné el nombre del rubro.');
        }
        if (DB::table('gasto_categorias')->where('nombre', $nombre)->exists()) {
            throw new ErrorDeNegocio('Ya existe un rubro llamado "'.$nombre.'".');
        }
        $id = DB::table('gasto_categorias')->insertGetId(['nombre' => $nombre, 'tipo' => ($d['tipo'] ?? 'variable') === 'fijo' ? 'fijo' : 'variable',
            'descripcion' => mb_substr(trim((string) ($d['descripcion'] ?? '')), 0, 300), 'activa' => ($d['activa'] ?? true) !== false, 'orden' => (int) ($d['orden'] ?? 500) ?: 500]);

        return Fila::camel(DB::table('gasto_categorias')->find($id));
    }

    public function editarCategoria(int $id, array $d): array
    {
        $c = DB::table('gasto_categorias')->find($id);
        if (! $c) {
            throw new NotFoundHttpException('Rubro inexistente.');
        }
        $patch = [];
        if (array_key_exists('nombre', $d)) {
            $n = trim((string) $d['nombre']);
            if ($n === '') {
                throw new ErrorDeNegocio('El nombre no puede quedar vacío.');
            }
            if (DB::table('gasto_categorias')->where('nombre', $n)->where('id', '!=', $id)->exists()) {
                throw new ErrorDeNegocio('Ya existe un rubro llamado "'.$n.'".');
            }
            $patch['nombre'] = $n;
        }
        if (! empty($d['tipo'])) {
            $patch['tipo'] = $d['tipo'] === 'fijo' ? 'fijo' : 'variable';
        }
        if (array_key_exists('descripcion', $d)) {
            $patch['descripcion'] = mb_substr(trim((string) $d['descripcion']), 0, 300);
        }
        if (array_key_exists('activa', $d)) {
            $patch['activa'] = (bool) $d['activa'];
        }
        if (array_key_exists('orden', $d)) {
            $patch['orden'] = (int) $d['orden'];
        }
        if ($patch) {
            DB::table('gasto_categorias')->where('id', $id)->update($patch);
        }

        return Fila::camel(DB::table('gasto_categorias')->find($id));
    }

    /** El rubro con gastos imputados no se borra: se da de baja. */
    public function borrarCategoria(int $id): void
    {
        $c = DB::table('gasto_categorias')->find($id);
        if (! $c) {
            throw new NotFoundHttpException('Rubro inexistente.');
        }
        $uso = DB::table('gastos')->where('categoria_id', $id)->count() + DB::table('gastos_recurrentes')->where('categoria_id', $id)->count();
        if ($uso > 0) {
            throw new ErrorDeNegocio('"'.$c->nombre.'" tiene '.$uso.' gasto(s) imputados: no se borra, se da de baja para que deje de aparecer.');
        }
        DB::table('gasto_categorias')->where('id', $id)->delete();
    }

    /* ---------------- Lectura ---------------- */

    private function base()
    {
        return DB::table('gastos as g')->join('gasto_categorias as c', 'c.id', '=', 'g.categoria_id')->leftJoin('proveedores as p', 'p.id', '=', 'g.proveedor_id')
            ->leftJoin('sucursales as s', 's.id', '=', 'g.sucursal_id')->leftJoin('usuarios as u', 'u.id', '=', 'g.usuario_id')
            ->select('g.*', 'c.nombre as categoria_nombre', 'c.tipo as categoria_tipo', DB::raw("coalesce(p.nombre, nullif(g.proveedor_texto,''), '') as proveedor_nombre"),
                DB::raw("coalesce(s.nombre,'') as sucursal_nombre"), DB::raw("coalesce(u.nombre,'') as usuario_nombre"));
    }

    private function filtros($qb, array $q)
    {
        if ($d = Documentos::fecha($q['desde'] ?? null)) {
            $qb->where('g.fecha', '>=', $d);
        }
        if ($h = Documentos::finDeDia($q['hasta'] ?? null)) {
            $qb->where('g.fecha', '<=', $h);
        }
        if (! empty($q['categoriaId'])) {
            $qb->where('g.categoria_id', (int) $q['categoriaId']);
        }
        if (! empty($q['proveedorId'])) {
            $qb->where('g.proveedor_id', (int) $q['proveedorId']);
        }
        if (! empty($q['sucursalId'])) {
            $qb->where('g.sucursal_id', (int) $q['sucursalId']);
        }
        if (! empty($q['estado'])) {
            $qb->where('g.estado', $q['estado']);
        }
        if (! empty($q['q'])) {
            $like = '%'.trim((string) $q['q']).'%';
            $qb->where(fn ($w) => $w->where('g.descripcion', 'like', $like)->orWhere('g.numero', 'like', $like)->orWhere('g.proveedor_texto', 'like', $like)->orWhere('g.observaciones', 'like', $like));
        }

        return $qb;
    }

    private function mapear(object $g): array
    {
        return [...Fila::camel($g), 'saldo' => Documentos::money((float) $g->total - (float) $g->pagado)];
    }

    public function listar(array $q): array
    {
        $limit = min(max((int) ($q['limit'] ?? 300), 1), 1000);

        return $this->filtros($this->base(), $q)->orderByDesc('g.fecha')->orderByDesc('g.id')->limit($limit)->get()->map(fn ($g) => $this->mapear($g))->all();
    }

    public function get(int $id): array
    {
        $g = $this->base()->where('g.id', $id)->first();
        if (! $g) {
            throw new NotFoundHttpException('Gasto inexistente.');
        }

        return [...$this->mapear($g),
            'pagos' => $this->pagos->pagosDe($id),
            'adjuntos' => Fila::camelTodos(DB::table('gasto_adjuntos')->where('gasto_id', $id)->orderBy('id')->get(['id', 'nombre', 'mime', 'subido_en'])),
            'items' => Fila::camelTodos(DB::table('gasto_items')->where('gasto_id', $id)->orderBy('id')->get()),
        ];
    }

    /** Bandeja de vencimientos: lo que falta pagar, por urgencia. `dias` negativo = vencido. */
    public function cuentasAPagar(array $q = []): array
    {
        $qb = $this->base()->where('g.estado', '!=', 'anulado')->whereRaw('g.total - g.pagado > ?', [self::EPS]);
        if (! empty($q['sucursalId'])) {
            $qb->where('g.sucursal_id', (int) $q['sucursalId']);
        }
        if (! empty($q['proveedorId'])) {
            $qb->where('g.proveedor_id', (int) $q['proveedorId']);
        }

        return $qb->orderByRaw('coalesce(g.vencimiento, g.fecha)')->orderBy('g.id')->get()
            ->map(fn ($g) => [...$this->mapear($g), 'dias' => Documentos::diasHasta($g->vencimiento)])->all();
    }

    /** Contador para el globo del menú: cuántos están vencidos o vencen hoy. */
    public function pendientes(): array
    {
        $hoy = Carbon::now(Documentos::ZONA)->endOfDay()->utc();
        $r = DB::table('gastos')->where('estado', '!=', 'anulado')->whereRaw('total - pagado > ?', [self::EPS])
            ->selectRaw('count(*) as pendientes, coalesce(sum(total - pagado),0) as saldo, sum(case when vencimiento is not null and vencimiento <= ? then 1 else 0 end) as vencidos', [$hoy])->first();

        return ['vencidos' => (int) $r->vencidos, 'pendientes' => (int) $r->pendientes, 'saldo' => Documentos::money((float) $r->saldo)];
    }

    /** Resumen de gerencia: en qué se va la plata. Agregado en la base. */
    public function resumen(array $q): array
    {
        $base = fn () => $this->filtros(DB::table('gastos as g'), ['desde' => $q['desde'] ?? null, 'hasta' => $q['hasta'] ?? null, 'sucursalId' => $q['sucursalId'] ?? null])->where('g.estado', '!=', 'anulado');
        $t = $base()->selectRaw('count(*) as cantidad, coalesce(sum(g.total),0) as total, coalesce(sum(g.neto),0) as neto, coalesce(sum(g.iva),0) as iva, coalesce(sum(g.pagado),0) as pagado')->first();
        $porCat = $base()->join('gasto_categorias as c', 'c.id', '=', 'g.categoria_id')->groupBy('g.categoria_id', 'c.nombre', 'c.tipo')
            ->selectRaw('g.categoria_id, c.nombre, c.tipo, count(*) as cantidad, coalesce(sum(g.total),0) as total')->orderByDesc('total')->get()
            ->map(fn ($c) => ['categoriaId' => $c->categoria_id, 'nombre' => $c->nombre, 'tipo' => $c->tipo, 'cantidad' => (int) $c->cantidad, 'total' => Documentos::money((float) $c->total)])->all();
        $porMes = $base()->selectRaw("date_format(convert_tz(g.fecha, '+00:00', '-03:00'), '%Y-%m') as mes, coalesce(sum(g.total),0) as total")->groupBy('mes')->orderBy('mes')->get()
            ->map(fn ($m) => ['mes' => $m->mes, 'total' => Documentos::money((float) $m->total)])->all();
        $porProv = $base()->leftJoin('proveedores as p', 'p.id', '=', 'g.proveedor_id')->groupBy('g.proveedor_id', 'p.nombre', 'g.proveedor_texto')
            ->selectRaw("g.proveedor_id, coalesce(p.nombre, nullif(g.proveedor_texto,''), 'Sin proveedor') as nombre, count(*) as cantidad, coalesce(sum(g.total),0) as total")
            ->orderByDesc('total')->limit(15)->get()
            ->map(fn ($p) => ['proveedorId' => $p->proveedor_id, 'nombre' => $p->nombre, 'cantidad' => (int) $p->cantidad, 'total' => Documentos::money((float) $p->total)])->all();
        $fijos = Documentos::money(array_sum(array_map(fn ($c) => $c['tipo'] === 'fijo' ? $c['total'] : 0, $porCat)));
        $variables = Documentos::money(array_sum(array_map(fn ($c) => $c['tipo'] === 'variable' ? $c['total'] : 0, $porCat)));

        return ['cantidad' => (int) $t->cantidad, 'total' => Documentos::money((float) $t->total), 'neto' => Documentos::money((float) $t->neto), 'iva' => Documentos::money((float) $t->iva),
            'pagado' => Documentos::money((float) $t->pagado), 'saldo' => Documentos::money((float) $t->total - (float) $t->pagado),
            'porCategoria' => $porCat, 'porMes' => $porMes, 'porProveedor' => $porProv, 'porTipo' => ['fijos' => $fijos, 'variables' => $variables]];
    }

    /* ---------------- Importes ---------------- */

    private function extrasDe(array $d): array
    {
        $impInternos = Documentos::money($d['impInternos'] ?? 0);
        $percDgi = Documentos::money($d['percDgi'] ?? 0);
        $percDgr = Documentos::money($d['percDgr'] ?? 0);
        foreach ([$impInternos, $percDgi, $percDgr] as $x) {
            if ($x < 0 || $x > self::TOPE) {
                throw new ErrorDeNegocio('Un importe del pie está fuera de rango.');
            }
        }
        $sinDetallar = Documentos::money($d['otros'] ?? 0);

        return ['impInternos' => $impInternos, 'percDgi' => $percDgi, 'percDgr' => $percDgr, 'otros' => Documentos::money($sinDetallar + $impInternos + $percDgi + $percDgr)];
    }

    private function totalesDe(array $d): array
    {
        $neto = Documentos::money($d['neto'] ?? 0);
        $iva = Documentos::money($d['iva'] ?? 0);
        if (abs($neto) > self::TOPE || abs($iva) > self::TOPE) {
            throw new ErrorDeNegocio('Un importe está fuera de rango.');
        }
        $extras = $this->extrasDe($d);

        return ['neto' => $neto, 'iva' => $iva, ...$extras, 'total' => Documentos::money($neto + $iva + $extras['otros'])];
    }

    /**
     * Con renglones mandan ellos. Sin `ivaAparte`: montos FINALES (ticket,
     * factura B), el IVA es informativo y el neto se deriva. Con `ivaAparte`:
     * la factura A — los renglones son NETOS, el IVA se copia del pie y SE SUMA.
     */
    private function importesDe(array $d): array
    {
        $renglones = [];
        foreach ($d['items'] ?? [] as $i) {
            $concepto = trim((string) ($i['concepto'] ?? ''));
            $monto = Documentos::money($i['monto'] ?? 0);
            if ($concepto !== '' && $monto > 0) {
                if ($monto > self::TOPE) {
                    throw new ErrorDeNegocio('Un renglón supera el tope de importe.');
                }
                $renglones[] = ['concepto' => mb_substr($concepto, 0, 200), 'monto' => $monto];
            }
        }
        if (! $renglones) {
            return [...$this->totalesDe($d), 'items' => null, 'descripcion' => null];
        }
        $suma = Documentos::money(array_sum(array_column($renglones, 'monto')));
        $descripcion = mb_substr(implode(' · ', array_column($renglones, 'concepto')), 0, 500);
        $extras = $this->extrasDe($d);
        if (! empty($d['ivaAparte'])) {
            $iva = Documentos::money($d['iva'] ?? 0);
            if ($iva < 0) {
                throw new ErrorDeNegocio('El IVA no puede ser negativo.');
            }
            if ($iva > $suma) {
                throw new ErrorDeNegocio('El IVA supera el neto de los conceptos: revisá el pie de la factura.');
            }

            return ['total' => Documentos::money($suma + $iva + $extras['otros']), 'iva' => $iva, 'neto' => $suma, ...$extras, 'items' => $renglones, 'descripcion' => $descripcion];
        }
        $iva = min(Documentos::money($d['iva'] ?? 0), $suma);

        return ['total' => Documentos::money($suma + $extras['otros']), 'iva' => $iva, 'neto' => Documentos::money($suma - $iva), ...$extras, 'items' => $renglones, 'descripcion' => $descripcion];
    }

    private function chequearDuplicado(?int $proveedorId, string $letra, string $numero, ?int $exceptoId = null): void
    {
        if (! $proveedorId || $numero === '') {
            return;
        }
        $qb = DB::table('gastos')->where('proveedor_id', $proveedorId)->where('numero', $numero)->where('letra', $letra)->where('estado', '!=', 'anulado');
        if ($exceptoId) {
            $qb->where('id', '!=', $exceptoId);
        }
        if ($ya = $qb->value('id')) {
            throw new ErrorDeNegocio('Ese comprobante ya está cargado (gasto #'.$ya.'). Si es otro, revisá el número o el proveedor.');
        }
    }

    private function tocaImportes(array $d): bool
    {
        foreach (['neto', 'iva', 'otros', 'impInternos', 'percDgi', 'percDgr'] as $k) {
            if (array_key_exists($k, $d) && $d[$k] !== null) {
                return true;
            }
        }

        return false;
    }

    /* ---------------- Escritura ---------------- */

    public function crear(array $d, Sesion $sesion): array
    {
        // "Lo pagué y lo cargo" saca plata del cajón: exige también el permiso de pagar.
        if (! empty($d['pagoInmediato']) && ! $sesion->puede(...self::PERMISOS_PAGO)) {
            throw new AccessDeniedHttpException('Podés cargar el gasto, pero no registrar su pago: eso saca plata de la caja y necesita permiso propio.');
        }
        $cat = DB::table('gasto_categorias')->find((int) ($d['categoriaId'] ?? 0));
        if (! $cat) {
            throw new ErrorDeNegocio('Elegí el rubro al que se imputa el gasto.');
        }
        $proveedorId = null;
        if (! empty($d['proveedorId'])) {
            $p = DB::table('proveedores')->find((int) $d['proveedorId']);
            if (! $p) {
                throw new ErrorDeNegocio('Proveedor inválido.');
            }
            $proveedorId = (int) $p->id;
        }
        $imp = $this->importesDe($d);
        if ($imp['total'] <= 0) {
            throw new ErrorDeNegocio('El importe del gasto tiene que ser mayor a 0.');
        }
        $numero = mb_substr(trim((string) ($d['numero'] ?? '')), 0, 40);
        $letra = $d['letra'] ?? 'B';
        $tipoDoc = $d['tipoDoc'] ?? 'factura';
        if (! in_array($letra, Documentos::LETRAS, true) || ! in_array($tipoDoc, self::TIPOS_DOC, true)) {
            throw new ErrorDeNegocio('Tipo o letra del comprobante inválidos.');
        }
        $this->chequearDuplicado($proveedorId, $letra, $numero);
        // La sucursal del gasto: el jefe elige (null = toda la empresa), el resto graba en la suya.
        $sucursalId = $sesion->esJefe() ? ((int) ($d['sucursalId'] ?? 0) ?: null) : $sesion->sucursalId;

        $id = DB::table('gastos')->insertGetId([
            'fecha' => Documentos::fecha($d['fecha'] ?? null) ?? now(), 'fecha_carga' => now(), 'tipo_doc' => $tipoDoc, 'letra' => $letra, 'numero' => $numero,
            'proveedor_id' => $proveedorId, 'proveedor_texto' => $proveedorId ? '' : mb_substr(trim((string) ($d['proveedorTexto'] ?? '')), 0, 160),
            'categoria_id' => $cat->id, 'sucursal_id' => $sucursalId, 'descripcion' => $imp['descripcion'] ?? mb_substr(trim((string) ($d['descripcion'] ?? '')), 0, 500),
            'condicion_pago' => ($d['condicionPago'] ?? 'contado') === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado', 'vencimiento' => Documentos::fecha($d['vencimiento'] ?? null),
            'neto' => $imp['neto'], 'iva' => $imp['iva'], 'otros' => $imp['otros'], 'imp_internos' => $imp['impInternos'], 'perc_dgi' => $imp['percDgi'], 'perc_dgr' => $imp['percDgr'],
            'total' => $imp['total'], 'pagado' => 0, 'estado' => 'pendiente', 'observaciones' => trim((string) ($d['observaciones'] ?? '')), 'usuario_id' => $sesion->usuarioId,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        if ($imp['items']) {
            DB::table('gasto_items')->insert(array_map(fn ($i) => [...$i, 'gasto_id' => $id], $imp['items']));
        }
        // El pago va DESPUÉS del alta y fuera de su transacción: si falla, el gasto queda pendiente (estado válido).
        if (! empty($d['pagoInmediato'])) {
            $pi = $d['pagoInmediato'];
            $importe = Documentos::money($pi['importe'] ?? 0);
            $this->pagos->crear([
                'destino' => 'gastos', 'proveedorId' => $proveedorId, 'importe' => $importe, 'medio' => $pi['medio'] ?? 'efectivo', 'fecha' => $pi['fecha'] ?? null,
                'referencia' => $pi['referencia'] ?? '', 'concepto' => ($imp['descripcion'] ?? trim((string) ($d['descripcion'] ?? ''))) ?: 'Gasto #'.$id,
                'sucursalId' => $sucursalId, 'cajaSesionId' => $pi['cajaSesionId'] ?? null, 'usuarioId' => $sesion->usuarioId, 'operadorId' => $pi['operadorId'] ?? null,
                'imputaciones' => [['gastoId' => $id, 'importe' => $importe]],
            ], $sesion->sucursalId, $sesion->esJefe());
        }

        return $this->get($id);
    }

    /** Con pagos registrados solo se tocan los campos descriptivos. */
    public function editar(int $id, array $d, Sesion $sesion): array
    {
        $g = DB::table('gastos')->find($id);
        if (! $g) {
            throw new NotFoundHttpException('Gasto inexistente.');
        }
        if ($g->estado === 'anulado') {
            throw new ErrorDeNegocio('El gasto está anulado: no se edita.');
        }
        $patch = [];
        if (! empty($d['categoriaId'])) {
            if (! DB::table('gasto_categorias')->where('id', (int) $d['categoriaId'])->exists()) {
                throw new ErrorDeNegocio('Rubro inválido.');
            }
            $patch['categoria_id'] = (int) $d['categoriaId'];
        }
        if (array_key_exists('descripcion', $d) && $d['descripcion'] !== null) {
            $patch['descripcion'] = mb_substr(trim((string) $d['descripcion']), 0, 500);
        }
        if (array_key_exists('observaciones', $d) && $d['observaciones'] !== null) {
            $patch['observaciones'] = trim((string) $d['observaciones']);
        }
        if (array_key_exists('vencimiento', $d)) {
            $patch['vencimiento'] = Documentos::fecha($d['vencimiento']);
        }
        // Mudar un gasto de sucursal es cosa del jefe; para el resto el campo se ignora.
        if (array_key_exists('sucursalId', $d) && $sesion->esJefe()) {
            $patch['sucursal_id'] = (int) ($d['sucursalId'] ?? 0) ?: null;
        }
        $tienePagos = (float) $g->pagado > self::EPS;
        if (! $tienePagos) {
            if (! empty($d['fecha'])) {
                $patch['fecha'] = Documentos::fecha($d['fecha']);
            }
            if (! empty($d['tipoDoc'])) {
                if (! in_array($d['tipoDoc'], self::TIPOS_DOC, true)) {
                    throw new ErrorDeNegocio('Tipo de comprobante inválido.');
                }
                $patch['tipo_doc'] = $d['tipoDoc'];
            }
            if (! empty($d['letra'])) {
                if (! in_array($d['letra'], Documentos::LETRAS, true)) {
                    throw new ErrorDeNegocio('Letra inválida.');
                }
                $patch['letra'] = $d['letra'];
            }
            if (array_key_exists('numero', $d) && $d['numero'] !== null) {
                $patch['numero'] = mb_substr(trim((string) $d['numero']), 0, 40);
            }
            if (! empty($d['condicionPago'])) {
                $patch['condicion_pago'] = $d['condicionPago'] === 'cuenta_corriente' ? 'cuenta_corriente' : 'contado';
            }
            if (array_key_exists('proveedorId', $d)) {
                $patch['proveedor_id'] = (int) ($d['proveedorId'] ?? 0) ?: null;
                if ($patch['proveedor_id'] && ! DB::table('proveedores')->where('id', $patch['proveedor_id'])->exists()) {
                    throw new ErrorDeNegocio('Proveedor inválido.');
                }
                if ($patch['proveedor_id']) {
                    $patch['proveedor_texto'] = '';
                }
            }
            if (array_key_exists('proveedorTexto', $d) && $d['proveedorTexto'] !== null && empty($patch['proveedor_id'])) {
                $patch['proveedor_texto'] = mb_substr(trim((string) $d['proveedorTexto']), 0, 160);
            }
            $con = $this->importesDe($d);
            if ($con['items']) {
                $patch += ['neto' => $con['neto'], 'iva' => $con['iva'], 'otros' => $con['otros'], 'imp_internos' => $con['impInternos'], 'perc_dgi' => $con['percDgi'], 'perc_dgr' => $con['percDgr'],
                    'total' => $con['total'], 'descripcion' => $con['descripcion']];
                DB::table('gasto_items')->where('gasto_id', $id)->delete();
                DB::table('gasto_items')->insert(array_map(fn ($i) => [...$i, 'gasto_id' => $id], $con['items']));
            } elseif ($this->tocaImportes($d)) {
                // El pie se reconstruye ENTERO: `otros` es la suma, lo no detallado se despeja de la fila vieja.
                $sinDetallar = Documentos::money((float) $g->otros - (float) $g->imp_internos - (float) $g->perc_dgi - (float) $g->perc_dgr);
                $t = $this->totalesDe(['neto' => $d['neto'] ?? $g->neto, 'iva' => $d['iva'] ?? $g->iva, 'otros' => $d['otros'] ?? max(0, $sinDetallar),
                    'impInternos' => $d['impInternos'] ?? $g->imp_internos, 'percDgi' => $d['percDgi'] ?? $g->perc_dgi, 'percDgr' => $d['percDgr'] ?? $g->perc_dgr]);
                if ($t['total'] <= 0) {
                    throw new ErrorDeNegocio('El importe del gasto tiene que ser mayor a 0.');
                }
                $patch += ['neto' => $t['neto'], 'iva' => $t['iva'], 'otros' => $t['otros'], 'imp_internos' => $t['impInternos'], 'perc_dgi' => $t['percDgi'], 'perc_dgr' => $t['percDgr'], 'total' => $t['total']];
            }
            $this->chequearDuplicado(array_key_exists('proveedor_id', $patch) ? $patch['proveedor_id'] : ($g->proveedor_id ? (int) $g->proveedor_id : null),
                $patch['letra'] ?? $g->letra, $patch['numero'] ?? $g->numero, $id);
        } elseif ($this->tocaImportes($d) || (array_key_exists('numero', $d) && $d['numero'] !== null) || array_key_exists('proveedorId', $d) || ! empty($d['items'])) {
            throw new ErrorDeNegocio('El gasto ya tiene pagos registrados: revertí el pago antes de cambiar importes, número o proveedor.');
        }
        if ($patch) {
            DB::table('gastos')->where('id', $id)->update([...$patch, 'updated_at' => now()]);
        }

        return $this->get($id);
    }

    public function anular(int $id, ?string $motivo): array
    {
        $g = DB::table('gastos')->find($id);
        if (! $g) {
            throw new NotFoundHttpException('Gasto inexistente.');
        }
        if ($g->estado === 'anulado') {
            throw new ErrorDeNegocio('Ya está anulado.');
        }
        if ((float) $g->pagado > self::EPS) {
            throw new ErrorDeNegocio('Tiene pagos registrados: revertilos primero — la plata que salió tiene que quedar rastreable.');
        }
        $nota = trim((string) $motivo);
        DB::table('gastos')->where('id', $id)->update(['estado' => 'anulado', 'updated_at' => now(),
            'observaciones' => $nota ? trim(($g->observaciones ? $g->observaciones."\n" : '').'Anulado: '.$nota) : $g->observaciones]);

        return $this->get($id);
    }

    /** Pagar este gasto: crea un PAGO AL PROVEEDOR y lo imputa en el mismo acto. */
    public function pagar(int $id, array $d, Sesion $sesion): array
    {
        $g = DB::table('gastos')->find($id);
        if (! $g) {
            throw new NotFoundHttpException('Gasto inexistente.');
        }
        if ($g->estado === 'anulado') {
            throw new ErrorDeNegocio('El gasto está anulado.');
        }
        $importe = Documentos::money($d['importe'] ?? 0);
        $this->pagos->crear([
            'destino' => 'gastos', 'proveedorId' => $g->proveedor_id, 'importe' => $importe, 'medio' => $d['medio'] ?? 'efectivo', 'fecha' => $d['fecha'] ?? null,
            'referencia' => $d['referencia'] ?? '', 'concepto' => $g->descripcion ?: 'Gasto #'.$g->id, 'sucursalId' => $g->sucursal_id, 'cajaSesionId' => $d['cajaSesionId'] ?? null,
            'usuarioId' => $sesion->usuarioId, 'operadorId' => $d['operadorId'] ?? null, 'formas' => $d['formas'] ?? [],
            'imputaciones' => [['gastoId' => $g->id, 'importe' => $importe]],
        ], $sesion->sucursalId, $sesion->esJefe());

        return $this->get($id);
    }

    /** Aplicar a este gasto un pago que YA existe. No mueve plata: la imputa. */
    public function aplicarPago(int $id, int $pagoId, float $importe, Sesion $sesion): array
    {
        $this->pagos->imputar($pagoId, [['gastoId' => $id, 'importe' => Documentos::money($importe)]], $sesion->usuarioId, $sesion->esJefe());

        return $this->get($id);
    }

    /* ---------------- Adjuntos ---------------- */

    /** El mime sale de los BYTES, no de lo que dijo el cliente: esto se sirve de vuelta desde el mismo origen. */
    public function subirAdjunto(int $gastoId, ?string $nombre, string $data): array
    {
        if (! DB::table('gastos')->where('id', $gastoId)->exists()) {
            throw new NotFoundHttpException('Gasto inexistente.');
        }
        if (! preg_match('#^data:([^;]+);base64,(.+)$#s', $data, $m)) {
            throw new ErrorDeNegocio('El comprobante tiene que llegar como data URL en base64.');
        }
        $buf = base64_decode($m[2], true);
        if ($buf === false) {
            throw new ErrorDeNegocio('El archivo no es base64 válido.');
        }
        if (strlen($buf) > self::MAX_ADJUNTO) {
            throw new ErrorDeNegocio('El archivo pesa '.number_format(strlen($buf) / 1048576, 1, ',', '').' MB y el máximo es 2,5 MB.');
        }
        $real = self::mimeReal($buf);
        if (! $real) {
            throw new ErrorDeNegocio('Ese archivo no es una foto JPG/PNG/WebP ni un PDF: no se pudo reconocer el contenido.');
        }
        if ($real !== $m[1]) {
            throw new ErrorDeNegocio('El archivo dice ser '.$m[1].' pero su contenido es '.$real.'.');
        }
        $id = DB::table('gasto_adjuntos')->insertGetId(['gasto_id' => $gastoId, 'nombre' => self::nombreSeguro((string) $nombre), 'mime' => $real, 'data' => base64_encode($buf), 'subido_en' => now()]);

        return Fila::camel(DB::table('gasto_adjuntos')->where('id', $id)->first(['id', 'nombre', 'mime', 'subido_en']));
    }

    /** @return array{mime:string, nombre:string, bytes:string} */
    public function adjunto(int $id): array
    {
        $a = DB::table('gasto_adjuntos')->find($id);
        if (! $a) {
            throw new NotFoundHttpException('Adjunto inexistente.');
        }

        return ['mime' => $a->mime, 'nombre' => self::nombreSeguro($a->nombre), 'bytes' => base64_decode($a->data)];
    }

    /** Con plata pagada contra el gasto, la foto es el respaldo de esa salida: no se borra. */
    public function borrarAdjunto(int $id): void
    {
        $a = DB::table('gasto_adjuntos')->find($id);
        if (! $a) {
            throw new NotFoundHttpException('Adjunto inexistente.');
        }
        $pagado = (float) DB::table('gastos')->where('id', $a->gasto_id)->value('pagado');
        if ($pagado > self::EPS) {
            throw new ErrorDeNegocio('El gasto ya tiene pagos registrados: el comprobante es el respaldo de esa salida y no se borra. Revertí el pago primero.');
        }
        DB::table('gasto_adjuntos')->where('id', $id)->delete();
    }

    public static function mimeReal(string $buf): ?string
    {
        if (str_starts_with($buf, "\xFF\xD8\xFF")) {
            return 'image/jpeg';
        }
        if (str_starts_with($buf, "\x89PNG\r\n\x1a\n")) {
            return 'image/png';
        }
        if (str_starts_with($buf, 'RIFF') && substr($buf, 8, 4) === 'WEBP') {
            return 'image/webp';
        }
        if (str_starts_with($buf, '%PDF-')) {
            return 'application/pdf';
        }

        return null;
    }

    public static function nombreSeguro(string $n, string $porDefecto = 'comprobante'): string
    {
        $n = preg_replace('/[^\w.\- ]+/u', '_', trim($n)) ?? '';
        $n = trim(mb_substr($n, 0, 120), '. ');

        return $n !== '' ? $n : $porDefecto;
    }

    /* ---------------- Gastos fijos ---------------- */

    public function listarRecurrentes(): array
    {
        return DB::table('gastos_recurrentes as r')->join('gasto_categorias as c', 'c.id', '=', 'r.categoria_id')->leftJoin('proveedores as p', 'p.id', '=', 'r.proveedor_id')
            ->orderBy('r.nombre')->get(['r.*', 'c.nombre as categoria_nombre', DB::raw("coalesce(p.nombre,'') as proveedor_nombre")])->map(fn ($r) => Fila::camel($r))->all();
    }

    public function crearRecurrente(array $d): array
    {
        $nombre = trim((string) ($d['nombre'] ?? ''));
        if ($nombre === '') {
            throw new ErrorDeNegocio('Poné un nombre (ej.: "Alquiler del local").');
        }
        if (! DB::table('gasto_categorias')->where('id', (int) ($d['categoriaId'] ?? 0))->exists()) {
            throw new ErrorDeNegocio('Elegí el rubro del gasto fijo.');
        }
        $id = DB::table('gastos_recurrentes')->insertGetId([
            'nombre' => mb_substr($nombre, 0, 160), 'categoria_id' => (int) $d['categoriaId'], 'proveedor_id' => (int) ($d['proveedorId'] ?? 0) ?: null, 'sucursal_id' => (int) ($d['sucursalId'] ?? 0) ?: null,
            'importe_estimado' => Documentos::money($d['importeEstimado'] ?? 0), 'frecuencia' => isset(self::FRECUENCIAS[$d['frecuencia'] ?? '']) ? $d['frecuencia'] : 'mensual',
            'dia_vencimiento' => min(max((int) ($d['diaVencimiento'] ?? 10) ?: 10, 1), 31), 'activo' => ($d['activo'] ?? true) !== false,
            'observaciones' => trim((string) ($d['observaciones'] ?? '')), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return collect($this->listarRecurrentes())->firstWhere('id', $id);
    }

    public function editarRecurrente(int $id, array $d): array
    {
        if (! DB::table('gastos_recurrentes')->where('id', $id)->exists()) {
            throw new NotFoundHttpException('Gasto fijo inexistente.');
        }
        $patch = [];
        if (array_key_exists('nombre', $d) && $d['nombre'] !== null) {
            $n = trim((string) $d['nombre']);
            if ($n === '') {
                throw new ErrorDeNegocio('El nombre no puede quedar vacío.');
            }
            $patch['nombre'] = mb_substr($n, 0, 160);
        }
        if (! empty($d['categoriaId'])) {
            $patch['categoria_id'] = (int) $d['categoriaId'];
        }
        if (array_key_exists('proveedorId', $d)) {
            $patch['proveedor_id'] = (int) ($d['proveedorId'] ?? 0) ?: null;
        }
        if (array_key_exists('sucursalId', $d)) {
            $patch['sucursal_id'] = (int) ($d['sucursalId'] ?? 0) ?: null;
        }
        if (array_key_exists('importeEstimado', $d) && $d['importeEstimado'] !== null) {
            $patch['importe_estimado'] = Documentos::money($d['importeEstimado']);
        }
        if (! empty($d['frecuencia']) && isset(self::FRECUENCIAS[$d['frecuencia']])) {
            $patch['frecuencia'] = $d['frecuencia'];
        }
        if (! empty($d['diaVencimiento'])) {
            $patch['dia_vencimiento'] = min(max((int) $d['diaVencimiento'], 1), 31);
        }
        if (array_key_exists('activo', $d) && $d['activo'] !== null) {
            $patch['activo'] = (bool) $d['activo'];
        }
        if (array_key_exists('observaciones', $d) && $d['observaciones'] !== null) {
            $patch['observaciones'] = trim((string) $d['observaciones']);
        }
        if ($patch) {
            DB::table('gastos_recurrentes')->where('id', $id)->update([...$patch, 'updated_at' => now()]);
        }

        return collect($this->listarRecurrentes())->firstWhere('id', $id);
    }

    /** Los gastos ya generados quedan: borrar la plantilla no borra la historia. */
    public function borrarRecurrente(int $id): void
    {
        if (! DB::table('gastos_recurrentes')->where('id', $id)->delete()) {
            throw new NotFoundHttpException('Gasto fijo inexistente.');
        }
    }

    private function inicioPeriodo(string $periodo): Carbon
    {
        if (! preg_match('/^(\d{4})-(\d{2})$/', trim($periodo), $m) || (int) $m[2] < 1 || (int) $m[2] > 12) {
            throw new ErrorDeNegocio('El período se indica como AAAA-MM (por ejemplo 2026-08).');
        }

        return Carbon::create((int) $m[1], (int) $m[2], 1, 0, 0, 0, Documentos::ZONA);
    }

    /**
     * Qué gastos fijos faltan emitir en un período y cuáles ya están. La
     * idempotencia se comprueba contra los GASTOS realmente emitidos por cada
     * plantilla (dentro de la ventana de su frecuencia), no contra un flag.
     */
    private function calcularPeriodo(string $periodo, bool $conCandado): array
    {
        $inicio = $this->inicioPeriodo($periodo);
        $qb = DB::table('gastos_recurrentes')->where('activo', true)->orderBy('nombre');
        $plantillas = $conCandado ? $qb->lockForUpdate()->get() : $qb->get();
        if ($plantillas->isEmpty()) {
            return ['periodo' => $periodo, 'inicio' => $inicio->toIso8601String(), 'pendientes' => [], 'emitidos' => []];
        }
        $emitidos = DB::table('gastos')->whereIn('recurrente_id', $plantillas->pluck('id'))->where('estado', '!=', 'anulado')->get(['id', 'recurrente_id', 'fecha']);
        $pendientes = [];
        $yaEstan = [];
        foreach ($plantillas as $p) {
            $meses = self::FRECUENCIAS[$p->frecuencia] ?? 1;
            // Desde el día 1 (setMonth no desborda desde un día 1) hasta el mes siguiente, exclusivo.
            $desde = $inicio->copy()->subMonthsNoOverflow($meses - 1)->utc();
            $hasta = $inicio->copy()->addMonthNoOverflow()->utc();
            $previo = $emitidos->first(function ($g) use ($p, $desde, $hasta) {
                $f = Carbon::parse($g->fecha);

                return (int) $g->recurrente_id === (int) $p->id && $f->gte($desde) && $f->lt($hasta);
            });
            if ($previo) {
                $yaEstan[] = ['plantilla' => Fila::camel($p), 'gastoId' => $previo->id, 'fecha' => Fila::iso($previo->fecha)];
            } else {
                $ultimo = $inicio->copy()->endOfMonth()->day;
                $venc = $inicio->copy()->day(min((int) $p->dia_vencimiento, $ultimo));
                $pendientes[] = ['plantilla' => Fila::camel($p), 'vencimiento' => $venc->toIso8601String()];
            }
        }

        return ['periodo' => $periodo, 'inicio' => $inicio->toIso8601String(), 'pendientes' => $pendientes, 'emitidos' => $yaEstan];
    }

    public function previsualizarPeriodo(string $periodo): array
    {
        return $this->calcularPeriodo($periodo, false);
    }

    /** Con candado sobre las plantillas: dos "Generar agosto" simultáneos no crean dos alquileres. */
    public function generarPeriodo(string $periodo, ?int $usuarioId, array $soloIds = []): array
    {
        $creados = DB::transaction(function () use ($periodo, $usuarioId, $soloIds) {
            $previa = $this->calcularPeriodo($periodo, true);
            $aGenerar = array_values(array_filter($previa['pendientes'], fn ($x) => ! $soloIds || in_array((int) $x['plantilla']['id'], array_map('intval', $soloIds), true)));
            $ids = [];
            foreach ($aGenerar as $x) {
                $p = $x['plantilla'];
                $ids[] = DB::table('gastos')->insertGetId([
                    'fecha' => Carbon::parse($previa['inicio'])->utc(), 'fecha_carga' => now(), 'tipo_doc' => 'factura', 'letra' => 'B', 'numero' => '',
                    'proveedor_id' => $p['proveedorId'], 'proveedor_texto' => '', 'categoria_id' => $p['categoriaId'], 'sucursal_id' => $p['sucursalId'],
                    'descripcion' => $p['nombre'].' · '.$periodo, 'condicion_pago' => 'cuenta_corriente', 'vencimiento' => Carbon::parse($x['vencimiento'])->utc(),
                    'neto' => Documentos::money($p['importeEstimado']), 'iva' => 0, 'otros' => 0, 'total' => Documentos::money($p['importeEstimado']), 'pagado' => 0, 'estado' => 'pendiente',
                    'recurrente_id' => $p['id'], 'observaciones' => 'Generado desde Gastos fijos. Corregí el importe cuando llegue el comprobante.', 'usuario_id' => $usuarioId,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            return $ids;
        });

        return ['creados' => count($creados), 'periodo' => $periodo, 'gastos' => $creados];
    }
}
