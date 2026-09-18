<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Precios\Pricing;
use App\Support\Fila;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * CAJA — turnos del punto de venta.
 *
 *  - Una sola sesión `abierta` por sucursal (candado en la base).
 *  - El turno no se borra ni se reabre: se cierra con su arqueo y queda.
 *  - Al cerrar se cuenta el EFECTIVO; los demás medios se guardan como foto.
 *
 * Todo lo que ESCRIBE dentro de un turno (movimiento manual, venta, cobranza,
 * nota de crédito) toma la sesión con `lockForUpdate` dentro de su transacción:
 * mientras el cierre cuenta, nadie puede confirmar algo que el arqueo no vio.
 */
class CajaService
{
    public function getOpcional(int $id): ?object
    {
        return DB::table('caja_sesiones')->find($id);
    }

    public function get(int $id): object
    {
        $c = $this->getOpcional($id);
        if (! $c) {
            throw new NotFoundHttpException('Turno de caja inexistente.');
        }

        return $c;
    }

    /** Turno abierto de la sucursal, o null. */
    public function actual(int $sucursalId): ?object
    {
        return DB::table('caja_sesiones')->where('sucursal_id', $sucursalId)->where('estado', 'abierta')->first();
    }

    public function listar(array $q): array
    {
        $qb = DB::table('caja_sesiones as c')->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->leftJoin('sucursales as s', 's.id', '=', 'c.sucursal_id')
            ->select('c.*', 'u.nombre as usuario_nombre', 's.nombre as sucursal_nombre');
        if (! empty($q['sucursalId'])) {
            $qb->where('c.sucursal_id', (int) $q['sucursalId']);
        }
        if (! empty($q['estado'])) {
            $qb->where('c.estado', $q['estado']);
        }
        $limit = min(max((int) ($q['limit'] ?? 50), 1), 200);

        return Fila::camelTodos($qb->orderByDesc('c.id')->limit($limit)->get());
    }

    /**
     * Arqueo: qué entró por cada medio y cuánto efectivo debería haber en el
     * cajón. Siempre en vivo, nunca cacheado.
     */
    public function arqueo(int $id): array
    {
        $sesion = $this->get($id);
        $porVenta = DB::table('venta_pagos as vp')->join('ventas as v', 'v.id', '=', 'vp.venta_id')
            ->where('v.caja_sesion_id', $id)->where('v.estado', 'confirmada')
            ->groupBy('vp.medio')->select('vp.medio', DB::raw('coalesce(sum(vp.importe),0) as total'))->get();
        $porCobranza = DB::table('cobranza_pagos as cp')->join('cobranzas as c', 'c.id', '=', 'cp.cobranza_id')
            ->where('c.caja_sesion_id', $id)->where('c.estado', 'confirmada')
            ->groupBy('cp.medio')->select('cp.medio', DB::raw('coalesce(sum(cp.importe),0) as total'))->get();
        $movs = DB::table('caja_movimientos as m')->leftJoin('usuarios as u', 'u.id', '=', 'm.usuario_id')
            ->where('m.caja_sesion_id', $id)->orderBy('m.id')->select('m.*', 'u.nombre as usuario_nombre')->get();
        $controles = DB::table('caja_controles as c')->leftJoin('usuarios as u', 'u.id', '=', 'c.usuario_id')
            ->where('c.caja_sesion_id', $id)->orderBy('c.id')->select('c.*', 'u.nombre as usuario_nombre')->get();

        $medios = [];
        $acumular = function ($filas, string $campo) use (&$medios) {
            foreach ($filas as $f) {
                $m = $medios[$f->medio] ?? ['ventas' => 0.0, 'cobranzas' => 0.0, 'total' => 0.0];
                $m[$campo] = Pricing::money((float) $f->total);
                $m['total'] = Pricing::money($m['ventas'] + $m['cobranzas']);
                $medios[$f->medio] = $m;
            }
        };
        $acumular($porVenta, 'ventas');
        $acumular($porCobranza, 'cobranzas');

        $ingresos = Pricing::money((float) $movs->where('tipo', 'ingreso')->sum('importe'));
        $egresos = Pricing::money((float) $movs->where('tipo', 'egreso')->sum('importe'));
        $efectivo = $medios['efectivo'] ?? ['ventas' => 0, 'cobranzas' => 0, 'total' => 0];
        $esperado = Pricing::money((float) $sesion->monto_inicial + $efectivo['total'] + $ingresos - $egresos);

        /* Ventas en cuenta corriente: no entran a la caja pero se ven. Las notas de crédito RESTAN. */
        $cc = DB::table('ventas')->where('caja_sesion_id', $id)->where('estado', 'confirmada')->where('condicion_pago', 'cuenta_corriente')
            ->selectRaw("coalesce(sum(total * (case when tipo like 'nota_credito%' then -1 else 1 end)),0) as total, sum(case when tipo not like 'nota_credito%' then 1 else 0 end) as n")->first();

        return [
            'sesion' => Fila::camel($sesion),
            'medios' => $medios,
            'movimientos' => Fila::camelTodos($movs),
            'controles' => Fila::camelTodos($controles),
            'ingresos' => $ingresos,
            'egresos' => $egresos,
            'montoInicial' => (float) $sesion->monto_inicial,
            'esperadoEfectivo' => $esperado,
            'totalCobrado' => Pricing::money(array_sum(array_map(fn ($m) => $m['total'], $medios))),
            'ctaCte' => ['total' => Pricing::money((float) ($cc->total ?? 0)), 'cantidad' => (int) ($cc->n ?? 0)],
        ];
    }

