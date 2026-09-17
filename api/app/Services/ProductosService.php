<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Producto;
use App\Precios\CostoEntry;
use App\Precios\FilaVenta;
use App\Precios\OpcionesPrecio;
use App\Precios\Pricing;
use App\Support\Ean13;
use App\Support\Iva;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ProductosService
{
    private const ESTADOS_STOCK_VIVO = ['disponible', 'comprometido', 'retenido', 'en_transito'];

    public function __construct(
        private readonly ConfiguracionService $cfg,
        private readonly ListasService $listas,
        private readonly HistorialPreciosService $evolucion,
        private readonly AuditoriaService $audit,
    ) {}

    /* ============================ ARMADO ============================ */

    /**
     * Un producto con TODO derivado: nombres de catálogo, costo neto, formatos
     * de compra con su cadena, formato de venta hecho precio, y cada paquete con
     * lo suyo. Lo usan `/productos` y `/bootstrap`: una sola forma en todo el sistema.
     *
     * `$verCostos = false` recorta LOS IMPORTES (no las filas) de los formatos de
     * compra y el markup: el POS necesita los precios pero no el margen.
     */
    public function armar(Collection $prods, bool $verCostos = true): array
    {
        if ($prods->isEmpty()) {
            return [];
        }
        $ids = $prods->pluck('id')->all();
        $pres = DB::table('presentaciones')->whereIn('producto_id', $ids)->orderBy('tam_kg')->get()->groupBy('producto_id');
        $formatosCompra = DB::table('producto_proveedores')->whereIn('producto_id', $ids)->orderBy('id')->get()->groupBy('producto_id');
        $formatoVenta = DB::table('producto_listas')->whereIn('producto_id', $ids)->orderBy('id')->get();
        $etqs = DB::table('producto_etiquetas')->whereIn('producto_id', $ids)->get()->groupBy('producto_id');
        $cfg = $this->cfg->get('ventas');
        $cat = $this->listas->catalogo();
        $nombres = $this->catalogoPlano();

        $activas = array_values(array_filter($cat['listas'], fn ($l) => $l['activa']));
        $porListaId = [];
        foreach ($activas as $l) {
            $porListaId[$l['id']] = $l;
        }
        $base = collect($activas)->firstWhere('id', (int) $cfg['listaBaseId']) ?? ($activas[0] ?? null);

        $formatoDe = $formatoVenta->whereNull('presentacion_id')->groupBy('producto_id');
        $formatoPresDe = $formatoVenta->whereNotNull('presentacion_id')->groupBy('presentacion_id');

        // FORMATO DE VENTA hecho precio: madre y paquetes pasan por el mismo armado.
        $armarFormato = function (Collection $filas, float $costo, OpcionesPrecio $opts) use ($porListaId, $verCostos): array {
            $out = [];
            foreach ($filas as $f) {
                if (! isset($porListaId[$f->lista_id])) {
                    continue;
                }
                $l = $porListaId[$f->lista_id];
                $pv = Pricing::precioVentaFila($costo, FilaVenta::desde((array) $f), $opts);
                $out[] = [
                    'id' => $f->id, 'listaId' => $f->lista_id, 'modalidadId' => $l['modalidadId'], 'modalidad' => $l['modalidad'],
                    'numero' => $l['numero'], 'nombre' => $l['nombre'], 'etiqueta' => $l['etiqueta'], 'orden' => $l['orden'],
                    'modoPrecio' => $f->modo_precio, 'markup' => $verCostos ? (float) $f->markup : null, 'precioFijo' => (float) $f->precio_fijo,
                    'unidades' => (float) $f->unidades, 'codigoBarras' => $f->codigo_barras, 'unidadesMinimas' => (float) $f->unidades_minimas,
                    'precio' => $pv->netoUnitario, 'precioFinalUnitario' => $pv->finalUnitario, 'precioFinalFormato' => $pv->finalFormato,
                ];
            }
            usort($out, fn ($a, $b) => $a['orden'] <=> $b['orden']);

            return $out;
        };
        // El piso: lo que se paga sin que el ticket habilite nada.
        $filaPiso = fn (array $listas) => collect($listas)->firstWhere('listaId', $base['id'] ?? null) ?? ($listas[count($listas) - 1] ?? null);

        $out = [];
        foreach ($prods as $prod) {
            $p = $prod instanceof Producto ? $prod : Producto::query()->hydrate([(array) $prod])->first();
            $mios = ($formatosCompra[$p->id] ?? collect())->all();
            $activo = Pricing::formatoActivo($mios);
            $entry = $activo ? CostoEntry::desde((array) $activo) : null;
            $iva = (float) $p->iva;
            // Dos costos: el REAL (pantallas y valuación) y la BASE del markup.
            $costoNeto = Pricing::costoNetoEntry($entry, $iva);
            $costoPrecio = Pricing::costoPrecioEntry($entry, $iva);
            $opts = new OpcionesPrecio($iva, (float) ($p->redondeo ?? $cfg['redondeoPrecio']));
            $listasProd = $armarFormato($formatoDe[$p->id] ?? collect(), $costoPrecio, $opts);
            $misEtq = ($etqs[$p->id] ?? collect())->pluck('etiqueta_id')->map(fn ($x) => (int) $x)->all();

            $out[] = [
                ...$this->base($p),
                'marca' => $nombres['marca'][$p->marca_id] ?? '',
                'categoria' => $nombres['categoria'][$p->categoria_id] ?? '',
                'subcategoria' => $nombres['subcategoria'][$p->subcategoria_id] ?? '',
                'etiquetas' => $misEtq,
                'etiquetasNombres' => array_values(array_filter(array_map(fn ($id) => $nombres['etiqueta'][$id] ?? null, $misEtq))),
                'costoNeto' => $verCostos ? $costoNeto : null,
                'presentaciones' => ($pres[$p->id] ?? collect())->map(function ($pr) use ($costoNeto, $costoPrecio, $formatoPresDe, $armarFormato, $opts, $filaPiso, $verCostos) {
                    $tam = (float) $pr->tam_kg;
                    $suyas = $armarFormato($formatoPresDe[$pr->id] ?? collect(), Pricing::costoNetoPresentacion($costoPrecio, $tam), $opts);
                    $piso = $filaPiso($suyas);

                    return [
                        'id' => $pr->id, 'productoId' => $pr->producto_id, 'tamKg' => $tam, 'codigoBarras' => $pr->codigo_barras,
                        'costoNeto' => $verCostos ? Pricing::costoNetoPresentacion($costoNeto, $tam) : null,
                        'listas' => $suyas, 'sinFormato' => count($suyas) === 0,
                        // NULL = "no tiene precio" (el POS lo bloquea): un cero se vendería.
                        'precio' => $piso['precio'] ?? null, 'precioFinal' => $piso['precioFinalUnitario'] ?? null,
                    ];
                })->all(),
                'formatosCompra' => array_map(fn ($pv) => $verCostos
                    ? [...$this->formatoCompraPublico($pv), ...Pricing::costosFormato(CostoEntry::desde((array) $pv), $iva)->toArray(), 'costoNeto' => Pricing::costoNetoEntry(CostoEntry::desde((array) $pv), $iva)]
                    : ['id' => $pv->id, 'productoId' => $pv->producto_id, 'proveedorId' => $pv->proveedor_id, 'cantidad' => (float) $pv->cantidad,
                        'usarParaPrecio' => (bool) $pv->usar_para_precio, 'codigoProveedor' => $pv->codigo_proveedor], $mios),
                'listas' => $listasProd,
                'precio' => ($piso = $filaPiso($listasProd)) ? $piso['precio'] : null,
                'precioFinal' => $piso['precioFinalUnitario'] ?? null,
            ];
        }

        return $out;
    }

    private function base(Producto $p): array
    {
        return [
            'id' => $p->id, 'nombre' => $p->nombre, 'descripcion' => $p->descripcion ?? '',
            'codigoPropio' => $p->codigo_propio, 'codigoBarras' => $p->codigo_barras, 'dun' => $p->dun, 'unidadesPorBulto' => (float) $p->unidades_por_bulto,
            'etiquetaMarca' => $p->etiqueta_marca, 'etiquetaNombre' => $p->etiqueta_nombre,
            'marcaId' => $p->marca_id, 'categoriaId' => $p->categoria_id, 'subcategoriaId' => $p->subcategoria_id,
            'iva' => (float) $p->iva, 'tipo' => $p->tipo->value, 'estado' => $p->estado->value, 'estadoDesde' => $p->estado_desde?->toIso8601String(),
            'creadoEn' => $p->created_at?->toIso8601String(), 'motivoBaja' => $p->motivo_baja, 'soloFraccionar' => $p->solo_fraccionar,
            'stockMin' => (float) $p->stock_min, 'redondeo' => $p->redondeo, 'publicado' => $p->publicado, 'idExterno' => $p->id_externo,
            'imagenUrl' => $p->imagen_url, 'destacado' => $p->destacado, 'webStockMin' => (float) $p->web_stock_min,
        ];
    }

    private function formatoCompraPublico(object $pv): array
    {
        return [
            'id' => $pv->id, 'productoId' => $pv->producto_id, 'proveedorId' => $pv->proveedor_id, 'cantidad' => (float) $pv->cantidad,
            'costo' => (float) $pv->costo, 'descuento' => (float) $pv->descuento, 'descuento2' => (float) $pv->descuento2,
            'descuento3' => (float) $pv->descuento3, 'descuento4' => (float) $pv->descuento4, 'flete' => (float) $pv->flete,
            'modoCosto' => $pv->modo_costo, 'costoFinal' => (float) $pv->costo_final, 'porcSinFactura' => (float) $pv->porc_sin_factura,
            'usarParaPrecio' => (bool) $pv->usar_para_precio, 'codigoProveedor' => $pv->codigo_proveedor,
        ];
    }

    /** Diccionarios id → nombre de los cuatro catálogos, para resolver sin joins. */
    private function catalogoPlano(): array
    {
        return [
            'marca' => DB::table('marcas')->pluck('nombre', 'id')->all(),
            'categoria' => DB::table('categorias')->pluck('nombre', 'id')->all(),
            'subcategoria' => DB::table('subcategorias')->pluck('nombre', 'id')->all(),
            'etiqueta' => DB::table('etiquetas')->pluck('nombre', 'id')->all(),
        ];
    }

    public function listar(bool $verCostos = true): array
    {
        return $this->armar(Producto::query()->orderBy('nombre')->get(), $verCostos);
    }

    public function get(int $id, bool $verCostos = true): array
    {
        $p = Producto::query()->find($id);
        if (! $p) {
            throw new NotFoundHttpException('Producto inexistente.');
        }

        return $this->armar(collect([$p]), $verCostos)[0];
    }

    /* ============================ VALIDACIONES ============================ */

    private function validarCodigos(array $d, ?int $exceptoId = null): void
    {
        $campos = [
            ['código propio', trim((string) ($d['codigoPropio'] ?? ''))],
            ['código de barras', trim((string) ($d['codigoBarras'] ?? ''))],
            ['DUN', trim((string) ($d['dun'] ?? ''))],
        ];
        $usados = array_filter($campos, fn ($c) => $c[1] !== '');
        if (! $usados) {
            return;
        }
        $vistos = [];
        foreach ($usados as [$etq, $val]) {
            if (isset($vistos[$val])) {
                throw new ErrorDeNegocio('El '.$etq.' y el '.$vistos[$val].' no pueden ser iguales.');
            }
            $vistos[$val] = $etq;
        }
        $valores = array_column($usados, 1);
        $choque = DB::table('productos')
            ->when($exceptoId, fn ($q) => $q->where('id', '!=', $exceptoId))
            ->where(fn ($q) => $q->whereIn('codigo_propio', $valores)->orWhereIn('codigo_barras', $valores)->orWhereIn('dun', $valores))
            ->first(['id', 'nombre']);
        if ($choque) {
            throw new ErrorDeNegocio('Ese código ya lo usa el producto "'.$choque->nombre.'".');
        }
        if (DB::table('presentaciones')->whereIn('codigo_barras', $valores)->exists()) {
            throw new ErrorDeNegocio('Ese código ya lo usa una presentación de otro producto.');
        }
    }

    private function validarClasificacion(array $d): void
    {
        if (empty($d['subcategoriaId'])) {
            return;
        }
        $sub = DB::table('subcategorias')->find((int) $d['subcategoriaId']);
        if (! $sub) {
            throw new ErrorDeNegocio('Subcategoría inválida.');
        }
        if (! empty($d['categoriaId']) && (int) $sub->categoria_id !== (int) $d['categoriaId']) {
            throw new ErrorDeNegocio('La subcategoría no pertenece a esa categoría.');
        }
    }

    private function validarIva(mixed $iva): void
    {
        if ($iva !== null && ! Iva::esValida($iva)) {
            throw new ErrorDeNegocio('Alícuota de IVA inválida. Las válidas son: '.Iva::texto().'%.');
        }
    }

    /* ============================ CÓDIGOS ============================ */

    private function codigosEnUso(): array
    {
        $set = [];
        foreach (DB::table('productos')->get(['codigo_barras', 'codigo_propio', 'dun']) as $p) {
            foreach ([$p->codigo_barras, $p->codigo_propio, $p->dun] as $c) {
                if ($c) {
                    $set[$c] = true;
                }
            }
        }
        foreach (DB::table('presentaciones')->pluck('codigo_barras') as $c) {
            if ($c) {
                $set[$c] = true;
            }
        }
        foreach (DB::table('producto_listas')->pluck('codigo_barras') as $c) {
            if ($c) {
                $set[$c] = true;
            }
        }

        return $set;
    }

    /** Prefijo de la serie interna: uno que NO sea el de la balanza. */
    private function prefijoInterno(): string
    {
        $balanza = (string) ($this->cfg->get('ventas')['balanzaPrefijo'] ?: '20');
        foreach (Ean13::PREFIJOS_INTERNOS as $p) {
            if ($p !== $balanza) {
                return $p;
            }
        }

        return Ean13::PREFIJOS_INTERNOS[0];
    }

    public function siguienteEan13(array $excluir = []): array
    {
        $prefijo = $this->prefijoInterno();
        $usados = $this->codigosEnUso();
        foreach ($excluir as $c) {
            if ($c) {
                $usados[trim((string) $c)] = true;
            }
        }
        $ultima = 0;
        foreach (array_keys($usados) as $c) {
            $sec = Ean13::secuenciaDe($c, $prefijo);
            if ($sec !== null && $sec > $ultima) {
                $ultima = $sec;
            }
        }
        for ($i = 1; $i <= 1000; $i++) {
            $codigo = Ean13::armar($prefijo, $ultima + $i);
            if (! isset($usados[$codigo])) {
                return ['codigo' => $codigo, 'prefijo' => $prefijo];
            }
        }
        throw new ErrorDeNegocio('No encontré un código libre en la serie interna. Avisá: hay que ampliar el prefijo.');
    }

    public function siguienteCodigo(): array
    {
        $max = (int) DB::table('productos')->whereRaw("codigo_propio REGEXP '^[0-9]+$'")->selectRaw('COALESCE(MAX(CAST(codigo_propio AS UNSIGNED)), 0) m')->value('m');

        return ['codigo' => (string) ($max + 1)];
    }

    private function proximoCodigoPropio(): string
    {
        $max = 1000;
        foreach (DB::table('productos')->pluck('codigo_propio') as $c) {
            if (ctype_digit((string) $c) && (int) $c > $max) {
                $max = (int) $c;
            }
        }

        return (string) ($max + 1);
    }

    /* ============================ ABM ============================ */

    private function valores(array $d, ?Producto $previo = null): array
    {
        $limpiar = fn ($v) => $v === null ? null : trim((string) $v);

        return [
            'nombre' => trim($d['nombre']),
            'descripcion' => trim((string) ($d['descripcion'] ?? $previo?->descripcion ?? '')),
            'codigo_propio' => trim((string) ($d['codigoPropio'] ?? $previo?->codigo_propio ?? '')),
            'codigo_barras' => trim((string) ($d['codigoBarras'] ?? $previo?->codigo_barras ?? '')),
            'dun' => trim((string) ($d['dun'] ?? $previo?->dun ?? '')),
            'unidades_por_bulto' => (float) ($d['unidadesPorBulto'] ?? $previo?->unidades_por_bulto ?? 1) ?: 1,
            'etiqueta_marca' => array_key_exists('etiquetaMarca', $d) ? $limpiar($d['etiquetaMarca']) : $previo?->etiqueta_marca,
            'etiqueta_nombre' => array_key_exists('etiquetaNombre', $d) ? $limpiar($d['etiquetaNombre']) : $previo?->etiqueta_nombre,
            'marca_id' => $d['marcaId'] ?? null,
            'categoria_id' => $d['categoriaId'] ?? null,
            'subcategoria_id' => $d['subcategoriaId'] ?? null,
            'iva' => $d['iva'] ?? $previo?->iva ?? 21,
            'stock_min' => (float) ($d['stockMin'] ?? $previo?->stock_min ?? 0),
            'redondeo' => array_key_exists('redondeo', $d) ? $d['redondeo'] : $previo?->redondeo,
            'publicado' => $d['publicado'] ?? $previo?->publicado ?? false,
            'solo_fraccionar' => $d['soloFraccionar'] ?? $previo?->solo_fraccionar ?? false,
            'id_externo' => trim((string) ($d['idExterno'] ?? $previo?->id_externo ?? '')),
        ];
    }

    public function crear(array $d): array
    {
        if (! empty($d['soloFraccionar']) && empty($d['esGranel'])) {
            throw new ErrorDeNegocio('"Solo para fraccionar" es para productos a granel.');
        }
        $this->validarIva($d['iva'] ?? null);
        $this->validarClasificacion($d);
        $this->validarCodigos($d);
        $prov = null;
        if (! empty($d['proveedorId'])) {
            $prov = DB::table('proveedores')->find((int) $d['proveedorId']);
            if (! $prov) {
                throw new ErrorDeNegocio('El proveedor elegido no existe.');
            }
        }
        $valores = $this->valores($d);
        if ($valores['codigo_propio'] === '') {
            $valores['codigo_propio'] = $this->proximoCodigoPropio();
        }
        $p = DB::transaction(function () use ($valores, $d, $prov) {
            $p = Producto::query()->create([...$valores, 'tipo' => ! empty($d['esGranel']) ? 'granel' : 'entero']);
            if (! empty($d['etiquetas'])) {
                $this->setEtiquetas($p->id, $d['etiquetas']);
            }
            if ($prov) {
                DB::table('producto_proveedores')->insert([
                    'producto_id' => $p->id, 'proveedor_id' => $prov->id, 'cantidad' => 1,
                    'costo' => (float) ($d['costoInicial'] ?? 0), 'descuento' => (float) ($d['descuento'] ?? 0),
                    'descuento2' => (float) ($d['descuento2'] ?? 0), 'descuento3' => (float) ($d['descuento3'] ?? 0), 'descuento4' => (float) ($d['descuento4'] ?? 0),
                    'flete' => (float) ($d['flete'] ?? 0), 'codigo_proveedor' => trim((string) ($d['codigoProveedor'] ?? '')),
                    'usar_para_precio' => true, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            return $p;
        });

        return $this->get($p->id);
    }

    public function editar(Producto $p, array $d): array
    {
        if (! empty($d['soloFraccionar']) && ! $p->esGranel()) {
            throw new ErrorDeNegocio('"Solo para fraccionar" es para productos a granel.');
        }
        $this->validarIva($d['iva'] ?? null);
        $this->validarClasificacion($d);
        $this->validarCodigos($d, $p->id);
        $p->update($this->valores($d, $p));
        if (array_key_exists('etiquetas', $d) && is_array($d['etiquetas'])) {
            $this->setEtiquetas($p->id, $d['etiquetas']);
        }

        return $this->get($p->id);
    }

    public function guardarCartel(Producto $p, array $d): array
    {
        $limpiar = fn ($v) => $v === null ? null : trim((string) $v);
        $patch = [];
        if (array_key_exists('etiquetaMarca', $d)) {
            $patch['etiqueta_marca'] = $limpiar($d['etiquetaMarca']);
        }
        if (array_key_exists('etiquetaNombre', $d)) {
            $patch['etiqueta_nombre'] = $limpiar($d['etiquetaNombre']);
        }
        if ($patch) {
            $p->update($patch);
        }

        return $this->get($p->id);
    }

    public function setEtiquetas(int $id, array $ids): void
    {
        $limpios = array_values(array_unique(array_filter(array_map('intval', $ids))));
        DB::transaction(function () use ($id, $limpios) {
            DB::table('producto_etiquetas')->where('producto_id', $id)->delete();
            if ($limpios) {
                DB::table('producto_etiquetas')->insert(array_map(fn ($e) => ['producto_id' => $id, 'etiqueta_id' => $e], $limpios));
            }
        });
    }

    /** Documentos que referencian al producto: con historia no se borra, se da de baja. */
    private function huellas(int $id): array
    {
        $cuenta = fn (string $tabla) => Schema::hasTable($tabla) ? DB::table($tabla)->where('producto_id', $id)->count() : 0;
        $lista = [];
        foreach ([
            ['venta_items', 'venta(s)'], ['comprobante_items', 'renglón(es) de compra'], ['presupuesto_items', 'presupuesto(s)'],
            ['transferencia_items', 'transferencia(s)'], ['incidencias', 'incidencia(s)'], ['vencimientos', 'registro(s) de vencimiento'],
            ['movimientos', 'movimiento(s) de stock'],
        ] as [$tabla, $que]) {
            $n = $cuenta($tabla);
            if ($n) {
                $lista[] = $n.' '.$que;
            }
        }

        return $lista;
    }

    public function cambiarEstado(Producto $p, string $estado, ?string $motivo = null): array
    {
        if ($p->estado->value === $estado) {
            return $this->get($p->id);
        }
        if ($estado === 'archivado') {
            $filas = DB::table('stock')->where('producto_id', $p->id)->where('cantidad', '>', 1e-9)->whereIn('estado', self::ESTADOS_STOCK_VIVO)->get();
            if ($filas->isNotEmpty()) {
                $sucs = DB::table('sucursales')->pluck('nombre', 'id');
                $detalle = $filas->take(4)->map(fn ($f) => rtrim(rtrim(number_format((float) $f->cantidad, 3, '.', ''), '0'), '.').' en '.($sucs[$f->sucursal_id] ?? 'sucursal '.$f->sucursal_id).($f->presentacion_id ? ' (fraccionado)' : ''))->implode(', ');
                throw new ErrorDeNegocio('Todavía queda stock: '.$detalle.'. Archivado no se puede vender — liquidalo primero (una oferta) o dalo de baja por merma. Mientras tanto podés dejarlo "discontinuado": deja de comprarse pero se sigue vendiendo hasta agotar.');
            }
        }
        $p->update(['estado' => $estado, 'estado_desde' => now(), 'motivo_baja' => $estado === 'activo' ? '' : trim((string) $motivo)]);

        return $this->get($p->id);
    }

    public function sugerenciasArchivado(): array
    {
        $dias = 30;
        $corte = now()->subDays($dias);
        $filas = DB::table('productos as p')
            ->where('p.estado', 'discontinuado')
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('stock as s')->whereColumn('s.producto_id', 'p.id')->where('s.cantidad', '>', 1e-9)->whereIn('s.estado', self::ESTADOS_STOCK_VIVO))
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('movimientos as m')->whereColumn('m.producto_id', 'p.id')->where('m.fecha', '>=', $corte))
            ->orderBy('p.nombre')
            ->get(['p.id', 'p.nombre', 'p.codigo_propio', 'p.motivo_baja', 'p.estado_desde'])
            ->map(fn ($f) => [
                'id' => $f->id, 'nombre' => $f->nombre, 'codigoPropio' => $f->codigo_propio, 'motivoBaja' => $f->motivo_baja, 'estadoDesde' => $f->estado_desde,
                'ultimoMovimiento' => DB::table('movimientos')->where('producto_id', $f->id)->max('fecha'),
            ])->all();

        return ['diasGracia' => $dias, 'productos' => $filas];
    }

    public function archivarLote(array $ids, ?string $motivo = null): array
    {
        $limpios = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (! $limpios) {
            throw new ErrorDeNegocio('No hay productos para archivar.');
        }
        $archivados = [];
        $omitidos = [];
        foreach ($limpios as $id) {
            $p = Producto::query()->find($id);
            if (! $p) {
                $omitidos[] = ['nombre' => (string) $id, 'razon' => 'no existe'];

                continue;
            }
            try {
                $this->cambiarEstado($p, 'archivado', trim((string) $motivo) ?: 'Discontinuado y sin stock');
                $archivados[] = $p->nombre;
            } catch (ErrorDeNegocio $e) {
                $omitidos[] = ['nombre' => $p->nombre, 'razon' => $e->getMessage()];
            }
        }

        return ['archivados' => $archivados, 'omitidos' => $omitidos];
    }

    public function borrar(Producto $p): void
    {
        if (DB::table('stock')->where('producto_id', $p->id)->where('cantidad', '>', 1e-9)->exists()) {
            throw new ErrorDeNegocio('No se puede eliminar: el producto tiene stock. Si ya no se trae más, dalo de baja (se sigue vendiendo hasta agotar) en lugar de borrarlo.');
        }
        $huellas = $this->huellas($p->id);
        if ($huellas) {
            throw new ErrorDeNegocio('No se puede eliminar: el producto ya tiene historia ('.implode(', ', $huellas).'). Borrarlo dejaría documentos viejos incompletos. Dalo de baja: deja de aparecer y se puede reactivar cuando vuelvas a traerlo, conservando precios e historial.');
        }
        DB::transaction(function () use ($p) {
            DB::table('stock')->where('producto_id', $p->id)->delete();
            $p->delete();
        });
    }

    /* ============================ PRESENTACIONES ============================ */

    public function setPresentaciones(Producto $p, array $items): array
    {
        if (! $p->esGranel()) {
            throw new ErrorDeNegocio('Solo los productos a granel tienen presentaciones.');
        }
        $valid = [];
        foreach ($items as $x) {
            if ((float) ($x['tamKg'] ?? 0) > 0) {
                $valid[] = ['id' => (int) ($x['id'] ?? 0) ?: null, 'tamKg' => (float) $x['tamKg'], 'codigoBarras' => trim((string) ($x['codigoBarras'] ?? ''))];
            }
        }
        $previas = DB::table('presentaciones')->where('producto_id', $p->id)->get()->keyBy('id');
        $comoDice = fn (float $kg) => $kg < 1 ? round($kg * 1000).' g' : rtrim(rtrim(number_format($kg, 3, '.', ''), '0'), '.').' kg';
        foreach ($valid as $v) {
            $antes = $v['id'] ? ($previas[$v['id']]->codigo_barras ?? '') : null;
            if ($antes === $v['codigoBarras']) {
                continue; // no lo tocó: no se juzga
            }
            if ($v['codigoBarras'] === '') {
                if ($antes === null) {
                    throw new ErrorDeNegocio('La presentación de '.$comoDice($v['tamKg']).' necesita un código de barras: es el que la caja escanea en el paquete. Con el botón "Generar" sale uno propio.');
                }

                continue; // se lo saca a propósito
            }
            if (! Ean13::esValido($v['codigoBarras'])) {
                throw new ErrorDeNegocio('El código "'.$v['codigoBarras'].'" de la presentación de '.$comoDice($v['tamKg']).' no es un EAN-13 válido: son 13 dígitos y el último es el verificador. Copiá el del fabricante o usá "Generar".');
            }
        }
        $codigos = array_values(array_filter(array_column($valid, 'codigoBarras')));
        if (count(array_unique($codigos)) !== count($codigos)) {
            throw new ErrorDeNegocio('Hay dos presentaciones con el mismo código de barras.');
        }
        if ($codigos) {
            $ajeno = DB::table('productos')->where(fn ($q) => $q->whereIn('codigo_propio', $codigos)->orWhereIn('codigo_barras', $codigos)->orWhereIn('dun', $codigos))->first(['nombre']);
            if ($ajeno) {
                throw new ErrorDeNegocio('Ese código ya lo usa el producto "'.$ajeno->nombre.'".');
            }
            $otra = DB::table('presentaciones as pr')->join('productos as p', 'p.id', '=', 'pr.producto_id')
                ->where('pr.producto_id', '!=', $p->id)->whereIn('pr.codigo_barras', $codigos)->first(['pr.tam_kg', 'p.nombre']);
            if ($otra) {
                throw new ErrorDeNegocio('Ese código ya lo usa la presentación de '.$comoDice((float) $otra->tam_kg).' de "'.$otra->nombre.'".');
            }
            $formato = DB::table('producto_listas as pl')->join('productos as p', 'p.id', '=', 'pl.producto_id')
                ->whereIn('pl.codigo_barras', $codigos)->first(['p.nombre', 'pl.unidades']);
            if ($formato) {
                throw new ErrorDeNegocio('Ese código ya lo usa el formato de venta de "'.$formato->nombre.'" (×'.(float) $formato->unidades.').');
            }
        }
        DB::transaction(function () use ($p, $valid, $previas, $comoDice) {
            $vigentes = array_flip(array_filter(array_column($valid, 'id')));
            foreach ($previas as $vieja) {
                if (isset($vigentes[$vieja->id])) {
                    continue;
                }
                if (DB::table('stock')->where('presentacion_id', $vieja->id)->where('cantidad', '>', 1e-9)->exists()) {
                    throw new ErrorDeNegocio('La presentación de '.$comoDice((float) $vieja->tam_kg).' tiene paquetes en stock: no se puede borrar. Vendé o ajustá ese stock primero.');
                }
                DB::table('presentaciones')->where('id', $vieja->id)->delete();
            }
            foreach ($valid as $v) {
                if ($v['id'] && isset($previas[$v['id']])) {
                    $vieja = $previas[$v['id']];
                    if (abs((float) $vieja->tam_kg - $v['tamKg']) > 1e-9 && DB::table('stock')->where('presentacion_id', $v['id'])->where('cantidad', '>', 1e-9)->exists()) {
                        throw new ErrorDeNegocio('La presentación de '.$comoDice((float) $vieja->tam_kg).' tiene paquetes en stock: no se le puede cambiar el tamaño (cambiaría el costo y la equivalencia en granel de lo que ya está cargado). Creá la presentación con el tamaño correcto y dale de baja a esta.');
                    }
                    DB::table('presentaciones')->where('id', $v['id'])->update(['tam_kg' => $v['tamKg'], 'codigo_barras' => $v['codigoBarras'], 'updated_at' => now()]);
                } else {
                    DB::table('presentaciones')->insert(['producto_id' => $p->id, 'tam_kg' => $v['tamKg'], 'codigo_barras' => $v['codigoBarras'], 'created_at' => now(), 'updated_at' => now()]);
                }
            }
        });

        return $this->get($p->id);
    }

    /* ============================ FORMATOS DE COMPRA ============================ */

    public function setFormatosCompra(Producto $p, array $filas, ?int $usuarioAudit = null): array
    {
        $validas = array_values(array_filter($filas, fn ($f) => (int) ($f['proveedorId'] ?? 0) > 0));
        foreach ($validas as $f) {
            if (! ((float) ($f['cantidad'] ?? 0) > 0)) {
                throw new ErrorDeNegocio('La cantidad por bulto tiene que ser mayor a cero.');
            }
        }
        $activo = 0;
        foreach ($validas as $i => $f) {
            if (! empty($f['usarParaPrecio'])) {
                $activo = $i;
                break;
            }
        }
        $existentes = DB::table('producto_proveedores')->where('producto_id', $p->id)->get()->keyBy('id');
        $plata = fn ($v, float $tope = 1000000000) => (is_numeric($v) && (float) $v > 0) ? min((float) $v, $tope) : 0.0;
        $pct = fn ($v) => (is_numeric($v) && (float) $v > 0) ? min((float) $v, 100) : 0.0;
        $valores = fn (array $f, int $i) => [
            'producto_id' => $p->id, 'proveedor_id' => (int) $f['proveedorId'], 'cantidad' => $plata($f['cantidad'] ?? 1, 1000000) ?: 1,
            'costo' => $plata($f['costo'] ?? 0), 'descuento' => $pct($f['descuento'] ?? 0), 'descuento2' => $pct($f['descuento2'] ?? 0),
            'descuento3' => $pct($f['descuento3'] ?? 0), 'descuento4' => $pct($f['descuento4'] ?? 0), 'flete' => $plata($f['flete'] ?? 0),
            'modo_costo' => ($f['modoCosto'] ?? '') === 'final' ? 'final' : 'lista', 'costo_final' => $plata($f['costoFinal'] ?? 0),
            'porc_sin_factura' => $pct($f['porcSinFactura'] ?? 0), 'usar_para_precio' => $i === $activo,
            'codigo_proveedor' => trim((string) ($f['codigoProveedor'] ?? '')),
        ];
        $dinero = fn ($n) => '$ '.number_format((float) $n, 2, ',', '.');
        $foto = function (array|object $v) use ($dinero): array {
            $v = (array) $v;
            $descs = array_filter(array_map(fn ($d) => (float) $d, [$v['descuento'] ?? 0, $v['descuento2'] ?? 0, $v['descuento3'] ?? 0, $v['descuento4'] ?? 0]), fn ($d) => $d > 0);

            return [
                'cantidad' => (float) ($v['cantidad'] ?? 1).' u.',
                'costo' => ($v['modo_costo'] ?? 'lista') === 'final' ? $dinero($v['costo_final'] ?? 0) : $dinero($v['costo'] ?? 0),
                'modoCosto' => ($v['modo_costo'] ?? 'lista') === 'final' ? 'Costo final — se le quitan los descuentos' : 'Costo de lista — el sistema descuenta',
                'descuentos' => $descs ? implode(' + ', array_map(fn ($d) => $d.'%', $descs)) : 'Sin descuentos',
                'flete' => (float) ($v['flete'] ?? 0).'%', 'porcSinFactura' => (float) ($v['porc_sin_factura'] ?? 0).'%',
                'usarParaPrecio' => ! empty($v['usar_para_precio']) ? 'Sí' : 'No', 'codigoProveedor' => (string) ($v['codigo_proveedor'] ?? ''),
            ];
        };
        $campos = ['cantidad' => 'Unidades por bulto', 'costo' => 'Costo del bulto', 'modoCosto' => 'Cómo se carga el costo', 'descuentos' => 'Descuentos',
            'flete' => 'Flete %', 'porcSinFactura' => 'Sin factura %', 'usarParaPrecio' => 'Fija el precio', 'codigoProveedor' => 'Código del proveedor'];
        $resumen = function (array|object $v) use ($foto): string {
            $f = $foto($v);

            return 'bulto '.$f['cantidad'].' · '.$f['costo'].' · flete '.$f['flete'].' · sin factura '.$f['porcSinFactura'];
        };
        $baseAudit = fn (int $proveedorId) => ['entidad' => 'proveedor', 'entidadId' => $proveedorId, 'ambito' => 'Formato de compra', 'detalle' => $p->nombre, 'usuarioId' => $usuarioAudit];
        $enviados = array_flip(array_filter(array_map(fn ($f) => (int) ($f['id'] ?? 0), $validas), fn ($id) => isset($existentes[$id])));

        DB::transaction(function () use ($p, $validas, $existentes, $enviados, $valores, $foto, $campos, $resumen, $baseAudit, $plata) {
            $cambios = [];
            foreach ($existentes as $e) {
                if (! isset($enviados[$e->id])) {
                    $cambios[] = [...$baseAudit($e->proveedor_id), 'campo' => 'Formato', 'antes' => $resumen($e), 'despues' => '(quitado)'];
                    DB::table('producto_proveedores')->where('id', $e->id)->delete();
                }
            }
            foreach ($validas as $i => $f) {
                $fid = (int) ($f['id'] ?? 0);
                $v = $valores($f, $i);
                if (isset($existentes[$fid])) {
                    $cambios = [...$cambios, ...$this->audit->diferencias($baseAudit($v['proveedor_id']), $foto($existentes[$fid]), $foto($v), $campos)];
                    DB::table('producto_proveedores')->where('id', $fid)->update([...$v, 'updated_at' => now()]);
                } else {
                    $cambios[] = [...$baseAudit($v['proveedor_id']), 'campo' => 'Formato', 'antes' => '(no estaba)', 'despues' => $resumen($v)];
                    DB::table('producto_proveedores')->insert([...$v, 'created_at' => now(), 'updated_at' => now()]);
                }
            }
            $this->audit->registrar($cambios);
            // Un entero sin bulto declarado lo hereda del único formato que lo trae.
            if (! $p->esGranel() && ! ((float) $p->unidades_por_bulto > 1)) {
                $bultos = array_values(array_unique(array_filter(array_map(fn ($f) => $plata($f['cantidad'] ?? 1, 1000000) ?: 1, $validas), fn ($c) => $c > 1)));
                if (count($bultos) === 1) {
                    $p->update(['unidades_por_bulto' => $bultos[0]]);
                }
            }
        });
        $this->evolucion->snapshot([$p->id], 'formato_compra');

        return $this->get($p->id);
    }

    /* ============================ FORMATO DE VENTA ============================ */

    public function setListas(Producto $p, array $items): array
    {
        $this->listas->setFormato($p->id, $items);
        $this->evolucion->snapshot([$p->id], 'formato_venta');

        return $this->get($p->id);
    }

    public function setListasPresentacion(int $presId, array $items): array
    {
        $pr = DB::table('presentaciones')->find($presId);
        if (! $pr) {
            throw new NotFoundHttpException('Presentación inexistente.');
        }
        $this->listas->setFormatoPresentacion($presId, $items);

        return $this->get($pr->producto_id);
    }
}
