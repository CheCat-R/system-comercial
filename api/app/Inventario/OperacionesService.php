<?php

namespace App\Inventario;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Producto;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * OPERACIONES de stock: compra directa, venta directa, fraccionamiento,
 * movimientos simples, y los GANCHOS que usan los documentos (comprobantes de
 * compra, ventas, presupuestos): ingresar / egresar / reservar / transitar /
 * reingresar. Los ganchos NO abren transacción: corren dentro de la del
 * documento, así un faltante aborta el documento entero.
 */
class OperacionesService extends StockCore
{
    /** Compra: ingresa mercadería, suma stock disponible y marca el proveedor activo. */
    public function compra(array $o): array
    {
        return DB::transaction(function () use ($o) {
            $prod = $this->producto((int) ($o['productoId'] ?? 0));
            if (! $prod) {
                throw new ErrorDeNegocio('Producto inválido.');
            }
            $c = (float) ($o['cantidad'] ?? 0);
            if (! ($c > 0)) {
                throw new ErrorDeNegocio('Ingresá una cantidad mayor a 0.');
            }
            $sucId = (int) ($o['sucursalId'] ?? 0) ?: $this->distribuidoraId();
            if (! $sucId) {
                throw new ErrorDeNegocio('No hay sucursal de ingreso.');
            }

            $this->addDelta($this->coord($prod->id, $sucId, null, 'disponible'), $c);

            $provNombre = '';
            if (! empty($o['proveedorId'])) {
                $prov = DB::table('proveedores')->find((int) $o['proveedorId']);
                if ($prov) {
                    $provNombre = $prov->nombre;
                    $formato = $this->formatoDeProveedor($prod->id, $prov->id);
                    $this->marcarFormatoActivo($prod->id, $formato->id);
                }
            }
            $venc = $this->fechaLocal($o['fechaVencimiento'] ?? null);
            $m = $this->mov([
                'tipo' => 'compra', 'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'signo' => 1, 'cantidad' => $c,
                'unidad' => $this->unidadDe($prod->tipo->value, null), 'estado_hacia' => 'disponible',
                'usuario_id' => $o['usuarioId'] ?? null, 'vencimiento' => $venc, 'proveedor_nombre' => $provNombre,
                'motivo' => $o['motivo'] ?? ($provNombre ? 'Prov: '.$provNombre : ''),
                'descripcion' => 'Compra +'.$this->fmtCant($prod->tipo->value, null, $c).($provNombre ? ' · '.$provNombre : ''),
            ]);

            return ['ok' => true, 'movimiento' => $m];
        });
    }

    /** Venta directa (granel / fraccionada / unidad). Precio computado del proveedor activo. */
    public function venta(array $o): array
    {
        return DB::transaction(function () use ($o) {
            $prod = $this->producto((int) ($o['productoId'] ?? 0));
            if (! $prod) {
                throw new ErrorDeNegocio('Producto inválido.');
            }
            $presId = (int) ($o['presId'] ?? 0) ?: null;
            $sucId = (int) $o['sucursalId'];
            $c = (float) ($o['cantidad'] ?? 0);
            if (! ($c > 0)) {
                throw new ErrorDeNegocio('Ingresá la cantidad.');
            }
            $disp = $this->cant($prod->id, $sucId, $presId, 'disponible');
            if ($c > $disp + self::EPS) {
                throw new ErrorDeNegocio('Stock insuficiente. Disponible: '.$this->fmtCant($prod->tipo->value, $presId, $disp).'.');
            }
            $this->addDelta($this->coord($prod->id, $sucId, $presId, 'disponible'), -$c);
            $precioU = $presId ? $this->precioPres($presId) : $this->precioBase($prod->id);
            $importe = $c * $precioU;
            $esGranelSuelto = $prod->esGranel() && ! $presId;
            $m = $this->mov([
                'tipo' => $esGranelSuelto ? 'venta_granel' : 'venta_fraccionada',
                'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'presentacion_id' => $presId, 'signo' => -1, 'cantidad' => $c,
                'unidad' => $this->unidadDe($prod->tipo->value, $presId), 'estado_desde' => 'disponible',
                'usuario_id' => $o['usuarioId'] ?? null,
                'descripcion' => ($esGranelSuelto ? 'Venta suelta ' : 'Venta ').$this->fmtCant($prod->tipo->value, $presId, $c).' · $'.number_format($importe, 2, '.', ''),
            ]);

            return ['ok' => true, 'importe' => $importe, 'movimiento' => $m];
        });
    }