    /* ------------------------------ Escritura ------------------------------ */

    public function abrir(int $sucursalId, int $usuarioId, float $montoInicial, string $observaciones = ''): array
    {
        if ($this->actual($sucursalId)) {
            throw new ErrorDeNegocio('Ya hay un turno de caja abierto en esta sucursal. Cerralo antes de abrir otro.');
        }
        $montoInicial = Pricing::money($montoInicial);
        if ($montoInicial <= 0) {
            throw new ErrorDeNegocio('Declará el fondo inicial: la caja siempre arranca con un monto.');
        }
        try {
            $id = DB::table('caja_sesiones')->insertGetId([
                'sucursal_id' => $sucursalId, 'usuario_id' => $usuarioId, 'apertura' => now(), 'monto_inicial' => $montoInicial,
                'estado' => 'abierta', 'observaciones' => $observaciones, 'created_at' => now(), 'updated_at' => now(),
            ]);
        } catch (QueryException $e) {
            // El chequeo de arriba es cortesía; el candado es el índice único (doble clic).
            if (str_contains($e->getMessage(), 'uq_caja_abierta_por_sucursal')) {
                throw new ErrorDeNegocio('Ya hay un turno de caja abierto en esta sucursal. Cerralo antes de abrir otro.');
            }
            throw $e;
        }

        return Fila::camel($this->get($id));
    }

    /** Cierra el turno con la sesión BLOQUEADA: nada entra mientras se cuenta. */
    public function cerrar(int $id, float $declarado, ?string $observaciones, ?int $sucursalSesion): array
    {
        $declarado = Pricing::money($declarado);
        if ($declarado < 0) {
            throw new ErrorDeNegocio('El efectivo declarado no puede ser negativo.');
        }

        return DB::transaction(function () use ($id, $declarado, $observaciones, $sucursalSesion) {
            $sesion = DB::table('caja_sesiones')->where('id', $id)->lockForUpdate()->first();
            if (! $sesion) {
                throw new NotFoundHttpException('Turno de caja inexistente.');
            }
            if ($sucursalSesion !== null && (int) $sesion->sucursal_id !== $sucursalSesion) {
                throw new AccessDeniedHttpException('Ese turno es de otra sucursal.');
            }
            if ($sesion->estado === 'cerrada') {
                throw new ErrorDeNegocio('El turno ya está cerrado.');
            }
            $a = $this->arqueo($id);
            DB::table('caja_sesiones')->where('id', $id)->update([
                'cierre' => now(), 'declarado_efectivo' => $declarado, 'sistema_efectivo' => $a['esperadoEfectivo'],
                'diferencia' => Pricing::money($declarado - $a['esperadoEfectivo']),
                'totales' => json_encode(['medios' => $a['medios'], 'ingresos' => $a['ingresos'], 'egresos' => $a['egresos'], 'ctaCte' => $a['ctaCte']]),
                'estado' => 'cerrada', 'observaciones' => $observaciones ?? $sesion->observaciones, 'updated_at' => now(),
            ]);

            return Fila::camel($this->get($id));
        });
    }

