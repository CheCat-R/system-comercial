<?php

namespace App\Inventario;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Presentacion;
use App\Models\Producto;
use App\Precios\CostoEntry;
use App\Precios\FilaVenta;
use App\Precios\OpcionesPrecio;
use App\Precios\Pricing;
use App\Services\ConfiguracionService;
use Illuminate\Support\Facades\DB;

/**
 * NÚCLEO DE STOCK — lo que comparten todas las operaciones del inventario.
 *
 * Modelo SIN LOTE: Producto × Sucursal × Presentación × Estado. Todo lo que
 * muta stock corre dentro de una transacción (la abre quien llama) y deja un
 * movimiento. Los deltas son RELATIVOS en SQL (`cantidad = cantidad + δ`),
 * nunca un valor absoluto calculado en memoria: con el absoluto, dos
 * operaciones concurrentes sobre la misma fila se pisaban en silencio.
 */
abstract class StockCore
{
    public const EPS = 1e-9;

    /** Metadatos de tipos de movimiento simple (dir: +1 entrada, −1 salida, 0 contextual). */
    public const TIPOS_MOV = [
        'compra' => ['label' => 'Compra', 'dir' => 1],
        'fraccionamiento' => ['label' => 'Fraccionamiento', 'dir' => 0],
        'venta_granel' => ['label' => 'Venta a granel', 'dir' => -1],
        'venta_fraccionada' => ['label' => 'Venta fraccionada', 'dir' => -1],
        'devolucion' => ['label' => 'Devolución', 'dir' => 1],
        'ajuste' => ['label' => 'Ajuste', 'dir' => 0],
        'merma' => ['label' => 'Merma', 'dir' => -1],
        'vencido' => ['label' => 'Producto vencido', 'dir' => -1],
        'defectuoso' => ['label' => 'Producto defectuoso', 'dir' => -1],
        'transferencia' => ['label' => 'Transferencia', 'dir' => 0],
    ];

    public function __construct(protected readonly ConfiguracionService $cfg) {}

    /* ------------------------- Utilidades de dominio ------------------------- */

    protected function fmtTam(float $kg): string
    {
        return $kg < 1 ? round($kg * 1000).' g' : rtrim(rtrim(number_format($kg, 3, '.', ''), '0'), '.').' kg';
    }

    protected function unidadDe(string $tipo, ?int $presId): string
    {
        return ($tipo === 'granel' && ! $presId) ? 'kg' : 'u';
    }

    protected function fmtCant(string $tipo, ?int $presId, float $cant): string
    {
        if ($this->unidadDe($tipo, $presId) === 'kg') {
            return $this->num($cant).' kg';
        }

        return round($cant).' '.($presId ? 'paq.' : 'u.');
    }

    /** Número sin ceros de más ("12", "0.5"), como lo imprime JS. */
    protected function num(float $n): string
    {
        return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.') ?: '0';
    }

    /* ------------------------- Núcleo de stock ------------------------- */

    /** @return array{producto_id:int, sucursal_id:int, presentacion_id:?int, estado:string} */
    protected function coord(int $productoId, int $sucursalId, ?int $presId, string $estado): array
    {
        return ['producto_id' => $productoId, 'sucursal_id' => $sucursalId, 'presentacion_id' => $presId ?: null, 'estado' => $estado];
    }

    protected function entrada(array $c): ?object
    {
        return DB::table('stock')
            ->where('producto_id', $c['producto_id'])
            ->where('sucursal_id', $c['sucursal_id'])
            ->when($c['presentacion_id'] === null, fn ($q) => $q->whereNull('presentacion_id'), fn ($q) => $q->where('presentacion_id', $c['presentacion_id']))
            ->where('estado', $c['estado'])
            ->first();
    }

