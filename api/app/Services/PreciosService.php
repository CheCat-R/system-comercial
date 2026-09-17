<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Precios\Pricing;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * ACTUALIZACIÓN DE COSTOS Y MÁRGENES. En este sistema el precio de venta NO se
 * edita: se deriva de costo y margen, así que actualizar precios es mover una
 * de esas palancas. No hay endpoint de simulación (el panel ya tiene costos y
 * márgenes en memoria y previsualiza sin tocar la red); acá sólo llegan los
 * cambios aprobados. Todo cambio de costo queda en `producto_proveedor_costos`
 * (append-only), lo que habilita la auditoría y el deshacer por lote.
 */
class PreciosService
{
    public function __construct(private readonly HistorialPreciosService $evolucion) {}

    private function lote(string $prefijo): string
    {
        return $prefijo.base_convert((string) (int) (microtime(true) * 1000), 10, 36).Str::lower(Str::random(5));
    }

    /**
     * @param array{cambios: array<int, array{id:int, costo?:float, descuento?:float, flete?:float}>, origen?:string, motivo?:string, usuarioId?:?int, comprobanteId?:?int} $dto
     * @param bool $dentroDeTx true cuando la llama un documento dentro de su propia transacción (no toma snapshot)
     */
    public function actualizarCostos(array $dto, bool $dentroDeTx = false): array
    {
        $ejecutar = function () use ($dto) {
            $ids = array_values(array_unique(array_map(fn ($c) => (int) $c['id'], $dto['cambios'] ?? [])));
            if (! $ids) {
                throw new ErrorDeNegocio('No hay cambios para aplicar.');
            }
            if (count($ids) > 5000) {
                throw new ErrorDeNegocio('Demasiadas filas en una sola actualización (máximo 5000).');
            }
            $actuales = DB::table('producto_proveedores')->whereIn('id', $ids)->get()->keyBy('id');
            $finales = [];
            foreach ($dto['cambios'] as $c) {
                $a = $actuales->get((int) $c['id']);
                if (! $a) {
                    continue;
                }
                $nuevo = [
                    'id' => (int) $c['id'],
                    'costo' => Pricing::money(max(0, (float) ($c['costo'] ?? $a->costo))),
                    'descuento' => Pricing::money(max(0, (float) ($c['descuento'] ?? $a->descuento))),
                    'flete' => Pricing::money(max(0, (float) ($c['flete'] ?? $a->flete))),
                ];
                $sinCambio = abs($nuevo['costo'] - $a->costo) < 0.005 && abs($nuevo['descuento'] - $a->descuento) < 0.005 && abs($nuevo['flete'] - $a->flete) < 0.005;
                if (! $sinCambio) {
                    $finales[] = ['nuevo' => $nuevo, 'anterior' => $a];
                }
            }
            if (! $finales) {
                return ['ok' => true, 'actualizados' => 0, 'lote' => '', 'productoIds' => []];
            }
            $lote = $this->lote('L');
            $historial = [];
            foreach ($finales as ['nuevo' => $n, 'anterior' => $a]) {
                DB::table('producto_proveedores')->where('id', $n['id'])->update(['costo' => $n['costo'], 'descuento' => $n['descuento'], 'flete' => $n['flete'], 'updated_at' => now()]);
                $historial[] = [
                    'producto_proveedor_id' => $n['id'], 'fecha' => now(),
                    'costo_anterior' => $a->costo, 'descuento_anterior' => $a->descuento, 'flete_anterior' => $a->flete,
                    'costo' => $n['costo'], 'descuento' => $n['descuento'], 'flete' => $n['flete'],
                    'origen' => $dto['origen'] ?? 'manual', 'motivo' => $dto['motivo'] ?? '', 'lote' => $lote,
                    'usuario_id' => $dto['usuarioId'] ?? null, 'comprobante_id' => $dto['comprobanteId'] ?? null,
                ];
            }
            DB::table('producto_proveedor_costos')->insert($historial);

            return [
                'ok' => true, 'actualizados' => count($finales), 'lote' => $lote,
                'productoIds' => array_values(array_unique(array_map(fn ($f) => (int) $f['anterior']->producto_id, $finales))),
            ];
        };
        if ($dentroDeTx) {
            return $ejecutar();
        }
        $res = DB::transaction($ejecutar);
        $this->evolucion->snapshot($res['productoIds'], 'costo', ['detalle' => $dto['motivo'] ?? '', 'usuarioId' => $dto['usuarioId'] ?? null]);

        return $res;
    }