    /** Fraccionamiento: descuenta granel y crea paquetes (misma sucursal). */
    public function fraccionar(array $o): array
    {
        return DB::transaction(function () use ($o) {
            $prod = $this->producto((int) ($o['productoId'] ?? 0));
            if (! $prod || ! $prod->esGranel()) {
                throw new ErrorDeNegocio('Solo productos a granel se fraccionan.');
            }
            $sucId = (int) $o['sucursalId'];
            $presList = DB::table('presentaciones')->where('producto_id', $prod->id)->get()->keyBy('id');
            $total = 0.0;
            $asign = [];
            foreach ($o['asignaciones'] ?? [] as $a) {
                $pres = $presList->get((int) ($a['presId'] ?? 0));
                $q = (int) round((float) ($a['cant'] ?? 0));
                if ($pres && $q > 0) {
                    $total += $q * (float) $pres->tam_kg;
                    $asign[] = ['pres' => $pres, 'q' => $q];
                }
            }
            if ($total <= 0) {
                throw new ErrorDeNegocio('Indicá al menos un paquete a fraccionar.');
            }
            $disp = $this->cant($prod->id, $sucId, null, 'disponible');
            if ($total > $disp + self::EPS) {
                throw new ErrorDeNegocio('No alcanza el granel disponible. Disponible: '.$this->num($disp).' kg, necesario: '.$this->num($total).' kg.');
            }
            $this->addDelta($this->coord($prod->id, $sucId, null, 'disponible'), -$total);
            foreach ($asign as ['pres' => $pres, 'q' => $q]) {
                $this->addDelta($this->coord($prod->id, $sucId, $pres->id, 'disponible'), $q);
            }
            $detalle = implode(', ', array_map(fn ($a) => $a['q'].'×'.$this->fmtTam((float) $a['pres']->tam_kg), $asign));
            $m = $this->mov([
                'tipo' => 'fraccionamiento', 'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'signo' => 0,
                'cantidad' => $total, 'unidad' => 'kg', 'pres_label' => 'Granel → paquetes',
                'usuario_id' => $o['usuarioId'] ?? null,
                'descripcion' => 'Fraccionó '.$this->num($total).' kg en '.$detalle,
            ]);

            return ['ok' => true, 'movimiento' => $m];
        });
    }

