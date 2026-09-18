<?php

namespace App\Ventas;

use App\Exceptions\ErrorDeNegocio;
use App\Inventario\OperacionesService;
use App\Precios\Pricing;
use App\Services\ClientesService;
use App\Services\ConfiguracionService;
use App\Support\Fila;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * PRESUPUESTOS — la bandeja de los pedidos mayoristas. No es fiscal ni toca la
 * caja: es la palabra dada al cliente.
 *
 *   borrador ─enviar─► enviado (precios congelados + vencimiento) ─confirmar─►
 *   confirmado (RESERVA stock) ─(POS)─► cerrado (venta real) | cancelado
 *
 * "Vencido" se calcula al mirarlo. Un confirmado nunca vence solo. El CIERRE
 * vive en VentasService (dto.presupuestoId). `pendiente` es de los pedidos web.
 */
class PresupuestosService
{
    public const ENTREGAS = ['retiro', 'cadete', 'camioneta'];

    public function __construct(private readonly OperacionesService $inv, private readonly ConfiguracionService $cfg, private readonly ClientesService $clientes) {}

    private function exigirSucursal(object $p, array $opciones): void
    {
        if (! empty($opciones['soloSuSucursal']) && (int) $p->sucursal_id !== (int) $opciones['soloSuSucursal']) {
            throw new AccessDeniedHttpException('Ese presupuesto es de otra sucursal.');
        }
    }

    /** Normaliza renglones y calcula los totales que se CONGELAN. */
    private function totales(array $items): array
    {
        $neto = 0.0;
        $iva = 0.0;
        $limpios = [];
        foreach ($items as $it) {
            $cantidad = (float) ($it['cantidad'] ?? 0);
            $precio = (float) ($it['precioLista'] ?? 0);
            $desc = (float) ($it['descuento'] ?? 0);
            $alic = isset($it['iva']) && is_numeric($it['iva']) ? (float) $it['iva'] : 21.0;
            if (! (int) ($it['productoId'] ?? 0) || $cantidad <= 0) {
                continue;
            }
            if ($cantidad > 1_000_000 || $precio > 100_000_000 || $desc < 0 || $desc > 100 || $alic < 0 || $alic > 100) {
                throw new ErrorDeNegocio('Un renglón tiene números fuera de rango.');
            }
            $netoItem = $cantidad * $precio * (1 - $desc / 100);
            $neto += $netoItem;
            $iva += $netoItem * $alic / 100;
            $limpios[] = [
                'producto_id' => (int) $it['productoId'], 'presentacion_id' => (int) ($it['presentacionId'] ?? 0) ?: null,
                'nombre' => trim((string) ($it['nombre'] ?? '')), 'detalle' => trim((string) ($it['detalle'] ?? '')),
                'cantidad' => $cantidad, 'cantidad_armada' => null, 'precio_lista' => Pricing::money($precio), 'descuento' => $desc, 'iva' => $alic,
                'lista' => (string) ($it['lista'] ?? ''), 'lista_id' => (int) ($it['listaId'] ?? 0) ?: null, 'oferta_nombre' => (string) ($it['ofertaNombre'] ?? ''), 'motivo' => '',
            ];
        }

        return ['limpios' => $limpios, 'subtotalNeto' => Pricing::money($neto), 'ivaTotal' => Pricing::money($iva), 'total' => Pricing::money($neto + $iva)];
    }

    private function fila(int $id): object
    {
        $p = DB::table('presupuestos')->find($id);
        if (! $p) {
            throw new NotFoundHttpException('Presupuesto inexistente.');
        }

        return $p;
    }

    private function publico(object $p, iterable $items): array
    {
        $vencido = $p->estado === 'enviado' && $p->vencimiento && strtotime($p->vencimiento) < time();

        return [...Fila::camel($p), 'vencido' => $vencido, 'items' => Fila::camelTodos($items)];
    }

    public function listar(array $f): array
    {
        $qb = DB::table('presupuestos as p')->leftJoin('clientes as c', 'c.id', '=', 'p.cliente_id')->leftJoin('usuarios as u', 'u.id', '=', 'p.vendedor_id')
            ->select('p.*', 'c.nombre as cliente_nombre', 'u.nombre as vendedor_nombre');
        if (! empty($f['estado'])) {
            $qb->where('p.estado', $f['estado']);
        }
        if (! empty($f['origen'])) {
            $qb->where('p.origen', $f['origen']);
        }
        if (! empty($f['sucursalId'])) {
            $qb->where('p.sucursal_id', (int) $f['sucursalId']);
        }
        $limit = min(max((int) ($f['limit'] ?? 500), 1), 2000);
        $ps = $qb->orderByDesc('p.id')->limit($limit)->get();
        if ($ps->isEmpty()) {
            return [];
        }
        $its = DB::table('presupuesto_items')->whereIn('presupuesto_id', $ps->pluck('id'))->get()->groupBy('presupuesto_id');

        return $ps->map(fn ($p) => $this->publico($p, $its->get($p->id) ?? []))->all();
    }