    /** @param array{cambios: array<int, array{id:int, valor:float}>, motivo?:string, usuarioId?:?int} $dto */
    public function actualizarMargenes(array $dto): array
    {
        $cambios = array_values(array_filter($dto['cambios'] ?? [], fn ($c) => isset($c['id'], $c['valor']) && is_numeric($c['valor'])));
        if (! $cambios) {
            throw new ErrorDeNegocio('No hay cambios para aplicar.');
        }
        if (count($cambios) > 5000) {
            throw new ErrorDeNegocio('Demasiadas filas en una sola actualización (máximo 5000).');
        }
        $actuales = DB::table('producto_listas')->whereIn('id', array_column($cambios, 'id'))->get()->keyBy('id');
        $finales = [];
        foreach ($cambios as $c) {
            $a = $actuales->get((int) $c['id']);
            if (! $a || $a->modo_precio === 'precio') {
                continue;
            }
            $nuevo = Pricing::money(max(0, (float) $c['valor']));
            if (abs($nuevo - $a->markup) >= 0.005) {
                $finales[] = ['id' => (int) $c['id'], 'valor' => $nuevo, 'productoId' => (int) $a->producto_id];
            }
        }
        if (! $finales) {
            return ['ok' => true, 'actualizados' => 0];
        }
        DB::transaction(function () use ($finales) {
            foreach ($finales as $f) {
                DB::table('producto_listas')->where('id', $f['id'])->update(['markup' => $f['valor'], 'updated_at' => now()]);
            }
        });
        $this->evolucion->snapshot(
            array_values(array_unique(array_column($finales, 'productoId'))), 'formato_venta',
            ['detalle' => $dto['motivo'] ?? 'Actualización masiva de márgenes', 'usuarioId' => $dto['usuarioId'] ?? null],
        );

        return ['ok' => true, 'actualizados' => count($finales)];
    }

