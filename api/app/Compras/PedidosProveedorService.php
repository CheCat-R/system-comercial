<?php

namespace App\Compras;

use App\Exceptions\ErrorDeNegocio;
use App\Support\Fila;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * PEDIDOS AL PROVEEDOR — la pizarra entre el admin y el encargado de compras:
 * a quién hay que pedirle, a quién ya se le pidió, qué llegó. NO toca stock ni
 * deuda (eso pasa al confirmar la factura) y los ítems van en texto libre.
 *
 *   solicitado → hay que pedirle (con `pedidoEnviado` y `revisadoAt` como flags)
 *   pedido     → confirmado con el proveedor (queda fechaPedido)
 *   recibido   → llegó (queda fechaRecepcion; alimenta el historial)
 *   retomar    → aparcado sin fecha
 *
 * Cualquier cambio de estado resetea los dos flags: solo significan algo en
 * Solicitado, y si la tarjeta vuelve, vuelve limpia.
 */
class PedidosProveedorService
{
    public const ESTADOS = ['solicitado', 'pedido', 'recibido', 'retomar'];

    private function base()
    {
        return DB::table('pedidos_proveedor as pp')->leftJoin('proveedores as p', 'p.id', '=', 'pp.proveedor_id')->select('pp.*', DB::raw("coalesce(p.nombre,'') as proveedor_nombre"));
    }

    private function productosPorProveedor(array $ids): array
    {
        if (! $ids) {
            return [];
        }

        return DB::table('producto_proveedores')->whereIn('proveedor_id', $ids)->groupBy('proveedor_id')->selectRaw('proveedor_id, count(*) as n')->pluck('n', 'proveedor_id')->map(fn ($n) => (int) $n)->all();
    }

    /** El kanban: todo lo que NO está recibido. */
    public function kanban(): array
    {
        $filas = $this->base()->where('pp.estado', '!=', 'recibido')->orderByDesc('pp.fecha_alta')->orderByDesc('pp.id')->get();
        $prods = $this->productosPorProveedor($filas->pluck('proveedor_id')->unique()->all());

        return $filas->map(fn ($f) => [...Fila::camel($f), 'productosProveedor' => $prods[$f->proveedor_id] ?? 0])->all();
    }

    public function get(int $id): array
    {
        $p = $this->base()->where('pp.id', $id)->first();
        if (! $p) {
            throw new NotFoundHttpException('Pedido inexistente.');
        }

        return Fila::camel($p);
    }

    private function validarProveedor(int $id): void
    {
        if (! DB::table('proveedores')->where('id', $id)->exists()) {
            throw new ErrorDeNegocio('Proveedor inválido.');
        }
    }