    public function get(int $id): array
    {
        $p = DB::table('presupuestos as p')->leftJoin('clientes as c', 'c.id', '=', 'p.cliente_id')->leftJoin('usuarios as u', 'u.id', '=', 'p.vendedor_id')
            ->where('p.id', $id)->select('p.*', 'c.nombre as cliente_nombre', 'u.nombre as vendedor_nombre')->first();
        if (! $p) {
            throw new NotFoundHttpException('Presupuesto inexistente.');
        }
        $items = DB::table('presupuesto_items')->where('presupuesto_id', $id)->orderBy('id')->get();
        // El stock disponible de cada renglón en la sucursal del pedido: el faltante se ve antes de confirmar.
        $st = DB::table('stock')->where('sucursal_id', $p->sucursal_id)->where('estado', 'disponible')->get();
        $out = $this->publico($p, $items);
        $out['items'] = array_map(function ($it) use ($st) {
            $disp = Pricing::money((float) $st->filter(fn ($s) => (int) $s->producto_id === (int) $it['productoId'] && (int) ($s->presentacion_id ?? 0) === (int) ($it['presentacionId'] ?? 0))->sum('cantidad'));

            return [...$it, 'disponible' => $disp, 'alcanza' => $disp + 1e-9 >= (float) $it['cantidad']];
        }, $out['items']);

        return $out;
    }

    public function crear(array $dto, int $sucursalId, int $usuarioId): array
    {
        if (empty($dto['clienteId'])) {
            throw new ErrorDeNegocio('Elegí el cliente del presupuesto.');
        }
        $this->clientes->get((int) $dto['clienteId']);
        $t = $this->totales($dto['items'] ?? []);
        if (! $t['limpios']) {
            throw new ErrorDeNegocio('Agregá al menos un renglón.');
        }
        $entrega = in_array($dto['entrega'] ?? '', self::ENTREGAS, true) ? $dto['entrega'] : 'retiro';

        return DB::transaction(function () use ($dto, $sucursalId, $usuarioId, $t, $entrega) {
            $id = DB::table('presupuestos')->insertGetId([
                'fecha' => now(), 'cliente_id' => (int) $dto['clienteId'], 'sucursal_id' => $sucursalId, 'usuario_id' => $usuarioId,
                'vendedor_id' => $dto['vendedorId'] ?? $usuarioId, 'entrega' => $entrega, 'observaciones' => trim((string) ($dto['observaciones'] ?? '')),
                'subtotal_neto' => $t['subtotalNeto'], 'iva_total' => $t['ivaTotal'], 'total' => $t['total'], 'created_at' => now(), 'updated_at' => now(),
            ]);
            $codigo = 'PR'.str_pad((string) $id, 4, '0', STR_PAD_LEFT);
            DB::table('presupuestos')->where('id', $id)->update(['codigo' => $codigo]);
            DB::table('presupuesto_items')->insert(array_map(fn ($it) => [...$it, 'presupuesto_id' => $id], $t['limpios']));

            return ['ok' => true, 'id' => $id, 'codigo' => $codigo];
        });
    }

    /** Solo un BORRADOR se edita entero: enviado es palabra dada — se reabre para re-cotizar. */
    public function actualizar(int $id, array $dto, array $opciones): array
    {
        $p = $this->fila($id);
        $this->exigirSucursal($p, $opciones);
        if ($p->estado !== 'borrador') {
            throw new ErrorDeNegocio('Solo un borrador se edita — usá "Reabrir" para re-cotizar.');
        }
        $t = $this->totales($dto['items'] ?? []);
        if (! $t['limpios']) {
            throw new ErrorDeNegocio('Agregá al menos un renglón.');
        }
        DB::transaction(function () use ($id, $p, $dto, $t) {
            DB::table('presupuestos')->where('id', $id)->update([
                'cliente_id' => ! empty($dto['clienteId']) ? (int) $dto['clienteId'] : $p->cliente_id,
                'vendedor_id' => array_key_exists('vendedorId', $dto) ? $dto['vendedorId'] : $p->vendedor_id,
                'entrega' => in_array($dto['entrega'] ?? '', self::ENTREGAS, true) ? $dto['entrega'] : $p->entrega,
                'observaciones' => array_key_exists('observaciones', $dto) ? trim((string) $dto['observaciones']) : $p->observaciones,
                'subtotal_neto' => $t['subtotalNeto'], 'iva_total' => $t['ivaTotal'], 'total' => $t['total'], 'updated_at' => now(),
            ]);
            DB::table('presupuesto_items')->where('presupuesto_id', $id)->delete();
            DB::table('presupuesto_items')->insert(array_map(fn ($it) => [...$it, 'presupuesto_id' => $id], $t['limpios']));
        });

        return ['ok' => true];
    }