    /** Control intermedio: se cuenta el efectivo SIN cerrar. Solo control. */
    public function control(int $id, float $contado, string $observaciones, int $usuarioId, ?int $sucursalSesion): array
    {
        $sesion = $this->get($id);
        if ($sucursalSesion !== null && (int) $sesion->sucursal_id !== $sucursalSesion) {
            throw new AccessDeniedHttpException('Ese turno es de otra sucursal.');
        }
        if ($sesion->estado !== 'abierta') {
            throw new ErrorDeNegocio('El turno está cerrado: los controles son entre la apertura y el cierre.');
        }
        $contado = Pricing::money($contado);
        if ($contado < 0) {
            throw new ErrorDeNegocio('El efectivo contado no puede ser negativo.');
        }
        $a = $this->arqueo($id);
        $cid = DB::table('caja_controles')->insertGetId([
            'caja_sesion_id' => $id, 'fecha' => now(), 'esperado_efectivo' => $a['esperadoEfectivo'], 'contado_efectivo' => $contado,
            'diferencia' => Pricing::money($contado - $a['esperadoEfectivo']), 'observaciones' => trim($observaciones), 'usuario_id' => $usuarioId,
        ]);

        return Fila::camel(DB::table('caja_controles')->find($cid));
    }

    public function movimiento(int $id, string $tipo, float $importe, string $motivo, int $usuarioId, ?int $sucursalSesion): array
    {
        $importe = Pricing::money($importe);
        if ($importe <= 0) {
            throw new ErrorDeNegocio('El importe debe ser mayor a 0.');
        }
        if (trim($motivo) === '') {
            throw new ErrorDeNegocio('Indicá el motivo del movimiento.');
        }

        return DB::transaction(function () use ($id, $tipo, $importe, $motivo, $usuarioId, $sucursalSesion) {
            $sesion = DB::table('caja_sesiones')->where('id', $id)->lockForUpdate()->first();
            if (! $sesion) {
                throw new NotFoundHttpException('Turno de caja inexistente.');
            }
            if ($sucursalSesion !== null && (int) $sesion->sucursal_id !== $sucursalSesion) {
                throw new AccessDeniedHttpException('Ese turno es de otra sucursal.');
            }
            if ($sesion->estado !== 'abierta') {
                throw new ErrorDeNegocio('El turno está cerrado.');
            }
            $mid = DB::table('caja_movimientos')->insertGetId([
                'caja_sesion_id' => $id, 'fecha' => now(), 'tipo' => $tipo, 'importe' => $importe, 'motivo' => trim($motivo), 'usuario_id' => $usuarioId,
            ]);

            return Fila::camel(DB::table('caja_movimientos')->find($mid));
        });
    }

    /** Turno válido para operar: si la caja es obligatoria y no hay, se rechaza acá. */
    public function exigirTurno(int $sucursalId, bool $obligatoria): ?object
    {
        $abierta = $this->actual($sucursalId);
        if (! $abierta && $obligatoria) {
            throw new ErrorDeNegocio('No hay un turno de caja abierto en esta sucursal. Abrí la caja para vender.');
        }

        return $abierta;
    }
}
