<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Cliente;
use App\Models\ClienteLista;
use App\Models\ListaVenta;
use App\Models\ModalidadVenta;
use App\Models\Presentacion;
use App\Models\ReglaMarca;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * FORMATO DE VENTA: modalidades, listas, reglas de marca y las filas
 * producto×lista (o presentación×lista) con su markup / precio fijo.
 */
class ListasService
{
    public static function etiquetaLista(object|array $lista, ?object $modalidad): string
    {
        $l = (object) $lista;
        $base = $modalidad ? $modalidad->nombre.' '.$l->numero : 'Lista '.$l->numero;

        return $l->nombre ? $base.' · '.$l->nombre : $base;
    }

    /** Modalidades, listas (con etiqueta) y reglas de marca: lo que el panel necesita para nombrar una lista. */
    public function catalogo(): array
    {
        $mods = ModalidadVenta::query()->orderBy('orden')->orderBy('id')->get();
        $porModalidad = $mods->keyBy('id');
        $listas = ListaVenta::query()->orderBy('orden')->orderBy('id')->get()->map(function (ListaVenta $l) use ($porModalidad) {
            $m = $porModalidad->get($l->modalidad_id);

            return [
                'id' => $l->id, 'modalidadId' => $l->modalidad_id, 'numero' => $l->numero, 'nombre' => $l->nombre,
                'orden' => $l->orden, 'activa' => $l->activa,
                'modalidad' => $m?->nombre ?? '', 'modalidadOrden' => $m?->orden ?? 0,
                'etiqueta' => self::etiquetaLista($l, $m),
            ];
        });
        $reglas = ReglaMarca::query()->with('marca:id,nombre')->get()
            ->sortBy(fn ($r) => $r->marca?->nombre ?? '')->values()
            ->map(fn (ReglaMarca $r) => [
                'id' => $r->id, 'marcaId' => $r->marca_id, 'marca' => $r->marca?->nombre ?? '',
                'unidadesMinimas' => (float) $r->unidades_minimas, 'modalidadId' => $r->modalidad_id, 'activa' => $r->activa,
                'modalidad' => $porModalidad->get($r->modalidad_id)?->nombre ?? '',
            ]);

        return [
            'modalidades' => $mods->map(fn ($m) => ['id' => $m->id, 'nombre' => $m->nombre, 'orden' => $m->orden, 'activa' => $m->activa])->all(),
            'listas' => $listas->all(),
            'reglasMarca' => $reglas->all(),
        ];
    }

    public function listasActivas()
    {
        return ListaVenta::query()->where('activa', true)->orderBy('orden')->orderBy('id')->get();
    }

    /* ---------------- Modalidades ---------------- */

    public function crearModalidad(array $d): ModalidadVenta
    {
        return ModalidadVenta::query()->create(['nombre' => trim($d['nombre']), 'orden' => $d['orden'] ?? 0, 'activa' => $d['activa'] ?? true]);
    }

    public function editarModalidad(ModalidadVenta $m, array $d): ModalidadVenta
    {
        $m->update(['nombre' => trim($d['nombre']), 'orden' => $d['orden'] ?? 0, 'activa' => $d['activa'] ?? true]);

        return $m;
    }

    public function borrarModalidad(ModalidadVenta $m): void
    {
        if ($m->listas()->exists()) {
            throw new ErrorDeNegocio('La modalidad tiene listas. Borralas o movelas antes.');
        }
        $m->delete();
    }

    /* ---------------- Listas ---------------- */

    public function crearLista(array $d): ListaVenta
    {
        $mod = ModalidadVenta::query()->find($d['modalidadId']);
        if (! $mod) {
            throw new ErrorDeNegocio('Modalidad inválida.');
        }
        $numero = $d['numero'] ?? ((int) ListaVenta::query()->where('modalidad_id', $mod->id)->max('numero') + 1);
        if (ListaVenta::query()->where('modalidad_id', $mod->id)->where('numero', $numero)->exists()) {
            throw new ErrorDeNegocio('Ya existe la lista '.$numero.' en '.$mod->nombre.'.');
        }

        return ListaVenta::query()->create([
            'modalidad_id' => $mod->id, 'numero' => $numero, 'nombre' => trim($d['nombre']),
            'orden' => $d['orden'] ?? 0, 'activa' => $d['activa'] ?? true,
        ]);
    }

    public function editarLista(ListaVenta $l, array $d): ListaVenta
    {
        $l->update(['nombre' => trim($d['nombre']), 'orden' => $d['orden'] ?? 0, 'activa' => $d['activa'] ?? true]);

        return $l;
    }