    /** borrador → enviado: congela la palabra y arranca el reloj de validez. */
    public function enviar(int $id, array $opciones): array
    {
        $this->exigirSucursal($this->fila($id), $opciones);
        $dias = (int) ($this->cfg->get('ventas')['presupuestoValidezDias'] ?? 7) ?: 7;
        $gano = DB::table('presupuestos')->where('id', $id)->where('estado', 'borrador')->update(['estado' => 'enviado', 'vencimiento' => now()->addDays($dias), 'updated_at' => now()]);
        if (! $gano) {
            throw new ErrorDeNegocio('Solo un borrador se envía — actualizá la pantalla.');
        }

        return ['ok' => true, 'dias' => $dias];
    }

    /** enviado (vigente o vencido) → borrador: para re-cotizar a precios de hoy. */
    public function reabrir(int $id, array $opciones): array
    {
        $this->exigirSucursal($this->fila($id), $opciones);
        $gano = DB::table('presupuestos')->where('id', $id)->where('estado', 'enviado')->update(['estado' => 'borrador', 'vencimiento' => null, 'updated_at' => now()]);
        if (! $gano) {
            throw new ErrorDeNegocio('Solo un enviado se reabre — actualizá la pantalla.');
        }

        return ['ok' => true];
    }

    /** enviado VIGENTE → confirmado: el cliente dijo que sí. Acá se RESERVA el stock. */
    public function confirmar(int $id, int $usuarioId, array $opciones): array
    {
        return DB::transaction(function () use ($id, $usuarioId, $opciones) {
            $p = DB::table('presupuestos')->where('id', $id)->lockForUpdate()->first();
            if (! $p) {
                throw new NotFoundHttpException('Presupuesto inexistente.');
            }
            $this->exigirSucursal($p, $opciones);
            if ($p->estado !== 'enviado') {
                throw new ErrorDeNegocio('Solo se confirma un presupuesto enviado.');
            }
            if ($p->vencimiento && strtotime($p->vencimiento) < time()) {
                throw new ErrorDeNegocio('El presupuesto venció: reabrilo y re-cotizalo — los precios pueden haber cambiado.');
            }
            $reservar = ! empty($this->cfg->get('ventas')['presupuestoReservaStock']);
            DB::table('presupuestos')->where('id', $id)->update(['estado' => 'confirmado', 'reservado' => $reservar, 'updated_at' => now()]);
            if ($reservar) {
                $this->inv->reservarItems(['sucursalId' => (int) $p->sucursal_id, 'usuarioId' => $usuarioId, 'descripcion' => $p->codigo.': reserva por presupuesto confirmado', 'items' => $this->itemsParaStock($id)]);
            }

            return ['ok' => true, 'reservado' => $reservar];
        });
    }

    private function itemsParaStock(int $id): array
    {
        return DB::table('presupuesto_items')->where('presupuesto_id', $id)->get()->map(fn ($i) => ['productoId' => (int) $i->producto_id, 'presentacionId' => $i->presentacion_id, 'cantidad' => (float) $i->cantidad])->all();
    }

    /** El vendedor carga lo que ARMÓ de verdad. */
    public function armar(int $id, array $items, array $opciones): array
    {
        $p = $this->fila($id);
        $this->exigirSucursal($p, $opciones);
        if ($p->estado !== 'confirmado') {
            throw new ErrorDeNegocio('El armado se carga con el presupuesto confirmado.');
        }
        foreach ($items as $it) {
            $patch = [];
            if (isset($it['cantidadArmada']) && $it['cantidadArmada'] !== '') {
                $c = (float) $it['cantidadArmada'];
                if ($c < 0 || $c > 1_000_000) {
                    throw new ErrorDeNegocio('Cantidad armada inválida.');
                }
                $patch['cantidad_armada'] = $c;
            }
            if (array_key_exists('motivo', $it)) {
                $patch['motivo'] = trim((string) $it['motivo']);
            }
            if ($patch) {
                DB::table('presupuesto_items')->where('id', (int) $it['itemId'])->where('presupuesto_id', $id)->update($patch);
            }
        }

        return ['ok' => true];
    }