    /** Alta de a varios: una tarjeta por proveedor, todas en Solicitado. */
    public function alta(array $proveedorIds, ?string $notas, ?int $usuarioId): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $proveedorIds))));
        if (! $ids) {
            throw new ErrorDeNegocio('Elegí al menos un proveedor.');
        }
        $validos = DB::table('proveedores')->whereIn('id', $ids)->pluck('id');
        if ($validos->isEmpty()) {
            throw new ErrorDeNegocio('Ningún proveedor válido.');
        }
        $creados = [];
        foreach ($validos as $pid) {
            $creados[] = DB::table('pedidos_proveedor')->insertGetId(['proveedor_id' => $pid, 'notas' => trim((string) $notas), 'fecha_alta' => now(), 'usuario_id' => $usuarioId]);
        }

        return ['creados' => count($creados), 'ids' => $creados];
    }

    /** "Ya lo pedí por teléfono, registralo": nace directo en Pedido, con fecha. */
    public function directo(int $proveedorId, ?string $notas, ?int $usuarioId): array
    {
        $this->validarProveedor($proveedorId);
        $id = DB::table('pedidos_proveedor')->insertGetId(['proveedor_id' => $proveedorId, 'estado' => 'pedido', 'fecha_pedido' => now(), 'fecha_alta' => now(), 'notas' => trim((string) $notas), 'usuario_id' => $usuarioId]);

        return $this->get($id);
    }

    public function editar(int $id, array $d): array
    {
        $this->get($id);
        $patch = [];
        if (! empty($d['proveedorId'])) {
            $this->validarProveedor((int) $d['proveedorId']);
            $patch['proveedor_id'] = (int) $d['proveedorId'];
        }
        if (array_key_exists('notas', $d) && $d['notas'] !== null) {
            $patch['notas'] = trim((string) $d['notas']);
        }
        if ($patch) {
            DB::table('pedidos_proveedor')->where('id', $id)->update($patch);
        }

        return $this->get($id);
    }

    public function cambiarEstado(int $id, string $nuevo): array
    {
        if (! in_array($nuevo, self::ESTADOS, true)) {
            throw new ErrorDeNegocio('Estado inválido.');
        }
        $actual = $this->get($id);
        $set = ['estado' => $nuevo, 'pedido_enviado' => false, 'revisado_at' => null];
        // Las fechas se ganan al avanzar y no se pisan si ya estaban.
        if ($nuevo === 'pedido' && ! $actual['fechaPedido']) {
            $set['fecha_pedido'] = now();
        }
        if ($nuevo === 'recibido') {
            $set['fecha_recepcion'] = now();
            if (! $actual['fechaPedido']) {
                $set['fecha_pedido'] = now();
            }
        }
        DB::table('pedidos_proveedor')->where('id', $id)->update($set);

        return $this->get($id);
    }

    public function toggleEnviado(int $id): array
    {
        $p = $this->get($id);
        if ($p['estado'] !== 'solicitado') {
            throw new ErrorDeNegocio('El tilde "pedido enviado" es de las tarjetas en Solicitado.');
        }
        DB::table('pedidos_proveedor')->where('id', $id)->update(['pedido_enviado' => ! $p['pedidoEnviado']]);

        return $this->get($id);
    }

    public function marcarRevisado(int $id, bool $deshacer): array
    {
        $p = $this->get($id);
        if ($p['estado'] !== 'solicitado') {
            throw new ErrorDeNegocio('"Ya lo vi" es de las tarjetas en Solicitado.');
        }
        DB::table('pedidos_proveedor')->where('id', $id)->update(['revisado_at' => $deshacer ? null : now()]);

        return $this->get($id);
    }

    /** Borrado físico a propósito: es una pizarra, no historia contable. */
    public function borrar(int $id): void
    {
        $this->get($id);
        DB::table('pedidos_proveedor')->where('id', $id)->delete();
    }

    /** El historial de recibidos, con cuánto tardó cada uno. */
    public function recibidos(array $q): array
    {
        $qb = $this->base()->where('pp.estado', 'recibido');
        $hoy = Documentos::hoy();
        $inicioMes = Carbon::now(Documentos::ZONA)->startOfMonth()->utc();
        match ($q['filtro'] ?? '') {
            'semana' => $qb->where('pp.fecha_recepcion', '>=', $hoy->copy()->subDays(7)),
            'mes' => $qb->where('pp.fecha_recepcion', '>=', $inicioMes),
            'mes_ant' => $qb->where('pp.fecha_recepcion', '>=', $inicioMes->copy()->subMonth())->where('pp.fecha_recepcion', '<', $inicioMes),
            default => $qb,
        };
        if (! empty($q['proveedorId'])) {
            $qb->where('pp.proveedor_id', (int) $q['proveedorId']);
        }
        if (trim((string) ($q['buscar'] ?? '')) !== '') {
            $like = '%'.trim($q['buscar']).'%';
            $qb->where(fn ($w) => $w->where('p.nombre', 'like', $like)->orWhere('pp.notas', 'like', $like));
        }
        $page = max(1, (int) ($q['page'] ?? 1));
        $limit = min(100, max(1, (int) ($q['limit'] ?? 50)));
        $total = (clone $qb)->count();
        $filas = $qb->orderByDesc('pp.fecha_recepcion')->orderByDesc('pp.id')->limit($limit)->offset(($page - 1) * $limit)->get();
        $g = DB::table('pedidos_proveedor')->where('estado', 'recibido')->whereNotNull('fecha_pedido')
            ->selectRaw('coalesce(avg(timestampdiff(SECOND, fecha_pedido, fecha_recepcion)) / 86400, 0) as promedio, sum(case when fecha_recepcion >= ? then 1 else 0 end) as total_mes', [$inicioMes])->first();

        return [
            'filas' => $filas->map(fn ($f) => [...Fila::camel($f), 'dias' => $f->fecha_pedido && $f->fecha_recepcion ? (int) round(Carbon::parse($f->fecha_pedido)->diffInSeconds(Carbon::parse($f->fecha_recepcion)) / 86400) : null])->all(),
            'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / $limit)),
            'promedioDias' => round((float) $g->promedio, 1), 'totalMes' => (int) $g->total_mes,
        ];
    }

    public function stats(): array
    {
        $por = ['solicitado' => 0, 'pedido' => 0, 'recibido' => 0, 'retomar' => 0];
        foreach (DB::table('pedidos_proveedor')->groupBy('estado')->selectRaw('estado, count(*) as n')->get() as $f) {
            $por[$f->estado] = (int) $f->n;
        }

        return [...$por, 'pendientes' => $por['solicitado'] + $por['pedido']];
    }
}