    /**
     * Cambia el formato ACTIVO de varios productos a un proveedor. Se audita en
     * la misma tabla que los costos: mueve el precio tanto como un cambio de costo.
     *
     * @param array{productoIds: int[], proveedorId:int, origen?:string, motivo?:string, usuarioId?:?int, comprobanteId?:?int} $o
     */
    public function activarProveedor(array $o, bool $dentroDeTx = false): array
    {
        $ejecutar = function () use ($o) {
            $ids = array_values(array_unique(array_filter(array_map('intval', $o['productoIds'] ?? []))));
            if (! $ids) {
                return ['ok' => true, 'activados' => 0, 'lote' => '', 'productoIds' => []];
            }
            $porProducto = DB::table('producto_proveedores')->whereIn('producto_id', $ids)->orderBy('id')->get()->groupBy('producto_id');
            $cambios = [];
            foreach ($ids as $pid) {
                $suyos = $porProducto[$pid] ?? collect();
                $destino = $suyos->firstWhere('proveedor_id', (int) $o['proveedorId']);
                if (! $destino) {
                    continue; // ese proveedor no lo vende
                }
                $actual = $suyos->firstWhere('usar_para_precio', 1) ?? $suyos->firstWhere('usar_para_precio', true);
                if ($actual && $actual->id === $destino->id) {
                    continue; // ya manda
                }
                $cambios[] = ['actual' => $actual, 'destino' => $destino];
            }
            if (! $cambios) {
                return ['ok' => true, 'activados' => 0, 'lote' => '', 'productoIds' => []];
            }
            $lote = $this->lote('A');
            $historial = [];
            foreach ($cambios as ['actual' => $actual, 'destino' => $destino]) {
                DB::table('producto_proveedores')->where('producto_id', $destino->producto_id)->update(['usar_para_precio' => false]);
                DB::table('producto_proveedores')->where('id', $destino->id)->update(['usar_para_precio' => true]);
                $historial[] = [
                    'producto_proveedor_id' => $destino->id, 'fecha' => now(),
                    'costo_anterior' => $destino->costo, 'descuento_anterior' => $destino->descuento, 'flete_anterior' => $destino->flete,
                    'costo' => $destino->costo, 'descuento' => $destino->descuento, 'flete' => $destino->flete,
                    'activo_anterior' => $actual?->id, 'activo_nuevo' => $destino->id,
                    'origen' => $o['origen'] ?? 'manual', 'motivo' => $o['motivo'] ?? 'Cambio de formato de compra activo', 'lote' => $lote,
                    'usuario_id' => $o['usuarioId'] ?? null, 'comprobante_id' => $o['comprobanteId'] ?? null,
                ];
            }
            DB::table('producto_proveedor_costos')->insert($historial);

            return ['ok' => true, 'activados' => count($cambios), 'lote' => $lote, 'productoIds' => array_map(fn ($c) => (int) $c['destino']->producto_id, $cambios)];
        };
        if ($dentroDeTx) {
            return $ejecutar();
        }
        $res = DB::transaction($ejecutar);
        if ($res['productoIds']) {
            $this->evolucion->snapshot($res['productoIds'], 'activacion', ['detalle' => $o['motivo'] ?? '', 'usuarioId' => $o['usuarioId'] ?? null]);
        }

        return $res;
    }