    protected function entradaOCrear(array $c): object
    {
        $e = $this->entrada($c);
        if ($e) {
            return $e;
        }
        $id = DB::table('stock')->insertGetId([...$c, 'cantidad' => 0, 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('stock')->find($id);
    }

    protected function cant(int $productoId, int $sucursalId, ?int $presId, string $estado): float
    {
        $e = $this->entrada($this->coord($productoId, $sucursalId, $presId, $estado));

        return $e ? (float) $e->cantidad : 0.0;
    }

    /** Suma (o resta) a una coordenada. Es el ÚNICO lugar por donde pasa todo aumento de stock. */
    protected function addDelta(array $c, float $delta): void
    {
        $e = $this->entradaOCrear($c);
        DB::table('stock')->where('id', $e->id)->update(['cantidad' => DB::raw('cantidad + '.$this->sql($delta)), 'updated_at' => now()]);
        if ($delta > 0 && $c['estado'] === 'disponible') {
            $this->despertarArchivado($c['producto_id']);
        }
    }

    /**
     * ENTRÓ MERCADERÍA DE UN PRODUCTO ARCHIVADO → vuelve a discontinuado.
     * "Archivado con stock" es un estado imposible: mercadería que existe y que
     * el sistema no deja vender. Va acá porque es el único lugar por donde
     * pasa todo aumento de stock. Vuelve a discontinuado y no a activo: que
     * reaparezca una unidad no significa que se haya vuelto a comprar.
     */
    protected function despertarArchivado(int $productoId): void
    {
        DB::table('productos')->where('id', $productoId)->where('estado', 'archivado')->update([
            'estado' => 'discontinuado',
            'estado_desde' => now(),
            'motivo_baja' => 'Volvió a haber stock (devolución, anulación o ajuste): se reabrió para poder venderlo',
        ]);
    }

    /**
     * MUEVE STOCK DE UN ESTADO A OTRO, o **corta la operación entera**. Lanza
     * en vez de devolver false: está siempre dentro de una transacción, así que
     * si la mercadería no está, el documento no se emite. El WHERE re-verifica
     * el saldo EN el UPDATE: si otra transacción se llevó el stock entre la
     * lectura y acá, no descuenta de más.
     */
    protected function move(int $productoId, int $sucursalId, ?int $presId, string $desde, string $hacia, float $c): void
    {
        $from = $this->entradaOCrear($this->coord($productoId, $sucursalId, $presId, $desde));
        if ((float) $from->cantidad + self::EPS < $c) {
            $this->sinStock($desde, (float) $from->cantidad, $c);
        }
        $filas = DB::table('stock')->where('id', $from->id)
            ->whereRaw('cantidad >= '.$this->sql($c - self::EPS))
            ->update(['cantidad' => DB::raw('cantidad - '.$this->sql($c)), 'updated_at' => now()]);
        if (! $filas) {
            $this->sinStock($desde, (float) $from->cantidad, $c);
        }
        $to = $this->entradaOCrear($this->coord($productoId, $sucursalId, $presId, $hacia));
        DB::table('stock')->where('id', $to->id)->update(['cantidad' => DB::raw('cantidad + '.$this->sql($c)), 'updated_at' => now()]);
    }

    /** Un solo mensaje para las dos salidas de `move`, en castellano de mostrador. */
    protected function sinStock(string $estado, float $hay, float $pedido): never
    {
        $donde = [
            'disponible' => 'disponible', 'comprometido' => 'comprometido',
            'en_transito' => 'en tránsito', 'retenido' => 'retenido',
            'defectuoso' => 'como defectuoso', 'vencido' => 'como vencido',
        ];
        throw new ErrorDeNegocio(
            'No hay stock '.($donde[$estado] ?? $estado).' suficiente: hay '.$this->num(round($hay * 1000) / 1000)
            .' y hacen falta '.$this->num($pedido).'. La operación no se registró.'
        );
    }

    /** Literal numérico seguro para SQL crudo. */
    private function sql(float $n): string
    {
        return sprintf('%.9F', $n);
    }

    /* ------------------------- Movimiento ------------------------- */

    protected function mov(array $campos): object
    {
        $id = DB::table('movimientos')->insertGetId([
            'fecha' => $campos['fecha'] ?? now(),
            'tipo' => $campos['tipo'],
            'producto_id' => $campos['producto_id'] ?? null,
            'sucursal_id' => $campos['sucursal_id'] ?? null,
            'presentacion_id' => $campos['presentacion_id'] ?? null,
            'signo' => $campos['signo'] ?? 0,
            'cantidad' => $campos['cantidad'] ?? 0,
            'unidad' => $campos['unidad'] ?? '',
            'motivo' => $campos['motivo'] ?? '',
            'pres_label' => $campos['pres_label'] ?? '',
            'estado_desde' => $campos['estado_desde'] ?? null,
            'estado_hacia' => $campos['estado_hacia'] ?? null,
            'sucursal_destino_id' => $campos['sucursal_destino_id'] ?? null,
            'vencimiento' => $campos['vencimiento'] ?? null,
            'costo_unitario' => $campos['costo_unitario'] ?? 0,
            'proveedor_nombre' => $campos['proveedor_nombre'] ?? '',
            'usuario_id' => $campos['usuario_id'] ?? null,
            'ref_transferencia_id' => $campos['ref_transferencia_id'] ?? null,
            'ref_incidencia_id' => $campos['ref_incidencia_id'] ?? null,
            'ref_conteo_id' => $campos['ref_conteo_id'] ?? null,
            'descripcion' => $campos['descripcion'] ?? '',
        ]);

        return DB::table('movimientos')->find($id);
    }

    protected function producto(int $id): ?Producto
    {
        return Producto::query()->find($id);
    }

    protected function distribuidoraId(): ?int
    {
        return DB::table('sucursales')->where('tipo', 'distribuidora')->value('id');
    }

    /* ------------------------- Costos / precios ------------------------- */

    /** El formato activo de un producto (fila de producto_proveedores) o null. */
    protected function formatoActivoDe(int $productoId): ?object
    {
        $filas = DB::table('producto_proveedores')->where('producto_id', $productoId)->orderBy('id')->get()->all();

        return Pricing::formatoActivo($filas);
    }

    /**
     * COSTO CONGELADO DE UNA PÉRDIDA. Toda baja por pérdida (merma, vencido,
     * defectuoso) guarda el costo del día en el movimiento: el reporte en pesos
     * de marzo no puede cambiar en julio porque subió el catálogo.
     */
    protected function costoDePerdida(Producto $prod, ?int $presId): float
    {
        $activo = $this->formatoActivoDe($prod->id);
        $cnKg = Pricing::costoNetoEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $prod->iva);
        if (! $presId) {
            return $cnKg;
        }
        $tam = (float) (DB::table('presentaciones')->where('id', $presId)->value('tam_kg') ?? 1);

        return $cnKg * ($tam ?: 1);
    }

    /**
     * Contexto para cotizar un producto con la lista BASE (el piso del
     * sistema). Los movimientos internos no tienen cliente ni ticket: van
     * siempre al piso. El precio por cliente lo resuelve el punto de venta.
     */
    protected function ctxPrecio(int $productoId): array
    {
        $prod = $this->producto($productoId);
        if (! $prod) {
            return ['cn' => 0.0, 'iva' => 0.0, 'markup' => 0.0, 'tieneLista' => false, 'redondeo' => 0, 'listaBaseId' => null];
        }
        $cfg = $this->cfg->get('ventas');
        $listas = DB::table('listas_venta')->where('activa', true)->orderBy('orden')->orderBy('id')->get();
        $activas = $listas->pluck('id')->all();
        $formato = DB::table('producto_listas')->where('producto_id', $productoId)->whereNull('presentacion_id')
            ->whereIn('lista_id', $activas)->get();
        $base = $listas->firstWhere('id', (int) $cfg['listaBaseId']) ?? $listas->first();

        // La del piso si el producto la tiene; si no, la de peor orden entre las suyas (la más cara).
        $fila = $formato->firstWhere('lista_id', $base?->id);
        if (! $fila && $formato->isNotEmpty()) {
            $orden = array_flip($activas);
            $fila = $formato->sortByDesc(fn ($f) => $orden[$f->lista_id] ?? 0)->first();
        }

        $activo = $this->formatoActivoDe($productoId);
        $cn = Pricing::costoPrecioEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $prod->iva);
        $opts = new OpcionesPrecio(iva: (float) $prod->iva, redondeo: (float) $cfg['redondeoPrecio']);
        $pv = $fila ? Pricing::precioVentaFila($cn, FilaVenta::desde((array) $fila), $opts) : null;

        return [
            'cn' => $cn,
            'iva' => (float) $prod->iva,
            // Markup EQUIVALENTE de la fila: con precio definido el markup no manda.
            'markup' => ($pv && $cn > 0) ? (($pv->netoUnitario / $cn) - 1) * 100 : (float) ($fila->markup ?? 0),
            'tieneLista' => (bool) $fila,
            'redondeo' => (float) $cfg['redondeoPrecio'],
            'listaBaseId' => $base?->id,
        ];
    }