    /**
     * CORREGIR UNA TANDA MAL CARGADA ("puse 20 paquetes de 500 g y son 19").
     * Mueve las DOS puntas: los paquetes y el granel del que salieron — el
     * fraccionamiento no crea ni destruye mercadería, la convierte. Es para el
     * ERROR DE CARGA; una rotura es merma o incidencia. Toca sólo el DISPONIBLE.
     */
    public function corregirFraccionado(array $o): array
    {
        return DB::transaction(function () use ($o) {
            $prod = $this->producto((int) ($o['productoId'] ?? 0));
            if (! $prod || ! $prod->esGranel()) {
                throw new ErrorDeNegocio('Solo los productos a granel tienen fraccionados.');
            }
            $pres = DB::table('presentaciones')->where('id', (int) ($o['presId'] ?? 0))->where('producto_id', $prod->id)->first();
            if (! $pres) {
                throw new ErrorDeNegocio('Ese paquete no es de este producto.');
            }
            $sucId = (int) $o['sucursalId'];
            if (! is_numeric($o['cantidadReal'] ?? null) || (float) $o['cantidadReal'] < 0) {
                throw new ErrorDeNegocio('La cantidad real no puede ser negativa.');
            }
            $real = (int) round((float) $o['cantidadReal']);

            $actual = $this->cant($prod->id, $sucId, $pres->id, 'disponible');
            $delta = $real - $actual;
            if (abs($delta) < self::EPS) {
                return ['ok' => true, 'sinCambios' => true];
            }
            $kg = round(abs($delta) * (float) $pres->tam_kg * 1000) / 1000;
            if ($delta > 0) {
                $granel = $this->cant($prod->id, $sucId, null, 'disponible');
                if ($kg > $granel + self::EPS) {
                    throw new ErrorDeNegocio('Para llegar a '.$real.' paquetes hacen falta '.$this->num($kg).' kg de granel y hay '.$this->fmtCant('granel', null, $granel).'.');
                }
            }
            $this->addDelta($this->coord($prod->id, $sucId, $pres->id, 'disponible'), $delta);
            $this->addDelta($this->coord($prod->id, $sucId, null, 'disponible'), $delta > 0 ? -$kg : $kg);

            $tam = $this->fmtTam((float) $pres->tam_kg);
            $m = $this->mov([
                'tipo' => 'fraccionamiento', 'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'presentacion_id' => $pres->id,
                'signo' => 0, 'cantidad' => $kg, 'unidad' => 'kg', 'pres_label' => 'Corrección · '.$tam,
                'usuario_id' => $o['usuarioId'] ?? null, 'motivo' => trim((string) ($o['motivo'] ?? '')),
                'descripcion' => 'Corrigió '.$tam.': '.$this->num($actual).' → '.$real.' paquetes ('.$this->num($kg).' kg '.($delta > 0 ? 'salen del' : 'vuelven al').' granel)',
            ]);

            return ['ok' => true, 'movimiento' => $m, 'delta' => $delta, 'kg' => $kg];
        });
    }

    /** Movimiento simple: devolución (+), ajuste (±), merma/vencido/defectuoso (−). */
    public function simple(array $o): array
    {
        return DB::transaction(fn () => $this->simpleTx($o));
    }

    /** El cuerpo del movimiento simple SIN abrir transacción (para documentos que lo necesitan dentro de la suya). */
    public function simpleTx(array $o): array
    {
        $prod = $this->producto((int) ($o['productoId'] ?? 0));
        if (! $prod) {
            throw new ErrorDeNegocio('Producto inválido.');
        }
        $tipo = (string) ($o['tipo'] ?? '');
        $meta = self::TIPOS_MOV[$tipo] ?? null;
        if (! $meta) {
            throw new ErrorDeNegocio('Tipo inválido.');
        }
        $presId = (int) ($o['presId'] ?? 0) ?: null;
        $sucId = (int) $o['sucursalId'];
        $c = (float) ($o['cantidad'] ?? 0);
        if (! ($c > 0)) {
            throw new ErrorDeNegocio('Ingresá una cantidad mayor a 0.');
        }
        $signo = $meta['dir'];
        if ($signo === 0) {
            $signo = (int) ($o['signo'] ?? 0) === 1 ? 1 : -1;
        }
        if ($signo < 0) {
            $disp = $this->cant($prod->id, $sucId, $presId, 'disponible');
            if ($c > $disp + self::EPS) {
                throw new ErrorDeNegocio('Stock disponible insuficiente. Disponible: '.$this->fmtCant($prod->tipo->value, $presId, $disp).'.');
            }
        }
        $this->addDelta($this->coord($prod->id, $sucId, $presId, 'disponible'), $signo * $c);
        $estadoHacia = $signo > 0 ? 'disponible' : null;
        if ($tipo === 'vencido' || $tipo === 'defectuoso') {
            $this->addDelta($this->coord($prod->id, $sucId, $presId, $tipo), $c);
            $estadoHacia = $tipo;
        }
        $esPerdida = in_array($tipo, ['merma', 'vencido', 'defectuoso'], true);
        $motivo = (string) ($o['motivo'] ?? '');
        $m = $this->mov([
            'tipo' => $tipo, 'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'presentacion_id' => $presId,
            'signo' => $signo, 'cantidad' => $c, 'unidad' => $this->unidadDe($prod->tipo->value, $presId),
            'estado_desde' => $signo < 0 ? 'disponible' : null, 'estado_hacia' => $estadoHacia,
            'costo_unitario' => $esPerdida ? $this->costoDePerdida($prod, $presId) : 0,
            'usuario_id' => $o['usuarioId'] ?? null, 'motivo' => $motivo,
            'descripcion' => $meta['label'].' '.($signo > 0 ? '+' : '−').$this->fmtCant($prod->tipo->value, $presId, $c).($motivo !== '' ? ' · '.$motivo : ''),
        ]);

        return ['ok' => true, 'movimiento' => $m];
    }