    /** Una lista con ventas no se borra: se desactiva (las ventas viejas la referencian). */
    public function borrarLista(ListaVenta $l): array
    {
        if (Schema::hasTable('venta_items') && DB::table('venta_items')->where('lista_id', $l->id)->exists()) {
            $l->update(['activa' => false]);

            return ['ok' => true, 'desactivada' => true, 'lista' => $l];
        }
        $l->delete();

        return ['ok' => true, 'desactivada' => false];
    }

    /* ---------------- Reglas de marca ---------------- */

    private function validarRegla(array $d, ?int $exceptoId = null): void
    {
        if (! ((float) ($d['unidadesMinimas'] ?? 0) > 0)) {
            throw new ErrorDeNegocio('El mínimo de unidades tiene que ser mayor a cero.');
        }
        $marca = DB::table('marcas')->find($d['marcaId']);
        $mod = ModalidadVenta::query()->find($d['modalidadId']);
        if (! $marca) {
            throw new ErrorDeNegocio('Marca inválida.');
        }
        if (! $mod) {
            throw new ErrorDeNegocio('Modalidad inválida.');
        }
        $dup = ReglaMarca::query()->where('marca_id', $marca->id)->where('modalidad_id', $mod->id)
            ->when($exceptoId, fn ($q) => $q->whereKeyNot($exceptoId))->exists();
        if ($dup) {
            throw new ErrorDeNegocio('Ya hay una regla de '.$marca->nombre.' para '.$mod->nombre.'.');
        }
    }

    public function crearRegla(array $d): ReglaMarca
    {
        $this->validarRegla($d);

        return ReglaMarca::query()->create([
            'marca_id' => $d['marcaId'], 'unidades_minimas' => (float) $d['unidadesMinimas'],
            'modalidad_id' => $d['modalidadId'], 'activa' => $d['activa'] ?? true,
        ]);
    }

    public function editarRegla(ReglaMarca $r, array $d): ReglaMarca
    {
        $this->validarRegla($d, $r->id);
        $r->update([
            'marca_id' => $d['marcaId'], 'unidades_minimas' => (float) $d['unidadesMinimas'],
            'modalidad_id' => $d['modalidadId'], 'activa' => $d['activa'] ?? true,
        ]);

        return $r;
    }

    /* ---------------- Listas predeterminadas de un cliente ---------------- */

    public function listasDeCliente(int $clienteId): array
    {
        return DB::table('cliente_listas')
            ->join('listas_venta', 'listas_venta.id', '=', 'cliente_listas.lista_id')
            ->where('cliente_listas.cliente_id', $clienteId)
            ->where('listas_venta.activa', true)
            ->orderBy('listas_venta.orden')
            ->orderBy('listas_venta.id')
            ->get([
                'cliente_listas.lista_id as listaId', 'listas_venta.numero', 'listas_venta.nombre',
                'listas_venta.modalidad_id as modalidadId', 'listas_venta.orden',
            ])
            ->all();
    }