    public function delegar(int $id, ?int $vendedorId, array $opciones): array
    {
        $p = $this->fila($id);
        $this->exigirSucursal($p, $opciones);
        if (in_array($p->estado, ['cerrado', 'cancelado'], true)) {
            throw new ErrorDeNegocio('Ese presupuesto ya está terminado.');
        }
        DB::table('presupuestos')->where('id', $id)->update(['vendedor_id' => $vendedorId, 'updated_at' => now()]);

        return ['ok' => true];
    }

    /** pendiente → enviado: alguien de la casa ACEPTÓ el pedido web. */
    public function aceptar(int $id, array $o, int $usuarioId, array $opciones): array
    {
        $p = $this->fila($id);
        $this->exigirSucursal($p, $opciones);
        if ($p->estado !== 'pendiente') {
            throw new ErrorDeNegocio('Solo una orden pendiente se acepta — actualizá la pantalla.');
        }
        $wc = $p->web_cliente ? json_decode($p->web_cliente, true) : [];
        $clienteId = $p->cliente_id;
        if (! empty($o['clienteId'])) {
            $clienteId = $this->clientes->get((int) $o['clienteId'])->id;
        } elseif (! $clienteId) {
            $dni = preg_replace('/\D/', '', (string) ($wc['dni'] ?? ''));
            $ya = $dni !== '' ? DB::table('clientes')->where('tipo_doc', 'dni')->where('numero_doc', $dni)->first() : null;
            if ($ya) {
                $clienteId = $ya->id;
            } elseif (! empty($o['crearCliente'])) {
                $clienteId = $this->clientes->crear([
                    'nombre' => trim(($wc['nombre'] ?? '').' '.($wc['apellido'] ?? '')), 'tipoDoc' => 'dni', 'numeroDoc' => $dni, 'telefono' => (string) ($wc['telefono'] ?? ''),
                    'direccion' => (string) ($wc['direccion'] ?? ''), 'localidad' => (string) ($wc['localidad'] ?? ''), 'condicionIva' => 'consumidor_final',
                ], false)->id;
            } else {
                throw new ErrorDeNegocio('La orden no tiene cliente: agregalo como nuevo o asignale uno existente.');
            }
        }
        $dias = (int) ($this->cfg->get('ventas')['presupuestoValidezDias'] ?? 7) ?: 7;
        $gano = DB::table('presupuestos')->where('id', $id)->where('estado', 'pendiente')->update(['estado' => 'enviado', 'cliente_id' => $clienteId, 'usuario_id' => $usuarioId, 'vencimiento' => now()->addDays($dias), 'updated_at' => now()]);
        if (! $gano) {
            throw new ErrorDeNegocio('La orden cambió de estado — actualizá la pantalla.');
        }

        return ['ok' => true, 'clienteId' => $clienteId];
    }

    /** Cancela en cualquier estado abierto; si había reserva, la libera. */
    public function cancelar(int $id, int $usuarioId, ?string $motivo, array $opciones): array
    {
        return DB::transaction(function () use ($id, $usuarioId, $motivo, $opciones) {
            $p = DB::table('presupuestos')->where('id', $id)->lockForUpdate()->first();
            if (! $p) {
                throw new NotFoundHttpException('Presupuesto inexistente.');
            }
            $this->exigirSucursal($p, $opciones);
            if (in_array($p->estado, ['cerrado', 'cancelado'], true)) {
                throw new ErrorDeNegocio('Ese presupuesto ya está terminado.');
            }
            $nota = trim((string) $motivo);
            $upd = ['estado' => 'cancelado', 'updated_at' => now()];
            if ($nota !== '') {
                $upd['observaciones'] = implode(' · ', array_filter([$p->observaciones, 'Rechazado: '.$nota]));
            }
            DB::table('presupuestos')->where('id', $id)->where('estado', $p->estado)->update($upd);
            if ($p->estado === 'confirmado' && $p->reservado) {
                $this->inv->reservarItems(['sucursalId' => (int) $p->sucursal_id, 'usuarioId' => $usuarioId, 'liberar' => true, 'descripcion' => $p->codigo.': cancelado, reserva liberada', 'items' => $this->itemsParaStock($id)]);
            }

            return ['ok' => true];
        });
    }

    public function ordenesPendientes(): array
    {
        return ['pendientes' => DB::table('presupuestos')->where('estado', 'pendiente')->where('origen', 'web')->count()];
    }
}