    /* ============================ GANCHOS PARA DOCUMENTOS ============================ */

    /**
     * Ingreso por los ítems de un comprobante de recepción. Asegura la entrada
     * producto/proveedor pero NO cambia el proveedor activo (eso repriceaba la
     * góndola sin que nadie lo decidiera) — salvo que el producto no tenga ninguno.
     *
     * @param array{sucursalId:int, usuarioId?:?int, proveedorId?:?int, proveedorNombre?:string, descripcion?:string, items:array} $o
     */
    public function ingresarStockItems(array $o): void
    {
        $distintos = [];
        foreach ($o['items'] ?? [] as $it) {
            $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
            $cantidad = (float) ($it['cantidad'] ?? 0);
            if ($cantidad <= 0) {
                continue;
            }
            $this->addDelta($this->coord((int) $it['productoId'], (int) $o['sucursalId'], $presId, 'disponible'), $cantidad);
            $prod = $this->producto((int) $it['productoId']);
            $this->mov([
                'tipo' => 'compra', 'producto_id' => $it['productoId'], 'sucursal_id' => $o['sucursalId'], 'presentacion_id' => $presId,
                'signo' => 1, 'cantidad' => $cantidad, 'unidad' => $this->unidadDe($prod->tipo->value, $presId), 'estado_hacia' => 'disponible',
                'usuario_id' => $o['usuarioId'] ?? null, 'proveedor_nombre' => $o['proveedorNombre'] ?? '',
                'descripcion' => $o['descripcion'] ?? 'Ingreso por comprobante',
            ]);
            $distintos[(int) $it['productoId']] = $it;
        }
        if (! empty($o['proveedorId'])) {
            foreach ($distintos as $productoId => $it) {
                $formato = $this->formatoDeProveedor($productoId, (int) $o['proveedorId'], (float) ($it['costoUnitario'] ?? 0));
                $conActivo = DB::table('producto_proveedores')->where('producto_id', $productoId)->where('usar_para_precio', true)->exists();
                if (! $conActivo) {
                    $this->marcarFormatoActivo($productoId, $formato->id);
                }
            }
        }
    }

