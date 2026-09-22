<?php

namespace App\Inventario;

use App\Auth\Sesion;
use App\Enums\EstadoProducto;
use App\Exceptions\ErrorDeNegocio;
use App\Models\Producto;
use App\Models\Sucursal;
use App\Models\Vencimiento;
use App\Models\VencimientoSesion;
use App\Precios\CostoEntry;
use App\Precios\Pricing;
use App\Services\ConfiguracionService;
use App\Services\OfertasService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * VENCIMIENTOS — el vigía de fechas, sin lote (Almacén › Vencimientos).
 * ============================================================================
 * El modelo en tres actos:
 *
 *   1. CONTROL (sesión): alguien camina la góndola de una sucursal y anota
 *      "N unidades de X vencen tal día". El registro NO toca stock — es una
 *      lista de control con el costo CONGELADO del día (misma lección que
 *      cafetería: la pérdida de marzo no cambia en julio porque subió el
 *      catálogo).
 *   2. OFERTA: un registro por vencer NO arma su propia oferta paralela — va
 *      al MOTOR de ofertas de Ventas con el formulario ya lleno
 *      (`borradorOferta`) y, cuando se crea, el registro se ata a esa oferta
 *      (`vincularOferta`).
 *   3. PROCESAR: cuando venció, se cierra el ciclo — cuántas unidades se
 *      salvaron vendiéndose y cuántas se perdieron. La pérdida REAL es
 *      costo × perdidas, y opcionalmente genera la baja de stock de verdad
 *      (movimiento 'vencido') EN LA MISMA transacción.
 *
 * Los rangos de alerta son EXCLUYENTES (vencido / 0-7 / 8-15 / 16-30 / +30):
 * un registro vive en UNA sola tarjeta. Y los "días para vencer" se calculan
 * SIEMPRE contra el día de ARGENTINA, nunca contra el día del servidor —a la
 * noche UTC ya es "mañana" y los vencidos se adelantarían un día.
 */
class VencimientosService extends StockCore
{
    /** El descuento que se propone en el borrador; lo decide quien arma la oferta. */
    private const PCT_SUGERIDO = 25;

    public function __construct(
        ConfiguracionService $cfg,
        private readonly OperacionesService $operaciones,
        private readonly OfertasService $ofertas,
    ) {
        parent::__construct($cfg);
    }

    private static function r2(float $n): float
    {
        return round($n * 100) / 100;
    }

    /** El día de hoy en Argentina, sin importar en qué huso corre el servidor. */
    private static function hoyAr(): string
    {
        return Carbon::now('America/Argentina/Buenos_Aires')->toDateString();
    }

    /* ---------------- Valuación (patrón cafetería, costo del formato activo) ---------------- */

    /**
     * Las tres consultas salen ANTES del bucle, no una por renglón: un SELECT
     * del producto (y otro de la presentación) por renglón eran hasta 600 idas
     * y vueltas con la conexión tomada dentro de la transacción —una góndola
     * de un mismo producto son diez fechas distintas—.
     *
     * @param  array<int, array{productoId:int, presentacionId?:?int}>  $items
     * @return array<string, array{prod:Producto, pres:?object, costoU:float}>
     */
    private function valuar(array $items): array
    {
        $ids = array_values(array_unique(array_map(fn ($it) => (int) $it['productoId'], $items)));
        $presIds = array_values(array_unique(array_filter(array_map(fn ($it) => (int) ($it['presentacionId'] ?? 0) ?: null, $items))));

        $provs = DB::table('producto_proveedores')->whereIn('producto_id', $ids)->get();
        $prods = Producto::query()->whereIn('id', $ids)->get()->keyBy('id');
        $press = $presIds ? DB::table('presentaciones')->whereIn('id', $presIds)->get()->keyBy('id') : collect();

        $out = [];
        foreach ($items as $it) {
            $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
            $clave = $it['productoId'].'-'.($presId ?? 0);
            if (isset($out[$clave])) {
                continue;
            }
            $prod = $prods->get((int) $it['productoId']);
            if (! $prod) {
                throw new ErrorDeNegocio('Producto inválido en el detalle.');
            }
            // Archivado no se controla: si no se vende, no tiene sentido vigilar su fecha. El DISCONTINUADO sí.
            if ($prod->estado === EstadoProducto::Archivado) {
                throw new ErrorDeNegocio("{$prod->nombre} está archivado: ya no se vende, así que no hay nada que vigilar.");
            }
            $pres = null;
            if ($presId) {
                $pres = $press->get($presId);
                if (! $pres || (int) $pres->producto_id !== $prod->id) {
                    throw new ErrorDeNegocio("Presentación inválida para {$prod->nombre}.");
                }
            }
            $formatos = $provs->filter(fn ($p) => (int) $p->producto_id === $prod->id);
            $activo = Pricing::formatoActivo($formatos);
            $cnKg = Pricing::costoNetoEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $prod->iva);
            $out[$clave] = ['prod' => $prod, 'pres' => $pres, 'costoU' => $pres ? $cnKg * ((float) ($pres->tam_kg ?? 1)) : $cnKg];
        }

