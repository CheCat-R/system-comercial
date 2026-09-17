<?php

namespace App\Inventario;

use App\Exceptions\ErrorDeNegocio;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * INCIDENCIAS: mercadería apartada (disponible → comprometido) hasta que
 * alguien decida qué pasó con ella: liberar, merma, vencido o defectuoso.
 */
class IncidenciasService extends StockCore
{
    public const RESOLUCIONES = ['liberar', 'merma', 'vencido', 'defectuoso'];

    private function exigirSucursal(object $inc, ?int $soloSuc): void
    {
        if ($soloSuc !== null && (int) $inc->sucursal_id !== $soloSuc) {
            throw new AccessDeniedHttpException('Esa incidencia es de otra sucursal.');
        }
    }

    public function crear(array $o, ?int $autorId = null): array
    {
        return DB::transaction(function () use ($o, $autorId) {
            $prod = $this->producto((int) ($o['productoId'] ?? 0));
            if (! $prod) {
                throw new ErrorDeNegocio('Producto inválido.');
            }
            $presId = (int) ($o['presId'] ?? 0) ?: null;
            $sucId = (int) $o['sucursalId'];
            $c = (float) ($o['cantidad'] ?? 0);
            if (! ($c > 0)) {
                throw new ErrorDeNegocio('Ingresá la cantidad comprometida.');
            }
            $tipo = $prod->tipo->value;
            $disp = $this->cant($prod->id, $sucId, $presId, 'disponible');
            if ($c > $disp + self::EPS) {
                throw new ErrorDeNegocio('No hay tanto stock disponible. Disponible: '.$this->fmtCant($tipo, $presId, $disp).'.');
            }
            $this->move($prod->id, $sucId, $presId, 'disponible', 'comprometido', $c);
            $id = DB::table('incidencias')->insertGetId([
                'codigo' => '', 'fecha' => now(), 'tipo' => (string) ($o['tipo'] ?? 'otro'), 'estado' => 'pendiente',
                'responsable_id' => $o['responsableId'] ?? null, 'motivo' => (string) ($o['motivo'] ?? ''),
                'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'presentacion_id' => $presId, 'cantidad' => $c,
                'unidad' => $this->unidadDe($tipo, $presId), 'created_at' => now(), 'updated_at' => now(),
            ]);
            $codigo = 'INC'.str_pad((string) $id, 4, '0', STR_PAD_LEFT);
            DB::table('incidencias')->where('id', $id)->update(['codigo' => $codigo]);
            $this->mov([
                'tipo' => 'ajuste', 'producto_id' => $prod->id, 'sucursal_id' => $sucId, 'presentacion_id' => $presId, 'signo' => 0, 'cantidad' => $c,
                'unidad' => $this->unidadDe($tipo, $presId), 'estado_desde' => 'disponible', 'estado_hacia' => 'comprometido',
                'ref_incidencia_id' => $id, 'usuario_id' => $autorId,
                'descripcion' => $codigo.' ('.($o['tipo'] ?? 'otro').'): '.$this->fmtCant($tipo, $presId, $c).' a comprometido',
            ]);

            return ['ok' => true, 'id' => $id, 'codigo' => $codigo];
        });
    }

    public function avanzar(int $id, ?int $soloSuc = null): array
    {
        $inc = DB::table('incidencias')->find($id);
        if (! $inc) {
            throw new NotFoundHttpException('Incidencia inexistente.');
        }
        $this->exigirSucursal($inc, $soloSuc);
        $gano = DB::table('incidencias')->where('id', $id)->where('estado', 'pendiente')->update(['estado' => 'revision', 'updated_at' => now()]);
        if (! $gano) {
            throw new ErrorDeNegocio("Usá 'Resolver' para cerrar la incidencia.");
        }

        return ['ok' => true];
    }

    public function resolver(int $id, string $resolucion, ?int $autorId = null, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $resolucion, $autorId, $soloSuc) {
            $inc = DB::table('incidencias')->where('id', $id)->lockForUpdate()->first();
            if (! $inc) {
                throw new NotFoundHttpException('Incidencia inexistente.');
            }
            $this->exigirSucursal($inc, $soloSuc);
            if ($inc->estado === 'resuelta') {
                throw new ErrorDeNegocio('La incidencia ya está resuelta.');
            }
            if (! in_array($resolucion, self::RESOLUCIONES, true)) {
                throw new ErrorDeNegocio('Resolución inválida.');
            }
            $gano = DB::table('incidencias')->where('id', $id)->where('estado', '!=', 'resuelta')->update(['estado' => 'resuelta']);
            if (! $gano) {
                throw new ErrorDeNegocio('La incidencia ya está resuelta.');
            }
            $prod = $this->producto($inc->producto_id);
            $c = (float) $inc->cantidad;
            $comprom = $this->cant($prod->id, $inc->sucursal_id, $inc->presentacion_id, 'comprometido');
            if ($c > $comprom + self::EPS) {
                throw new ErrorDeNegocio('El stock comprometido cambió; revisá manualmente.');
            }
            $this->addDelta($this->coord($prod->id, $inc->sucursal_id, $inc->presentacion_id, 'comprometido'), -$c);
            $tipoMov = 'ajuste';
            $estadoHacia = null;
            if ($resolucion === 'liberar') {
                $this->addDelta($this->coord($prod->id, $inc->sucursal_id, $inc->presentacion_id, 'disponible'), $c);
                $estadoHacia = 'disponible';
            } elseif ($resolucion === 'merma') {
                $tipoMov = 'merma';
            } else {
                $tipoMov = $resolucion;
                $this->addDelta($this->coord($prod->id, $inc->sucursal_id, $inc->presentacion_id, $resolucion), $c);
                $estadoHacia = $resolucion;
            }
            DB::table('incidencias')->where('id', $id)->update([
                'resolucion' => $resolucion, 'fecha_resolucion' => now(), 'activa' => false, 'updated_at' => now(),
            ]);
            $esPerdida = $resolucion !== 'liberar';
            $this->mov([
                'tipo' => $tipoMov, 'producto_id' => $prod->id, 'sucursal_id' => $inc->sucursal_id, 'presentacion_id' => $inc->presentacion_id,
                'signo' => $resolucion === 'liberar' ? 0 : -1, 'cantidad' => $c, 'unidad' => $inc->unidad,
                'estado_desde' => 'comprometido', 'estado_hacia' => $estadoHacia,
                'costo_unitario' => $esPerdida ? $this->costoDePerdida($prod, $inc->presentacion_id) : 0,
                'motivo' => 'Incidencia '.$inc->codigo.' · '.$inc->tipo, 'usuario_id' => $autorId, 'ref_incidencia_id' => $inc->id,
                'descripcion' => $inc->codigo.' resuelta: '.($resolucion === 'liberar' ? 'liberado a disponible' : 'baja por '.$resolucion),
            ]);

            return ['ok' => true];
        });
    }

    public function listar(?int $soloSuc = null)
    {
        return DB::table('incidencias')
            ->when($soloSuc !== null, fn ($q) => $q->where('sucursal_id', $soloSuc))
            ->orderByDesc('id')->get();
    }
}