    public function historial(array $q): array
    {
        return DB::table('producto_proveedor_costos as c')
            ->join('producto_proveedores as pp', 'pp.id', '=', 'c.producto_proveedor_id')
            ->join('productos as p', 'p.id', '=', 'pp.producto_id')
            ->join('proveedores as pr', 'pr.id', '=', 'pp.proveedor_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->when(! empty($q['productoId']), fn ($b) => $b->where('pp.producto_id', (int) $q['productoId']))
            ->when(! empty($q['proveedorId']), fn ($b) => $b->where('pp.proveedor_id', (int) $q['proveedorId']))
            ->when(! empty($q['lote']), fn ($b) => $b->where('c.lote', $q['lote']))
            ->orderByDesc('c.id')
            ->limit(min(max((int) ($q['limit'] ?? 100), 1), 500))
            ->get([
                'c.id', 'c.fecha', 'c.lote', 'c.origen', 'c.motivo', 'c.comprobante_id', 'c.producto_proveedor_id',
                'c.costo_anterior', 'c.descuento_anterior', 'c.flete_anterior', 'c.costo', 'c.descuento', 'c.flete',
                'c.activo_anterior', 'c.activo_nuevo', 'pp.producto_id', 'p.nombre as producto', 'pr.nombre as proveedor', 'u.nombre as usuario',
            ])
            ->map(fn ($f) => [
                'id' => $f->id, 'fecha' => $f->fecha, 'lote' => $f->lote, 'origen' => $f->origen, 'motivo' => $f->motivo,
                'comprobanteId' => $f->comprobante_id, 'productoProveedorId' => $f->producto_proveedor_id,
                'costoAnterior' => (float) $f->costo_anterior, 'descuentoAnterior' => (float) $f->descuento_anterior, 'fleteAnterior' => (float) $f->flete_anterior,
                'costo' => (float) $f->costo, 'descuento' => (float) $f->descuento, 'flete' => (float) $f->flete,
                'activoAnterior' => $f->activo_anterior, 'activoNuevo' => $f->activo_nuevo,
                'productoId' => $f->producto_id, 'producto' => $f->producto, 'proveedor' => $f->proveedor, 'usuario' => $f->usuario,
            ])->all();
    }

    /** Deshace una tanda; saltea lo que cambió después. */
    public function revertirLote(string $lote, ?int $usuarioId = null): array
    {
        if ($lote === '') {
            throw new ErrorDeNegocio('Indicá el lote a revertir.');
        }
        $res = DB::transaction(function () use ($lote, $usuarioId) {
            $filas = DB::table('producto_proveedor_costos')->where('lote', $lote)->get();
            if ($filas->isEmpty()) {
                throw new ErrorDeNegocio('No existe ese lote de actualización.');
            }
            $actuales = DB::table('producto_proveedores')->whereIn('id', $filas->pluck('producto_proveedor_id'))->get()->keyBy('id');
            $prodIds = $actuales->pluck('producto_id')->unique()->values()->all();
            $revertibles = [];
            $salteadas = [];
            foreach ($filas as $f) {
                $a = $actuales->get($f->producto_proveedor_id);
                if (! $a) {
                    $salteadas[] = ['id' => $f->producto_proveedor_id, 'motivo' => 'La entrada ya no existe.'];

                    continue;
                }
                $intacta = abs($a->costo - $f->costo) < 0.005 && abs($a->descuento - $f->descuento) < 0.005 && abs($a->flete - $f->flete) < 0.005;
                if (! $intacta) {
                    $salteadas[] = ['id' => $f->producto_proveedor_id, 'motivo' => 'Cambió después de este lote.'];

                    continue;
                }
                if ($f->activo_nuevo !== null) {
                    $vigente = $actuales->get($f->activo_nuevo);
                    if (! $vigente || ! $vigente->usar_para_precio) {
                        $salteadas[] = ['id' => $f->producto_proveedor_id, 'motivo' => 'El formato activo cambió después de este lote.'];

                        continue;
                    }
                }
                $revertibles[] = [$f, $a];
            }
            if ($revertibles) {
                $nuevoLote = $this->lote('R');
                $historial = [];
                foreach ($revertibles as [$f, $a]) {
                    DB::table('producto_proveedores')->where('id', $f->producto_proveedor_id)
                        ->update(['costo' => $f->costo_anterior, 'descuento' => $f->descuento_anterior, 'flete' => $f->flete_anterior, 'updated_at' => now()]);
                    if ($f->activo_nuevo !== null) {
                        DB::table('producto_proveedores')->where('producto_id', $a->producto_id)->update(['usar_para_precio' => false]);
                        if ($f->activo_anterior !== null) {
                            DB::table('producto_proveedores')->where('id', $f->activo_anterior)->update(['usar_para_precio' => true]);
                        }
                    }
                    $historial[] = [
                        'producto_proveedor_id' => $f->producto_proveedor_id, 'fecha' => now(),
                        'costo_anterior' => $a->costo, 'descuento_anterior' => $a->descuento, 'flete_anterior' => $a->flete,
                        'costo' => $f->costo_anterior, 'descuento' => $f->descuento_anterior, 'flete' => $f->flete_anterior,
                        'activo_anterior' => $f->activo_nuevo, 'activo_nuevo' => $f->activo_nuevo !== null ? $f->activo_anterior : null,
                        'origen' => 'reversion', 'motivo' => 'Reversión del lote '.$lote, 'lote' => $nuevoLote, 'usuario_id' => $usuarioId,
                    ];
                }
                DB::table('producto_proveedor_costos')->insert($historial);
            }

            return ['ok' => true, 'revertidos' => count($revertibles), 'salteados' => $salteadas, 'productoIds' => $prodIds];
        });
        if ($res['productoIds']) {
            $this->evolucion->snapshot($res['productoIds'], 'reversion', ['detalle' => 'Reversión del lote '.$lote, 'usuarioId' => $usuarioId]);
        }

        return $res;
    }
}