        return $out;
    }

    /* ============================ EL CONTROL ============================ */

    public function crearSesion(array $datos): array
    {
        $sucursalId = (int) ($datos['sucursalId'] ?? 0);
        $suc = Sucursal::query()->find($sucursalId);
        if (! $suc) {
            throw new ErrorDeNegocio('Sucursal inválida.');
        }
        $items = $datos['items'] ?? [];
        foreach ($items as $it) {
            if (! ((float) ($it['cantidad'] ?? 0) > 0)) {
                throw new ErrorDeNegocio('Todas las cantidades deben ser mayores a 0.');
            }
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($it['fechaVencimiento'] ?? ''))) {
                throw new ErrorDeNegocio('Fecha de vencimiento inválida.');
            }
        }

        return DB::transaction(function () use ($sucursalId, $items, $datos) {
            $val = $this->valuar($items);
            $unidades = array_sum(array_map(fn ($it) => (float) $it['cantidad'], $items));

            $sesion = VencimientoSesion::query()->create([
                'sucursal_id' => $sucursalId,
                'usuario_id' => $datos['usuarioId'] ?? null,
                'total_items' => count($items),
                'total_unidades' => $unidades,
            ]);

            $filas = [];
            foreach ($items as $it) {
                $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
                ['prod' => $prod, 'pres' => $pres, 'costoU' => $costoU] = $val[$it['productoId'].'-'.($presId ?? 0)];
                $esGranelSuelto = $prod->esGranel() && ! $pres;
                $tam = $pres ? $this->fmtTam((float) $pres->tam_kg) : '';
                $filas[] = [
                    'producto_id' => $prod->id,
                    'presentacion_id' => $pres->id ?? null,
                    'sucursal_id' => $sucursalId,
                    'sesion_id' => $sesion->id,
                    'fecha_vencimiento' => $it['fechaVencimiento'],
                    'cantidad' => (float) $it['cantidad'],
                    'costo_unitario' => $costoU,
                    'nombre' => $pres ? "{$prod->nombre} · {$tam}" : $prod->nombre,
                    'unidad' => $esGranelSuelto ? 'kg' : ($pres ? 'paq.' : 'u.'),
                    'codigo_barras' => $pres->codigo_barras ?? $prod->codigo_barras ?? '',
                    'observaciones' => trim((string) ($it['observaciones'] ?? '')),
                    'usuario_id' => $datos['usuarioId'] ?? null,
                    'created_at' => now(), 'updated_at' => now(),
                ];
            }
            DB::table('vencimientos')->insert($filas);

            return ['sesionId' => $sesion->id, 'registros' => count($filas), 'unidades' => self::r2($unidades)];
        });
    }

    /* ============================ EL LISTADO ============================ */

    public function listar(): array
    {
        $hoy = self::hoyAr();

        return Vencimiento::query()
            ->selectRaw('*, DATEDIFF(fecha_vencimiento, ?) as dias_para_vencer', [$hoy])
            ->orderBy('fecha_vencimiento')->orderBy('id')
            ->get()
            ->map(fn (Vencimiento $v) => [...$v->toArray(), 'diasParaVencer' => (int) $v->getAttribute('dias_para_vencer')])
            ->all();
    }

    public function editar(int $id, array $datos): Vencimiento
    {
        $reg = Vencimiento::query()->find($id);
        if (! $reg) {
            throw new NotFoundHttpException('Registro inexistente.');
        }
        if ($reg->procesado) {
            throw new ErrorDeNegocio('Ya se procesó: el cierre no se edita.');
        }
        $patch = [];
        if (array_key_exists('cantidad', $datos)) {
            if (! ((float) $datos['cantidad'] > 0)) {
                throw new ErrorDeNegocio('La cantidad debe ser mayor a 0.');
            }
            $patch['cantidad'] = (float) $datos['cantidad'];
        }
        if (array_key_exists('fechaVencimiento', $datos)) {
            $patch['fecha_vencimiento'] = $datos['fechaVencimiento'];
        }
        if (array_key_exists('observaciones', $datos)) {
            $patch['observaciones'] = trim((string) $datos['observaciones']);
        }
        if ($patch) {
            $reg->update($patch);
        }

        return $reg;
    }

    public function eliminar(int $id): array
    {
        $reg = Vencimiento::query()->find($id);
        if (! $reg) {
            throw new NotFoundHttpException('Registro inexistente.');
        }
        if ($reg->procesado) {
            throw new ErrorDeNegocio('Ya se procesó: dejó pérdida real asentada y no se borra.');
        }
        $reg->delete();

        return ['ok' => true];
    }

    /* ============================ EL CIERRE ============================ */

    /**
     * Venció → se procesa: cuántas se salvaron vendiéndose y cuántas se
     * perdieron. `generarMerma` además baja el stock real (movimiento
     * 'vencido') en la MISMA transacción. El claim del registro va con
     * bloqueo pesimista: dos personas procesando lo mismo, una sola gana.
     */
    public function procesar(int $id, array $datos, Sesion $sesion): array
    {
        return DB::transaction(function () use ($id, $datos, $sesion) {
            $reg = Vencimiento::query()->whereKey($id)->lockForUpdate()->first();
            if (! $reg) {
                throw new NotFoundHttpException('Registro inexistente.');
            }
            if ($reg->procesado) {
                throw new ErrorDeNegocio('Ya estaba procesado.');
            }
            $uv = (float) ($datos['unidadesVendidas'] ?? -1);
            if ($uv < 0) {
                throw new ErrorDeNegocio('Las unidades vendidas no pueden ser negativas.');
            }
            if ($uv > $reg->cantidad + 1e-9) {
                throw new ErrorDeNegocio("Las vendidas no pueden superar lo registrado ({$reg->cantidad}).");
            }
            $perdidas = self::r2($reg->cantidad - $uv);

            $mermaMovimientoId = null;
            if (! empty($datos['generarMerma']) && $perdidas > 0) {
                $res = $this->operaciones->simpleTx([
                    'tipo' => 'vencido',
                    'productoId' => $reg->producto_id,
                    'presId' => $reg->presentacion_id,
                    'sucursalId' => $reg->sucursal_id,
                    'cantidad' => $perdidas,
                    'usuarioId' => $sesion->usuarioId,
                    'motivo' => "Vencimiento #{$reg->id} · vencía {$reg->fecha_vencimiento->toDateString()}",
                ]);
                $mermaMovimientoId = $res['movimiento']->id ?? null;
            }

            $reg->update([
                'procesado' => true,
                'unidades_vendidas' => $uv,
                'procesado_en' => now(),
                'merma_movimiento_id' => $mermaMovimientoId,
            ]);

            return [...$reg->refresh()->toArray(), 'perdidas' => $perdidas, 'perdidaReal' => self::r2($perdidas * $reg->costo_unitario)];
        });
    }

    /* ============================ LA OFERTA ============================ */

    /**
     * El BORRADOR que abre el motor de ofertas con el formulario lleno. Acá
     * viven las reglas (a quién se le puede armar oferta y con qué valores);
     * el formulario de Ventas solo lo muestra y deja tocar todo antes de crear.
     */
    public function borradorOferta(int $id): array
    {
        $hoy = self::hoyAr();
        $reg = Vencimiento::query()
            ->selectRaw('vencimientos.*, DATEDIFF(fecha_vencimiento, ?) as dias', [$hoy])
            ->find($id);
        if (! $reg) {
            throw new NotFoundHttpException('Registro inexistente.');
        }
        if ($reg->procesado) {
            throw new ErrorDeNegocio('Ya se procesó: la oferta llega tarde.');
        }
        $dias = (int) $reg->getAttribute('dias');
        if ($dias < 0) {
            throw new ErrorDeNegocio('Ya venció: no se ofrece mercadería vencida.');
        }
        if ($reg->oferta_id) {
            throw new ErrorDeNegocio('Este registro ya tiene su oferta (mirala en Ventas › Ofertas).');
        }

        $prod = Producto::query()->find($reg->producto_id);
        if (! $prod) {
            throw new ErrorDeNegocio('El producto del registro no existe.');
        }
        if ($prod->estado === EstadoProducto::Archivado) {
            throw new ErrorDeNegocio("{$prod->nombre} está archivado: no se vende, así que no hay oferta que valga.");
        }
        $sucNombre = Sucursal::query()->find($reg->sucursal_id)?->nombre;

        /*
         * El borrador arranca acotado a la LISTA BASE —el precio de
         * mostrador—: rematar lo que vence no es motivo para bajarle además
         * el precio a un mayorista, que ya tiene el suyo. Si no hay lista
         * base configurada, va sin acotar (corre en todas) y el dueño lo
         * ajusta en el formulario antes de guardarlo.
         */
        $listaBaseId = (int) ($this->cfg->get('ventas')['listaBaseId'] ?? 0);

        return [
            'registro' => [
                'id' => $reg->id,
                'nombre' => $reg->nombre,
                'productoId' => $reg->producto_id,
                'productoNombre' => $prod->nombre,
                'presentacionId' => $reg->presentacion_id,
                'sucursalId' => $reg->sucursal_id,
                'sucursalNombre' => $sucNombre ?? '—',
                'fechaVencimiento' => $reg->fecha_vencimiento->toDateString(),
                'diasParaVencer' => $dias,
                'cantidad' => $reg->cantidad,
                'unidad' => $reg->unidad,
                'costoUnitario' => $reg->costo_unitario,
                'perdidaPotencial' => self::r2($reg->cantidad * $reg->costo_unitario),
            ],
            // Con la forma EXACTA de una oferta (sin id): el formulario la carga como carga cualquier oferta para editar.
            'borrador' => [
                'nombre' => "Por vencer · {$reg->nombre}",
                'tipo' => 'porcentaje',
                'porcentaje' => self::PCT_SUGERIDO,
                // Hasta el día del vencimiento INCLUSIVE: pasada esa fecha la promo se apaga sola.
                'hasta' => $reg->fecha_vencimiento->toDateString(),
                // Solo donde está el lote: rematar en una sucursal que no lo tiene es regalar margen sin salvar nada.
                'sucursales' => (string) $reg->sucursal_id,
                'activa' => true,
                'listas' => $listaBaseId ? (string) $listaBaseId : '',
                /*
                 * El alcance apunta a LO QUE VENCE. Si el registro es de un
                 * paquete fraccionado, la oferta va al paquete y no a la
                 * madre: descontarle el kilo suelto para salvar 12 bolsas de
                 * 500 g es regalar margen de mercadería que no vence.
                 */
                'alcances' => [
                    $reg->presentacion_id
                        ? ['tipo' => 'presentacion', 'refId' => $reg->presentacion_id, 'nombre' => $reg->nombre]
                        : ['tipo' => 'producto', 'refId' => $reg->producto_id, 'nombre' => $prod->nombre],
                ],
            ],
        ];
    }

    /**
     * Ata el registro a la oferta que se acaba de crear en el motor. Se exige
     * que la oferta ALCANCE al producto: si no, el vínculo sería una mentira
     * («en oferta» en pantalla, cero descuento en la caja).
     */
    public function vincularOferta(int $id, int $ofertaId): array
    {
        $reg = Vencimiento::query()->find($id);
        if (! $reg) {
            throw new NotFoundHttpException('Registro inexistente.');
        }
        if ($reg->procesado) {
            throw new ErrorDeNegocio('Ya se procesó: el cierre no cambia.');
        }
        if ($reg->oferta_id && (int) $reg->oferta_id !== $ofertaId) {
            throw new ErrorDeNegocio('Este registro ya está atado a otra oferta.');
        }

        $todas = $this->ofertas->listar();
        $oferta = collect($todas)->firstWhere('id', $ofertaId);
        if (! $oferta) {
            throw new NotFoundHttpException('Oferta inexistente.');
        }

        $prod = $this->productosParaAlcance([$reg->producto_id])[0] ?? null;
        if (! $prod || ! self::alcanzaProducto($oferta, $prod, $reg->presentacion_id)) {
            throw new ErrorDeNegocio(
                "La oferta «{$oferta['nombre']}» no alcanza a {$reg->nombre}: sin eso el registro figuraría en oferta y en la caja no descontaría nada."
            );
        }

        // Idempotente: reintentar el mismo vínculo no es un error.
        if ((int) $reg->oferta_id === $ofertaId) {
            return ['registro' => $reg, 'oferta' => $oferta];
        }
        $reg->update(['oferta_id' => $ofertaId]);

        return ['registro' => $reg, 'oferta' => $oferta];
    }

    /** Productos con lo necesario para resolver los cuatro alcances de una oferta. */
    private function productosParaAlcance(?array $ids = null): array
    {
        $q = Producto::query()->select(['id', 'nombre', 'estado', 'marca_id', 'categoria_id']);
        $filas = ($ids ? $q->whereIn('id', $ids) : $q)->get();
        if ($filas->isEmpty()) {
            return [];
        }
        $etqs = DB::table('producto_etiquetas')->whereIn('producto_id', $filas->pluck('id'))->get();

        return $filas->map(fn (Producto $p) => [
            'id' => $p->id, 'nombre' => $p->nombre, 'estado' => $p->estado?->value,
            'marcaId' => $p->marca_id, 'categoriaId' => $p->categoria_id,
            'etiquetas' => $etqs->where('producto_id', $p->id)->pluck('etiqueta_id')->values()->all(),
        ])->values()->all();
    }

    /* ---------------- Alcance y vigencia de una oferta (lado servidor) ----------------
     * Las MISMAS tres reglas que el motor del POS aplica en la caja: están acá
     * porque el cruce oferta↔vencimiento se resuelve en el servidor y no puede
     * opinar distinto que la caja.
     */

    /**
     * ¿El alcance de la oferta llega a ESTE registro? Varias filas = unión.
     * `presId` distingue el paquete fraccionado de su madre: los alcances de
     * siempre se resuelven con datos de la madre y el paquete solo los hereda
     * si la oferta tiene el tilde `incluyeFraccionados`. El alcance
     * `presentacion` es al revés: apunta a un paquete y no alcanza al granel suelto.
     */
    private static function alcanzaProducto(array $o, array $p, ?int $presId = null): bool
    {
        if (($o['tipo'] ?? '') === 'ticket') {
            return false;
        }
        if (($o['tipo'] ?? '') === 'combo') {
            return collect($o['componentes'] ?? [])->contains(fn ($c) => (int) $c['productoId'] === $p['id']);
        }

        return collect($o['alcances'] ?? [])->contains(function ($a) use ($o, $p, $presId) {
            if (($a['tipo'] ?? '') === 'presentacion') {
                return $presId !== null && (int) $a['refId'] === $presId;
            }
            if ($presId !== null && empty($o['incluyeFraccionados'])) {
                return false;
            }

            return match ($a['tipo'] ?? '') {
                'producto' => (int) $a['refId'] === $p['id'],
                'marca' => (int) $a['refId'] === $p['marcaId'],
                'categoria' => (int) $a['refId'] === $p['categoriaId'],
                'etiqueta' => in_array((int) $a['refId'], $p['etiquetas'], true),
                default => false,
            };
        });
    }

    /** '' = todas las sucursales; si no, la lista CSV manda. */
    private static function cubreSucursal(array $o, int $sucursalId): bool
    {
        $ids = array_values(array_filter(array_map('trim', explode(',', (string) ($o['sucursales'] ?? '')))));

        return ! $ids || in_array((string) $sucursalId, $ids, true);
    }

    /** Estado calculado, igual que el panel de Ventas: por qué (no) está corriendo. */
    private static function estadoOferta(array $o, Carbon $ahora): string
    {
        if (empty($o['activa'])) {
            return 'inactiva';
        }
        if (! empty($o['desde']) && $ahora->lt(Carbon::parse($o['desde']))) {
            return 'programada';
        }
        if (! empty($o['hasta']) && $ahora->gt(Carbon::parse($o['hasta']))) {
            return 'vencida';
        }

        return 'vigente';
    }

    /**
     * EL CRUCE: qué mercadería vigilada está (o debería estar) en oferta. No
     * mira solo las ofertas nacidas acá: recorre TODAS y resuelve su alcance
     * real contra los registros abiertos, así también aparece la oferta que
     * alguien armó en Ventas sobre algo que además está por vencer.
     */
    public function ofertasEnJuego(): array
    {
        $ahora = Carbon::now();
        $hoy = self::hoyAr();
        $todas = $this->ofertas->listar();
        $prods = $this->productosParaAlcance();
        $porId = collect($prods)->keyBy('id');
        $abiertos = Vencimiento::query()
            ->selectRaw('vencimientos.*, DATEDIFF(fecha_vencimiento, ?) as dias', [$hoy])
            ->where('procesado', false)
            ->orderBy('fecha_vencimiento')->orderBy('id')
            ->get();

        $filas = [];
        foreach ($abiertos as $v) {
            $prod = $porId->get($v->producto_id);
            $d = (int) $v->getAttribute('dias');
            // Las candidatas: la vinculada (aunque hoy no alcance — ese desajuste ES la noticia) y toda oferta que llegue al producto por cualquier vía.
            $candidatas = collect($todas)->filter(fn ($o) => (int) $o['id'] === (int) $v->oferta_id || ($prod && self::alcanzaProducto($o, $prod, $v->presentacion_id)));

            foreach ($candidatas as $o) {
                $est = self::estadoOferta($o, $ahora);
                $alcanza = (bool) $prod && self::alcanzaProducto($o, $prod, $v->presentacion_id);
                $cubreSuc = self::cubreSucursal($o, $v->sucursal_id);
                $hasta = ! empty($o['hasta']) ? Carbon::parse($o['hasta']) : null;
                $vence = Carbon::parse($v->fecha_vencimiento->toDateString().' 23:59:59');
                $corriendo = $est === 'vigente' && $alcanza && $cubreSuc;
                $vinculada = (int) $v->oferta_id === (int) $o['id'];

                // Una fila existe si la oferta está ATADA al registro, o si está DESCONTANDO de verdad ese lote.
                if (! $vinculada && ! $corriendo) {
                    continue;
                }

                $alarma = null;
                if ($corriendo && $d < 0) {
                    $alarma = ['codigo' => 'vencida_en_oferta', 'severidad' => 'grave',
                        'texto' => 'Venció hace '.abs($d).' día'.(abs($d) === 1 ? '' : 's').' y la oferta sigue corriendo: la caja lo está vendiendo con descuento. Apagá la oferta y procesá el registro.'];
                } elseif ($vinculada && ! $alcanza) {
                    $alarma = ['codigo' => 'sin_alcance', 'severidad' => 'media',
                        'texto' => 'La oferta ya no alcanza a este producto (le cambiaron el alcance): figura «en oferta» pero en la caja no descuenta nada.'];
                } elseif ($vinculada && ! $cubreSuc) {
                    $alarma = ['codigo' => 'otra_sucursal', 'severidad' => 'media', 'texto' => 'La oferta no corre en la sucursal donde está la mercadería.'];
                } elseif ($d >= 0 && $est === 'inactiva') {
                    $alarma = ['codigo' => 'oferta_apagada', 'severidad' => 'media',
                        'texto' => "La oferta está apagada y todavía quedan {$d} día".($d === 1 ? '' : 's').' de mercadería: el descuento no está corriendo.'];
                } elseif ($d >= 0 && $est === 'vencida') {
                    $alarma = ['codigo' => 'oferta_terminada', 'severidad' => 'media',
                        'texto' => "La oferta terminó y quedan {$d} día".($d === 1 ? '' : 's').' de mercadería sin descuento.'];
                } elseif ($d >= 0 && $est === 'programada') {
                    $alarma = ['codigo' => 'oferta_programada', 'severidad' => 'media',
                        'texto' => (! empty($o['desde']) && Carbon::parse($o['desde'])->gt($vence))
                            ? 'La oferta arranca DESPUÉS de que la mercadería venza: no la va a salvar.'
                            : 'La oferta todavía no arrancó.'];
                } elseif ($corriendo && $hasta && $hasta->lt($vence)) {
                    $sin = max(0, (int) ceil($hasta->diffInSeconds($vence, false) / 86400));
                    $alarma = ['codigo' => 'oferta_corta', 'severidad' => 'baja',
                        'texto' => "La oferta corta antes de la fecha del paquete: quedan {$sin} día".($sin === 1 ? '' : 's').' de mercadería sin descuento.'];
                } elseif ($d < 0) {
                    $alarma = ['codigo' => 'vencida_sin_oferta', 'severidad' => 'media',
                        'texto' => 'Ya venció hace '.abs($d).' día'.(abs($d) === 1 ? '' : 's').' y la oferta no lo está descontando (bien): queda retirarlo y procesar el registro.'];
                }

                $filas[] = [
                    'vencimientoId' => $v->id, 'productoId' => $v->producto_id, 'presentacionId' => $v->presentacion_id,
                    'nombre' => $v->nombre, 'sucursalId' => $v->sucursal_id, 'fechaVencimiento' => $v->fecha_vencimiento->toDateString(),
                    'diasParaVencer' => $d, 'cantidad' => $v->cantidad, 'unidad' => $v->unidad, 'costoUnitario' => $v->costo_unitario,
                    'enJuego' => self::r2($v->cantidad * $v->costo_unitario),
                    'ofertaId' => $o['id'], 'ofertaNombre' => $o['nombre'], 'ofertaTipo' => $o['tipo'],
                    'porcentaje' => $o['porcentaje'] ?? null, 'precio' => $o['precio'] ?? null, 'lleva' => $o['lleva'] ?? null, 'paga' => $o['paga'] ?? null,
                    'montoMinimo' => $o['montoMinimo'] ?? null, 'ofertaDesde' => $o['desde'] ?? null, 'ofertaHasta' => $o['hasta'] ?? null,
                    'ofertaSucursales' => $o['sucursales'] ?? '', 'ofertaEstado' => $est, 'vinculada' => $vinculada, 'corriendo' => $corriendo, 'alarma' => $alarma,
                ];
            }
        }

        // Lo grave arriba, y dentro de cada grupo lo que vence primero.
        $peso = ['grave' => 0, 'media' => 1, 'baja' => 2];
        usort($filas, fn ($a, $b) => ($peso[$a['alarma']['severidad'] ?? ''] ?? 3) <=> ($peso[$b['alarma']['severidad'] ?? ''] ?? 3) ?: $a['diasParaVencer'] <=> $b['diasParaVencer']);

        $graves = array_values(array_filter($filas, fn ($f) => ($f['alarma']['severidad'] ?? null) === 'grave'));

        return [
            'filas' => $filas,
            'resumen' => [
                'filas' => count($filas),
                'productos' => collect($filas)->pluck('productoId')->unique()->count(),
                'ofertas' => collect($filas)->pluck('ofertaId')->unique()->count(),
                'corriendo' => count(array_filter($filas, fn ($f) => $f['corriendo'])),
                'graves' => count($graves),
                'medias' => count(array_filter($filas, fn ($f) => ($f['alarma']['severidad'] ?? null) === 'media')),
                'bajas' => count(array_filter($filas, fn ($f) => ($f['alarma']['severidad'] ?? null) === 'baja')),
                // La plata que se está regalando: mercadería vencida con descuento puesto. Sin duplicar si dos ofertas alcanzan el mismo registro.
                'plataGrave' => self::r2(collect($graves)->unique('vencimientoId')->sum('enJuego')),
            ],
        ];
    }

    /* ============================ EL RESUMEN ============================ */

    /** Las tarjetas del panel: rangos EXCLUYENTES sobre lo abierto + el histórico procesado. */
    public function resumen(): array
    {
        $hoy = self::hoyAr();
        $abiertos = Vencimiento::query()
            ->selectRaw("
                case
                    when DATEDIFF(fecha_vencimiento, ?) < 0 then 'vencido'
                    when DATEDIFF(fecha_vencimiento, ?) <= 7 then 'd7'
                    when DATEDIFF(fecha_vencimiento, ?) <= 15 then 'd15'
                    when DATEDIFF(fecha_vencimiento, ?) <= 30 then 'd30'
                    else 'vigente' end as rango,
                count(*) as n, coalesce(sum(cantidad), 0) as unidades, coalesce(sum(cantidad * costo_unitario), 0) as plata
            ", [$hoy, $hoy, $hoy, $hoy])
            ->where('procesado', false)
            ->groupBy('rango')
            ->get();

        $proc = Vencimiento::query()
            ->selectRaw('count(*) as n, coalesce(sum(unidades_vendidas), 0) as vendidas, coalesce(sum(cantidad - unidades_vendidas), 0) as perdidas, coalesce(sum((cantidad - unidades_vendidas) * costo_unitario), 0) as perdida_real')
            ->where('procesado', true)
            ->first();

        $ultimos = Vencimiento::query()
            ->selectRaw('*, DATEDIFF(fecha_vencimiento, ?) as dias_para_vencer', [$hoy])
            ->orderByDesc('id')->limit(5)->get()
            ->map(fn (Vencimiento $v) => [...$v->toArray(), 'diasParaVencer' => (int) $v->getAttribute('dias_para_vencer')]);

        $base = ['n' => 0, 'unidades' => 0.0, 'plata' => 0.0];
        $por = $abiertos->keyBy('rango')->map(fn ($a) => ['n' => (int) $a->n, 'unidades' => self::r2((float) $a->unidades), 'plata' => self::r2((float) $a->plata)]);

        return [
            'vencidos' => $por->get('vencido', $base), 'd7' => $por->get('d7', $base), 'd15' => $por->get('d15', $base),
            'd30' => $por->get('d30', $base), 'vigentes' => $por->get('vigente', $base),
            'procesados' => [
                'n' => (int) ($proc->n ?? 0), 'vendidas' => self::r2((float) ($proc->vendidas ?? 0)),
                'perdidas' => self::r2((float) ($proc->perdidas ?? 0)), 'perdidaReal' => self::r2((float) ($proc->perdida_real ?? 0)),
            ],
            'ultimos' => $ultimos->all(),
        ];
    }

    /* ============================ LOS REPORTES ============================ */

    /**
     * Todo el análisis del período en un viaje. Las mermas EXCLUYEN los
     * movimientos generados al procesar vencimientos (ya cuentan como pérdida
     * real del registro — sumarlos de nuevo duplicaría la plata).
     */
    public function reportes(string $periodo): array
    {
        $hoy = Carbon::now('America/Argentina/Buenos_Aires')->startOfDay();
        $desde = match ($periodo) {
            'semana' => $hoy->copy()->subDays(7),
            'trimestre' => $hoy->copy()->subMonths(3),
            'anio' => $hoy->copy()->startOfYear(),
            default => $hoy->copy()->startOfMonth(),
        };

        $perdidaRealExpr = '(cantidad - unidades_vendidas) * costo_unitario';

        $general = Vencimiento::query()
            ->where('created_at', '>=', $desde)
            ->selectRaw("
                count(*) as registros, coalesce(sum(cantidad), 0) as unidades, coalesce(sum(cantidad * costo_unitario), 0) as estimada,
                sum(procesado) as procesados,
                coalesce(sum(case when procesado then unidades_vendidas else 0 end), 0) as vendidas,
                coalesce(sum(case when procesado then {$perdidaRealExpr} else 0 end), 0) as `real`
            ")
            ->first();

        // Mermas del período: merma + defectuoso + vencido SUELTO (no nacido de procesar).
        $mermasG = DB::table('movimientos')
            ->whereIn('tipo', ['merma', 'defectuoso', 'vencido'])
            ->where('fecha', '>=', $desde)
            ->whereNotIn('id', function ($q) {
                $q->select('merma_movimiento_id')->from('vencimientos')->whereNotNull('merma_movimiento_id');
            })
            ->selectRaw('count(*) as registros, coalesce(sum(cantidad), 0) as unidades, coalesce(sum(cantidad * costo_unitario), 0) as plata')
            ->first();

        $porSucursalVenc = Vencimiento::query()
            ->where('created_at', '>=', $desde)
            ->selectRaw("sucursal_id, count(*) as registros, coalesce(sum(cantidad), 0) as unidades, coalesce(sum(cantidad * costo_unitario), 0) as estimada, coalesce(sum(case when procesado then {$perdidaRealExpr} else 0 end), 0) as `real`")
            ->groupBy('sucursal_id')->get();

        $porSucursalMerma = DB::table('movimientos')
            ->whereIn('tipo', ['merma', 'defectuoso', 'vencido'])
            ->where('fecha', '>=', $desde)
            ->whereNotIn('id', function ($q) {
                $q->select('merma_movimiento_id')->from('vencimientos')->whereNotNull('merma_movimiento_id');
            })
            ->selectRaw('sucursal_id, count(*) as registros, coalesce(sum(cantidad * costo_unitario), 0) as plata')
            ->groupBy('sucursal_id')->get()->keyBy('sucursal_id');

        $porCategoria = Vencimiento::query()
            ->join('productos', 'productos.id', '=', 'vencimientos.producto_id')
            ->leftJoin('categorias', 'categorias.id', '=', 'productos.categoria_id')
            ->where('vencimientos.created_at', '>=', $desde)
            ->selectRaw("coalesce(categorias.nombre, 'Sin categoría') as categoria, count(*) as registros, coalesce(sum(vencimientos.cantidad), 0) as unidades, coalesce(sum(vencimientos.cantidad * vencimientos.costo_unitario), 0) as estimada")
            ->groupBy('categoria')
            ->orderByDesc('estimada')
            ->get();

        // Los que MÁS vencen — histórico completo: la señal para comprar distinto.
        $frecuentes = Vencimiento::query()
            ->selectRaw('producto_id, presentacion_id, nombre, count(*) as veces, coalesce(sum(cantidad), 0) as unidades, coalesce(sum(cantidad * costo_unitario), 0) as plata')
            ->groupBy('producto_id', 'presentacion_id', 'nombre')
            ->orderByDesc('plata')->orderByDesc('unidades')
            ->limit(10)->get();

        $seisMeses = $hoy->copy()->subMonths(6);
        $historial = Vencimiento::query()
            ->where('created_at', '>=', $seisMeses)
            ->selectRaw("DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '-03:00'), '%Y-%m') as mes, count(*) as registros, coalesce(sum(cantidad), 0) as unidades, coalesce(sum(cantidad * costo_unitario), 0) as estimada, coalesce(sum(case when procesado then {$perdidaRealExpr} else 0 end), 0) as `real`")
            ->groupBy('mes')->orderByDesc('mes')
            ->get();

        $sesionesStats = VencimientoSesion::query()
            ->where('fecha', '>=', $desde)
            ->selectRaw('count(*) as sesiones, coalesce(sum(total_items), 0) as items, coalesce(sum(total_unidades), 0) as unidades')
            ->first();

        $sesiones = VencimientoSesion::query()
            ->leftJoin('usuarios', 'usuarios.id', '=', 'vencimiento_sesiones.usuario_id')
            ->join('sucursales', 'sucursales.id', '=', 'vencimiento_sesiones.sucursal_id')
            ->orderByDesc('vencimiento_sesiones.id')->limit(20)
            ->get([
                'vencimiento_sesiones.*',
                DB::raw("coalesce(usuarios.nombre, '—') as usuario_nombre"),
                'sucursales.nombre as sucursal_nombre',
            ]);

        return [
            'periodo' => ['clave' => $periodo ?: 'mes', 'desde' => $desde->toIso8601String()],
            'general' => [
                'registros' => (int) ($general->registros ?? 0), 'unidades' => self::r2((float) ($general->unidades ?? 0)),
                'estimada' => self::r2((float) ($general->estimada ?? 0)), 'procesados' => (int) ($general->procesados ?? 0),
                'vendidas' => self::r2((float) ($general->vendidas ?? 0)), 'real' => self::r2((float) ($general->real ?? 0)),
            ],
            'mermas' => [
                'registros' => (int) ($mermasG->registros ?? 0), 'unidades' => self::r2((float) ($mermasG->unidades ?? 0)), 'plata' => self::r2((float) ($mermasG->plata ?? 0)),
            ],
            'porSucursal' => $porSucursalVenc->map(function ($v) use ($porSucursalMerma) {
                $m = $porSucursalMerma->get($v->sucursal_id);
                $mermas = self::r2((float) ($m->plata ?? 0));

                return [
                    'sucursalId' => $v->sucursal_id, 'registros' => (int) $v->registros, 'unidades' => self::r2((float) $v->unidades),
                    'estimada' => self::r2((float) $v->estimada), 'real' => self::r2((float) $v->real), 'mermas' => $mermas,
                    'total' => self::r2((float) $v->estimada + $mermas),
                ];
            })->sortByDesc('total')->values()->all(),
            'porCategoria' => $porCategoria->map(fn ($c) => [
                'categoria' => $c->categoria, 'registros' => (int) $c->registros, 'unidades' => self::r2((float) $c->unidades), 'estimada' => self::r2((float) $c->estimada),
            ])->all(),
            'frecuentes' => $frecuentes->map(fn ($f) => [
                'productoId' => $f->producto_id, 'presentacionId' => $f->presentacion_id, 'nombre' => $f->nombre,
                'veces' => (int) $f->veces, 'unidades' => self::r2((float) $f->unidades), 'plata' => self::r2((float) $f->plata),
            ])->all(),
            'historial' => $historial->map(fn ($h) => [
                'mes' => $h->mes, 'registros' => (int) $h->registros, 'unidades' => self::r2((float) $h->unidades),
                'estimada' => self::r2((float) $h->estimada), 'real' => self::r2((float) $h->real),
            ])->all(),
            'sesiones' => [
                'stats' => [
                    'sesiones' => (int) ($sesionesStats->sesiones ?? 0), 'items' => (int) ($sesionesStats->items ?? 0), 'unidades' => self::r2((float) ($sesionesStats->unidades ?? 0)),
                ],
                'ultimas' => $sesiones->map(fn ($x) => [
                    'id' => $x->id, 'fecha' => Carbon::parse($x->fecha)->toIso8601String(), 'sucursalId' => $x->sucursal_id, 'usuarioId' => $x->usuario_id,
                    'totalItems' => (int) $x->total_items, 'totalUnidades' => self::r2((float) $x->total_unidades),
                    'usuarioNombre' => $x->usuario_nombre, 'sucursalNombre' => $x->sucursal_nombre,
                ])->all(),
            ],
        ];
    }
}
