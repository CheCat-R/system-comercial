<?php

namespace App\Services;

use App\Precios\CostoEntry;
use App\Precios\FilaVenta;
use App\Precios\OpcionesPrecio;
use App\Precios\Pricing;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * EVOLUCIÓN DEL PRECIO DE VENTA. Cada vez que algo lo mueve (costo, formato de
 * compra, formato de venta, activación, reversión) se toma una foto del precio
 * final por lista y se guarda SÓLO lo que cambió. Es el historial que explica
 * por qué un producto vale hoy lo que vale.
 */
class HistorialPreciosService
{
    public function __construct(private readonly ConfiguracionService $cfg) {}

    /** @return array<int, array{productoId:int, listaId:int, precio:float}> */
    private function preciosActuales(array $productoIds): array
    {
        $cfg = $this->cfg->get('ventas');
        $prods = DB::table('productos')->whereIn('id', $productoIds)->get();
        $formatos = DB::table('producto_proveedores')->whereIn('producto_id', $productoIds)->orderBy('id')->get()->groupBy('producto_id');
        $plistas = DB::table('producto_listas')->whereIn('producto_id', $productoIds)->whereNull('presentacion_id')->get()->groupBy('producto_id');
        $vivas = DB::table('listas_venta')->where('activa', true)->pluck('id')->flip();

        $out = [];
        foreach ($prods as $p) {
            $activo = Pricing::formatoActivo(($formatos[$p->id] ?? collect())->all());
            $cn = Pricing::costoPrecioEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $p->iva);
            $opts = new OpcionesPrecio((float) $p->iva, (float) ($p->redondeo ?? $cfg['redondeoPrecio']));
            foreach ($plistas[$p->id] ?? [] as $pl) {
                if (! isset($vivas[$pl->lista_id])) {
                    continue;
                }
                $out[] = ['productoId' => $p->id, 'listaId' => $pl->lista_id, 'precio' => Pricing::precioVentaFila($cn, FilaVenta::desde((array) $pl), $opts)->finalUnitario];
            }
        }

        return $out;
    }

    public function snapshot(array $productoIds, string $origen, array $opts = []): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $productoIds))));
        if (! $ids) {
            return ['registrados' => 0];
        }
        $actuales = $this->preciosActuales($ids);
        // El último precio registrado por (producto, lista).
        $ultimos = DB::table('precio_historial as h')
            ->whereIn('producto_id', $ids)
            ->whereRaw('h.id = (SELECT MAX(id) FROM precio_historial WHERE producto_id = h.producto_id AND lista_id = h.lista_id)')
            ->get(['producto_id', 'lista_id', 'precio']);
        $ultimo = [];
        foreach ($ultimos as $r) {
            $ultimo[$r->producto_id.':'.$r->lista_id] = (float) $r->precio;
        }
        $filas = [];
        foreach ($actuales as $a) {
            $k = $a['productoId'].':'.$a['listaId'];
            $prev = $ultimo[$k] ?? null;
            if ($prev !== null && abs($prev - $a['precio']) <= 0.005) {
                continue;
            }
            $filas[] = [
                'producto_id' => $a['productoId'], 'lista_id' => $a['listaId'], 'fecha' => now(),
                'precio_anterior' => $prev, 'precio' => Pricing::money($a['precio']),
                'origen' => $prev === null ? 'inicial' : $origen,
                'detalle' => $opts['detalle'] ?? '', 'usuario_id' => $opts['usuarioId'] ?? null,
            ];
        }
        if ($filas) {
            DB::table('precio_historial')->insert($filas);
        }

        return ['registrados' => count($filas)];
    }

    public function ultimoCambio(): array
    {
        $u = DB::table('precio_historial as h')
            ->leftJoin('usuarios as u', 'u.id', '=', 'h.usuario_id')
            ->leftJoin('roles as r', 'r.id', '=', 'u.rol_id')
            ->orderByDesc('h.id')
            ->first(['h.id', 'h.fecha', 'h.origen', 'h.detalle', 'h.usuario_id', 'u.nombre as usuario_nombre', 'r.clave as usuario_rol']);
        if (! $u) {
            return ['id' => 0, 'fecha' => null, 'origen' => null, 'detalle' => '', 'usuarioId' => null, 'usuarioNombre' => null, 'usuarioRol' => null, 'productos' => 0];
        }
        $n = DB::table('precio_historial')->where('fecha', $u->fecha)->distinct()->count('producto_id');

        return [
            'id' => $u->id, 'fecha' => $u->fecha, 'origen' => $u->origen, 'detalle' => $u->detalle,
            'usuarioId' => $u->usuario_id, 'usuarioNombre' => $u->usuario_nombre, 'usuarioRol' => $u->usuario_rol, 'productos' => max($n, 1),
        ];
    }

    public function evolucion(array $q = []): array
    {
        $filas = DB::table('precio_historial as h')
            ->join('productos as p', 'p.id', '=', 'h.producto_id')
            ->leftJoin('marcas as m', 'm.id', '=', 'p.marca_id')
            ->join('listas_venta as l', 'l.id', '=', 'h.lista_id')
            ->join('modalidades_venta as mo', 'mo.id', '=', 'l.modalidad_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'h.usuario_id')
            ->when(! empty($q['productoId']), fn ($b) => $b->where('h.producto_id', (int) $q['productoId']))
            ->when(! empty($q['desde']), fn ($b) => $b->where('h.fecha', '>=', Carbon::parse($q['desde'])))
            ->orderByDesc('h.id')
            ->limit(min((int) ($q['limit'] ?? 500), 2000))
            ->get([
                'h.id', 'h.fecha', 'h.producto_id', 'h.lista_id', 'h.precio_anterior', 'h.precio', 'h.origen', 'h.detalle',
                'p.nombre as producto', 'p.codigo_barras as codigo', 'p.codigo_propio', 'p.marca_id', 'm.nombre as marca',
                'l.numero as lista_numero', 'l.nombre as lista_nombre', 'mo.nombre as modalidad', 'u.nombre as usuario',
            ]);

        return $filas->map(fn ($f) => [
            'id' => $f->id, 'fecha' => $f->fecha, 'productoId' => $f->producto_id, 'listaId' => $f->lista_id,
            'precioAnterior' => $f->precio_anterior !== null ? (float) $f->precio_anterior : null, 'precio' => (float) $f->precio,
            'origen' => $f->origen, 'detalle' => $f->detalle, 'producto' => $f->producto, 'codigo' => $f->codigo,
            'codigoPropio' => $f->codigo_propio, 'marcaId' => $f->marca_id, 'marca' => $f->marca,
            'listaNumero' => $f->lista_numero, 'listaNombre' => $f->lista_nombre, 'modalidad' => $f->modalidad, 'usuario' => $f->usuario,
            'lista' => $f->modalidad.' '.$f->lista_numero.($f->lista_nombre ? ' · '.$f->lista_nombre : ''),
            'variacion' => ($f->precio_anterior && (float) $f->precio_anterior > 0)
                ? Pricing::money((((float) $f->precio - (float) $f->precio_anterior) / (float) $f->precio_anterior) * 100)
                : null,
        ])->all();
    }
}