    /** Reemplaza el conjunto completo de listas predeterminadas de un cliente. */
    public function setListasDeCliente(int $clienteId, array $listaIds): array
    {
        $cliente = Cliente::query()->find($clienteId);
        if (! $cliente) {
            throw new NotFoundHttpException('Cliente inexistente.');
        }
        if ($cliente->es_consumidor_final && count($listaIds)) {
            throw new ErrorDeNegocio(
                $cliente->nombre.' es el cliente genérico del mostrador: no lleva listas asignadas. '
                .'Si querés que un cliente pague mayorista, cargalo como cliente propio.'
            );
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $listaIds))));
        DB::transaction(function () use ($clienteId, $ids) {
            ClienteLista::query()->where('cliente_id', $clienteId)->delete();
            if ($ids) {
                ClienteLista::query()->insert(array_map(
                    fn ($listaId) => ['cliente_id' => $clienteId, 'lista_id' => $listaId],
                    $ids,
                ));
            }
        });

        return $this->listasDeCliente($clienteId);
    }

    /* ---------------- Formato de venta (filas producto×lista) ---------------- */

    public function formatoDe(int $productoId): array
    {
        return DB::table('producto_listas')->where('producto_id', $productoId)->orderBy('id')->get()->map([$this, 'aFormato'])->all();
    }

    public function formatoDePresentacion(int $presentacionId): array
    {
        return DB::table('producto_listas')->where('presentacion_id', $presentacionId)->orderBy('id')->get()->map([$this, 'aFormato'])->all();
    }

    public function aFormato(object $f): array
    {
        return [
            'id' => $f->id, 'productoId' => $f->producto_id, 'presentacionId' => $f->presentacion_id, 'listaId' => $f->lista_id,
            'modoPrecio' => $f->modo_precio, 'markup' => (float) $f->markup, 'precioFijo' => (float) $f->precio_fijo,
            'unidades' => (float) $f->unidades, 'codigoBarras' => $f->codigo_barras, 'unidadesMinimas' => (float) $f->unidades_minimas,
        ];
    }

    public function setFormato(int $productoId, array $filas): array
    {
        return $this->guardarFormato($productoId, null, $filas);
    }

    public function setFormatoPresentacion(int $presentacionId, array $filas): array
    {
        $pr = Presentacion::query()->find($presentacionId);
        if (! $pr) {
            throw new NotFoundHttpException('Presentación inexistente.');
        }

        return $this->guardarFormato($pr->producto_id, $presentacionId, $filas);
    }

    private function ambito(int $productoId, ?int $presentacionId)
    {
        return DB::table('producto_listas')->when(
            $presentacionId === null,
            fn ($q) => $q->where('producto_id', $productoId)->whereNull('presentacion_id'),
            fn ($q) => $q->where('presentacion_id', $presentacionId),
        );
    }

    /**
     * Reemplaza el formato de venta de un producto (o paquete). Reglas:
     * sólo listas activas, una fila por lista, precio fijo > 0 en modo precio,
     * un formato que vende de a 1 no lleva código propio, códigos únicos en
     * todo el sistema.
     */
    private function guardarFormato(int $productoId, ?int $presentacionId, array $filas): array
    {
        $validas = $this->listasActivas()->pluck('id')->flip();
        $vistos = [];
        $rows = [];
        foreach ($filas as $f) {
            $listaId = (int) ($f['listaId'] ?? 0);
            if (! isset($validas[$listaId]) || isset($vistos[$listaId])) {
                continue;
            }
            $vistos[$listaId] = true;
            $rows[] = [
                'producto_id' => $productoId, 'presentacion_id' => $presentacionId, 'lista_id' => $listaId,
                'modo_precio' => ($f['modoPrecio'] ?? '') === 'precio' ? 'precio' : 'markup',
                'markup' => (float) ($f['markup'] ?? 0), 'precio_fijo' => (float) ($f['precioFijo'] ?? 0),
                'unidades' => max(1, (float) ($f['unidades'] ?? 1)), 'codigo_barras' => trim((string) ($f['codigoBarras'] ?? '')),
                'unidades_minimas' => max(0, (float) ($f['unidadesMinimas'] ?? 0)),
                'created_at' => now(), 'updated_at' => now(),
            ];
        }
        foreach ($rows as $r) {
            if ($r['modo_precio'] === 'precio' && ! ($r['precio_fijo'] > 0)) {
                throw new ErrorDeNegocio('Con precio definido, el precio del formato tiene que ser mayor a 0.');
            }
        }
        $codigoPrevio = $this->ambito($productoId, $presentacionId)->pluck('codigo_barras', 'lista_id');
        foreach ($rows as $r) {
            if ($r['codigo_barras'] === '' || $r['unidades'] > 1) {
                continue;
            }
            if (($codigoPrevio[$r['lista_id']] ?? null) === $r['codigo_barras']) {
                continue; // no lo tocó
            }
            throw new ErrorDeNegocio('Un formato que vende de a 1 no lleva código propio: sería un segundo código para el mismo artículo. Poné cuántas unidades trae la caja, o dejá el código vacío.');
        }
        $codigos = array_values(array_filter(array_column($rows, 'codigo_barras')));
        if (count(array_unique($codigos)) !== count($codigos)) {
            throw new ErrorDeNegocio('Dos formatos de venta no pueden compartir el código de barras.');
        }
        if ($codigos) {
            $enProductos = DB::table('productos')->whereIn('codigo_barras', $codigos)->orWhereIn('dun', $codigos)->orWhereIn('codigo_propio', $codigos)->exists();
            $enPres = DB::table('presentaciones')->whereIn('codigo_barras', $codigos)->exists();
            $ajenos = DB::table('producto_listas')->whereIn('codigo_barras', $codigos)
                ->where(fn ($q) => $q->where('producto_id', '!=', $productoId)
                    ->orWhere(fn ($w) => $presentacionId === null ? $w->whereNotNull('presentacion_id') : $w->where('presentacion_id', '!=', $presentacionId)->orWhereNull('presentacion_id')))
                ->exists();
            if ($enProductos || $enPres || $ajenos) {
                throw new ErrorDeNegocio('Un código de formato ya lo usa otro producto, presentación o formato.');
            }
        }
        DB::transaction(function () use ($productoId, $presentacionId, $rows) {
            $this->ambito($productoId, $presentacionId)->delete();
            if ($rows) {
                DB::table('producto_listas')->insert($rows);
            }
        });

        return $presentacionId === null
            ? array_values(array_filter($this->formatoDe($productoId), fn ($f) => ! $f['presentacionId']))
            : $this->formatoDePresentacion($presentacionId);
    }
}