    /**
     * Egreso por los ítems de un documento (venta, devolución a proveedor).
     * `permitirNegativo` viene de la configuración: por defecto se rechaza.
     *
     * @param array{sucursalId:int, usuarioId?:?int, tipoMovimiento?:?string, estado?:string, permitirNegativo?:bool, descripcion?:string, items:array} $o
     */
    public function egresarStockItems(array $o): void
    {
        $tipoMov = $o['tipoMovimiento'] ?? null;
        $estado = $o['estado'] ?? 'disponible';
        foreach ($o['items'] ?? [] as $it) {
            $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
            $cantidad = (float) ($it['cantidad'] ?? 0);
            if ($cantidad <= 0) {
                continue;
            }
            $prod = $this->producto((int) $it['productoId']);
            if (! $prod) {
                throw new ErrorDeNegocio('Producto inválido en el detalle.');
            }
            $disp = $this->cant($prod->id, (int) $o['sucursalId'], $presId, $estado);
            if (empty($o['permitirNegativo']) && $cantidad > $disp + self::EPS) {
                throw new ErrorDeNegocio('Stock insuficiente de '.$prod->nombre.'. Disponible: '.$this->fmtCant($prod->tipo->value, $presId, $disp).'.');
            }
            $this->addDelta($this->coord($prod->id, (int) $o['sucursalId'], $presId, $estado), -$cantidad);
            $esGranelSuelto = $prod->esGranel() && ! $presId;
            $this->mov([
                'tipo' => $tipoMov ?: ($esGranelSuelto ? 'venta_granel' : 'venta_fraccionada'),
                'producto_id' => $prod->id, 'sucursal_id' => $o['sucursalId'], 'presentacion_id' => $presId, 'signo' => -1,
                'cantidad' => $cantidad, 'unidad' => $this->unidadDe($prod->tipo->value, $presId), 'estado_desde' => $estado,
                'usuario_id' => $o['usuarioId'] ?? null, 'descripcion' => $o['descripcion'] ?? 'Egreso por documento',
            ]);
        }
    }

    /**
     * Reserva (o libera) stock por un documento que COMPROMETE mercadería sin
     * venderla todavía (presupuesto confirmado). Valida TODO antes de mover.
     *
     * @param array{sucursalId:int, usuarioId?:?int, descripcion:string, liberar?:bool, items:array} $o
     */
    public function reservarItems(array $o): void
    {
        $liberar = ! empty($o['liberar']);
        $desde = $liberar ? 'comprometido' : 'disponible';
        $hacia = $liberar ? 'disponible' : 'comprometido';
        $this->moverItems($o, $desde, $hacia, 'ajuste', $liberar ? null : 'Stock insuficiente para reservar');
    }

    /**
     * Pone (o devuelve) mercadería EN TRÁNSITO por un documento que la despacha
     * hacia afuera. Mientras viaja sigue siendo del origen.
     *
     * @param array{sucursalId:int, usuarioId?:?int, descripcion:string, tipoMovimiento?:string, volver?:bool, items:array} $o
     */
    public function transitarStockItems(array $o): void
    {
        $volver = ! empty($o['volver']);
        $desde = $volver ? 'en_transito' : 'disponible';
        $hacia = $volver ? 'disponible' : 'en_transito';
        $this->moverItems($o, $desde, $hacia, $o['tipoMovimiento'] ?? 'ajuste', 'Stock insuficiente');
    }

    /** Mueve una lista de renglones entre dos estados; con `$prefijoFalta`, valida todos antes de mover. */
    private function moverItems(array $o, string $desde, string $hacia, string $tipoMov, ?string $prefijoFalta): void
    {
        $items = array_filter($o['items'] ?? [], fn ($it) => (float) ($it['cantidad'] ?? 0) > 0);
        if ($prefijoFalta !== null) {
            $faltas = [];
            foreach ($items as $it) {
                $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
                $c = (float) $it['cantidad'];
                $hay = $this->cant((int) $it['productoId'], (int) $o['sucursalId'], $presId, $desde);
                if ($c > $hay + self::EPS) {
                    $prod = $this->producto((int) $it['productoId']);
                    $tipo = $prod?->tipo->value ?? 'entero';
                    $faltas[] = ($prod?->nombre ?? '#'.$it['productoId']).': hace falta '.$this->fmtCant($tipo, $presId, $c).', hay '.$this->fmtCant($tipo, $presId, $hay);
                }
            }
            if ($faltas) {
                throw new ErrorDeNegocio($prefijoFalta.' — '.implode(' · ', $faltas));
            }
        }
        foreach ($items as $it) {
            $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
            $c = (float) $it['cantidad'];
            $prod = $this->producto((int) $it['productoId']);
            $this->move($prod->id, (int) $o['sucursalId'], $presId, $desde, $hacia, $c);
            $this->mov([
                'tipo' => $tipoMov, 'producto_id' => $prod->id, 'sucursal_id' => $o['sucursalId'], 'presentacion_id' => $presId, 'signo' => 0,
                'cantidad' => $c, 'unidad' => $this->unidadDe($prod->tipo->value, $presId), 'estado_desde' => $desde, 'estado_hacia' => $hacia,
                'usuario_id' => $o['usuarioId'] ?? null, 'descripcion' => $o['descripcion'],
            ]);
        }
    }