    protected function precioBase(int $productoId): float
    {
        $c = $this->ctxPrecio($productoId);

        return $c['tieneLista'] ? Pricing::precioLista($c['cn'], $c['markup'], new OpcionesPrecio($c['iva'], $c['redondeo'])) : $c['cn'];
    }

    /**
     * Precio de UN PAQUETE fraccionado, con SU formato de venta. Si el paquete
     * no tiene ninguna fila cargada NO se devuelve cero: se corta. Un cero acá
     * sería una venta a precio cero.
     */
    protected function precioPres(int $presentacionId): float
    {
        $pres = Presentacion::query()->find($presentacionId);
        if (! $pres) {
            throw new ErrorDeNegocio('Presentación inexistente.');
        }
        $c = $this->ctxPrecio($pres->producto_id);
        $suyas = DB::table('producto_listas')->where('presentacion_id', $presentacionId)->orderBy('id')->get();
        if ($suyas->isEmpty()) {
            throw new ErrorDeNegocio(
                'El paquete de '.$this->fmtTam((float) $pres->tam_kg).' no tiene formato de venta cargado, así que no tiene precio. Cargalo en su ficha (Productos → el fraccionado).'
            );
        }
        $fila = $suyas->firstWhere('lista_id', $c['listaBaseId']) ?? $suyas->last();

        return Pricing::precioVentaFila(
            Pricing::costoNetoPresentacion($c['cn'], (float) $pres->tam_kg),
            FilaVenta::desde((array) $fila),
            new OpcionesPrecio($c['iva'], $c['redondeo']),
        )->netoUnitario;
    }
}