    /** Reingreso de stock (anulación de venta o nota de crédito). Contrapartida de `egresarStockItems`. */
    public function reingresarStockItems(array $o): void
    {
        foreach ($o['items'] ?? [] as $it) {
            $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
            $cantidad = (float) ($it['cantidad'] ?? 0);
            if ($cantidad <= 0) {
                continue;
            }
            $prod = $this->producto((int) $it['productoId']);
            if (! $prod) {
                continue;
            }
            $this->addDelta($this->coord($prod->id, (int) $o['sucursalId'], $presId, 'disponible'), $cantidad);
            $this->mov([
                'tipo' => 'devolucion', 'producto_id' => $prod->id, 'sucursal_id' => $o['sucursalId'], 'presentacion_id' => $presId, 'signo' => 1,
                'cantidad' => $cantidad, 'unidad' => $this->unidadDe($prod->tipo->value, $presId), 'estado_hacia' => 'disponible',
                'usuario_id' => $o['usuarioId'] ?? null, 'descripcion' => $o['descripcion'] ?? 'Reingreso por anulación',
            ]);
        }
    }

    /* ---------------- Formato de compra ---------------- */

    /** El formato de compra de un proveedor para un producto; lo crea vacío si no existe. */
    public function formatoDeProveedor(int $productoId, int $proveedorId, float $costo = 0): object
    {
        $existente = DB::table('producto_proveedores')->where('producto_id', $productoId)->where('proveedor_id', $proveedorId)->orderBy('id')->first();
        if ($existente) {
            return $existente;
        }
        $id = DB::table('producto_proveedores')->insertGetId([
            'producto_id' => $productoId, 'proveedor_id' => $proveedorId, 'costo' => $costo,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return DB::table('producto_proveedores')->find($id);
    }

    /** Deja UN solo formato marcado como el que fija el precio. */
    public function marcarFormatoActivo(int $productoId, int $formatoId): void
    {
        DB::table('producto_proveedores')->where('producto_id', $productoId)->update(['usar_para_precio' => false]);
        DB::table('producto_proveedores')->where('id', $formatoId)->update(['usar_para_precio' => true]);
    }

    /* ---------------- Consultas ---------------- */

    public function existencias(?int $soloSuc = null)
    {
        return DB::table('stock')
            ->when($soloSuc, fn ($q) => $q->where('sucursal_id', $soloSuc))
            ->where('cantidad', '>', self::EPS)
            ->get(['id', 'producto_id', 'sucursal_id', 'presentacion_id', 'estado', 'cantidad']);
    }

    public function listarMovimientos(array $q = [])
    {
        $limit = min(max((int) ($q['limit'] ?? 300), 1), 1000);

        return DB::table('movimientos')
            ->when(! empty($q['productoId']), fn ($b) => $b->where('producto_id', (int) $q['productoId']))
            ->when(! empty($q['sucursalId']), fn ($b) => $b->where('sucursal_id', (int) $q['sucursalId']))
            ->when(! empty($q['tipo']), fn ($b) => $b->where('tipo', $q['tipo']))
            ->when($this->fechaLocal($q['desde'] ?? null), fn ($b, $d) => $b->where('fecha', '>=', $d))
            ->when(! empty($q['hasta']), fn ($b) => $b->where('fecha', '<=', Carbon::parse($q['hasta'])->endOfDay()))
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
    }

    /** 'YYYY-MM-DD' → inicio del día local, o null. */
    protected function fechaLocal(mixed $v): ?Carbon
    {
        $s = trim((string) ($v ?? ''));
        if ($s === '') {
            return null;
        }
        try {
            return Carbon::parse($s)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
