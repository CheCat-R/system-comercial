<?php

namespace App\Inventario;

use App\Exceptions\ErrorDeNegocio;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * CONTROL DE STOCK: el físico contra el virtual. Se abre una sesión (ciega o
 * no) con un alcance, se cuenta renglón por renglón (guardando el virtual del
 * momento), se cierra —la foto final—, se revisan diferencias y se APLICAN
 * como ajustes. Un conteo aplicado es historia contable.
 */
class ConteosService extends StockCore
{
    private function clave(int $productoId, ?int $presId): string
    {
        return $productoId.':'.($presId ?? '');
    }

    /** @return array{disponible: array<string,float>, comprometido: array<string,float>} */
    private function stockDe(int $sucursalId, array $prodIds): array
    {
        $out = ['disponible' => [], 'comprometido' => []];
        if (! $prodIds) {
            return $out;
        }
        $filas = DB::table('stock')->where('sucursal_id', $sucursalId)->whereIn('producto_id', $prodIds)
            ->whereIn('estado', ['disponible', 'comprometido'])->get();
        foreach ($filas as $f) {
            $k = $this->clave($f->producto_id, $f->presentacion_id);
            $out[$f->estado][$k] = ($out[$f->estado][$k] ?? 0) + (float) $f->cantidad;
        }

        return $out;
    }

    public function listar(?int $sucursalId = null): array
    {
        $filas = DB::table('conteos')->when($sucursalId, fn ($q) => $q->where('sucursal_id', $sucursalId))->orderByDesc('id')->get();
        if ($filas->isEmpty()) {
            return [];
        }
        // Progreso por sesión en una sola pasada, no un COUNT por fila.
        $progreso = DB::table('conteo_items')->whereIn('conteo_id', $filas->pluck('id'))
            ->selectRaw('conteo_id, COUNT(*) total, SUM(contado IS NOT NULL) contados, SUM(recontar) a_recontar')
            ->groupBy('conteo_id')->get()->keyBy('conteo_id');

        return $filas->map(fn ($f) => [
            ...(array) $f,
            'total' => (int) ($progreso[$f->id]->total ?? 0),
            'contados' => (int) ($progreso[$f->id]->contados ?? 0),
            'aRecontar' => (int) ($progreso[$f->id]->a_recontar ?? 0),
        ])->all();
    }

    public function crear(array $o): array
    {
        return DB::transaction(function () use ($o) {
            $sucursalId = (int) $o['sucursalId'];
            $q = DB::table('productos')->orderBy('nombre');
            if (empty($o['incluirArchivados'])) {
                $q->where('estado', '!=', 'archivado');
            }
            if (! empty($o['marcaId'])) {
                $q->where('marca_id', (int) $o['marcaId']);
            }
            if (! empty($o['categoriaId'])) {
                $q->where('categoria_id', (int) $o['categoriaId']);
            }
            if (! empty($o['tipo'])) {
                $q->where('tipo', $o['tipo']);
            }
            if (! empty($o['proveedorId'])) {
                $q->whereIn('id', DB::table('producto_proveedores')->where('proveedor_id', (int) $o['proveedorId'])->select('producto_id'));
            }
            $prods = $q->get(['id', 'nombre', 'tipo']);
            if ($prods->isEmpty()) {
                throw new ErrorDeNegocio('Ningún producto entra en ese alcance. Aflojá los filtros.');
            }
            $ids = $prods->pluck('id')->all();
            $presDe = DB::table('presentaciones')->whereIn('producto_id', $ids)->orderBy('tam_kg')->get()->groupBy('producto_id');
            $disponible = $this->stockDe($sucursalId, $ids)['disponible'];
            $soloConStock = ! empty($o['soloConStock']);

            $filas = [];
            foreach ($prods as $p) {
                $conStock = fn (?int $presId) => abs($disponible[$this->clave($p->id, $presId)] ?? 0) > self::EPS;
                if (! $soloConStock || $conStock(null)) {
                    $filas[] = ['producto_id' => $p->id, 'presentacion_id' => null, 'nombre' => $p->nombre, 'pres_label' => '', 'unidad' => $this->unidadDe($p->tipo, null)];
                }
                foreach ($presDe[$p->id] ?? [] as $pr) {
                    if ($soloConStock && ! $conStock($pr->id)) {
                        continue;
                    }
                    $filas[] = ['producto_id' => $p->id, 'presentacion_id' => $pr->id, 'nombre' => $p->nombre, 'pres_label' => $this->fmtTam((float) $pr->tam_kg), 'unidad' => 'u'];
                }
            }
            if (! $filas) {
                throw new ErrorDeNegocio('Con "solo con stock" no queda nada para contar en ese alcance.');
            }
            if (count($filas) > 5000) {
                throw new ErrorDeNegocio('El alcance es demasiado grande: partilo con los filtros.');
            }

            // Un renglón no puede estar en dos controles vivos a la vez.
            $abiertos = DB::table('conteos')->where('sucursal_id', $sucursalId)->whereIn('estado', ['en_curso', 'cerrado'])->get();
            if ($abiertos->isNotEmpty()) {
                $enUso = [];
                foreach (DB::table('conteo_items')->whereIn('conteo_id', $abiertos->pluck('id'))->get(['producto_id', 'presentacion_id', 'conteo_id']) as $x) {
                    $enUso[$this->clave($x->producto_id, $x->presentacion_id)] = $x->conteo_id;
                }
                foreach ($filas as $f) {
                    $k = $this->clave($f['producto_id'], $f['presentacion_id']);
                    if (isset($enUso[$k])) {
                        $s = $abiertos->firstWhere('id', $enUso[$k]);
                        throw new ErrorDeNegocio('"'.$f['nombre'].'" ya está en el control "'.($s->nombre ?: '#'.$s->id).'" ('
                            .($s->estado === 'cerrado' ? 'cerrado sin aplicar' : 'en curso').'). Aplicalo o descartalo antes de abrir otro que lo incluya.');
                    }
                }
            }

            $partes = [];
            if (! empty($o['marcaId'])) {
                $partes[] = 'Marca '.(DB::table('marcas')->where('id', (int) $o['marcaId'])->value('nombre') ?? $o['marcaId']);
            }
            if (! empty($o['categoriaId'])) {
                $partes[] = 'Categoría '.(DB::table('categorias')->where('id', (int) $o['categoriaId'])->value('nombre') ?? $o['categoriaId']);
            }
            if (! empty($o['proveedorId'])) {
                $partes[] = 'Proveedor '.(DB::table('proveedores')->where('id', (int) $o['proveedorId'])->value('nombre') ?? $o['proveedorId']);
            }
            if (! empty($o['tipo'])) {
                $partes[] = $o['tipo'] === 'granel' ? 'Solo granel' : 'Solo enteros';
            }
            if ($soloConStock) {
                $partes[] = 'solo con stock';
            }
            $alcance = implode(' · ', $partes) ?: 'Todo el catálogo';

            $id = DB::table('conteos')->insertGetId([
                'sucursal_id' => $sucursalId, 'nombre' => trim((string) ($o['nombre'] ?? '')) ?: $alcance, 'alcance' => $alcance,
                'ciego' => $o['ciego'] ?? true, 'estado' => 'en_curso', 'usuario_id' => $o['usuarioId'] ?? null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            foreach (array_chunk($filas, 500) as $chunk) {
                DB::table('conteo_items')->insert(array_map(fn ($f) => [...$f, 'conteo_id' => $id], $chunk));
            }

            return [...(array) DB::table('conteos')->find($id), 'total' => count($filas), 'contados' => 0];
        });
    }

    private function vivo(int $id, ?int $soloSuc): object
    {
        $c = DB::table('conteos')->find($id);
        if (! $c) {
            throw new ErrorDeNegocio('Ese control de stock no existe.');
        }
        if ($soloSuc !== null && (int) $c->sucursal_id !== $soloSuc) {
            throw new AccessDeniedHttpException('Ese control es de otra sucursal.');
        }

        return $c;
    }

    public function get(int $id, bool $puedeVerVirtual = false, ?int $soloSuc = null): array
    {
        $c = $this->vivo($id, $soloSuc);
        $items = DB::table('conteo_items')->where('conteo_id', $id)->orderBy('nombre')->orderBy('id')->get();
        $stock = $this->stockDe($c->sucursal_id, $items->pluck('producto_id')->unique()->all());

        $oculto = $c->ciego && $c->estado === 'en_curso' && ! $puedeVerVirtual;
        $conDiferencias = ! $oculto && ($puedeVerVirtual || ! $c->ciego);

        $filas = [];
        foreach ($items as $i) {
            $k = $this->clave($i->producto_id, $i->presentacion_id);
            $base = [
                'id' => $i->id, 'productoId' => $i->producto_id, 'presentacionId' => $i->presentacion_id,
                'nombre' => $i->nombre, 'presLabel' => $i->pres_label, 'unidad' => $i->unidad,
                'contado' => $i->contado !== null ? (float) $i->contado : null, 'contadoPor' => $i->contado_por,
                'contadoEn' => $i->contado_en, 'recontar' => (bool) $i->recontar,
                'apartados' => $stock['comprometido'][$k] ?? 0,
            ];
            if (! $conDiferencias) {
                $filas[] = $base;

                continue;
            }
            $virtual = $stock['disponible'][$k] ?? 0;
            $virtualAlContar = $i->virtual_al_contar !== null ? (float) $i->virtual_al_contar : 0.0;
            $diferencia = $i->contado === null ? null : round((float) $i->contado - $virtualAlContar, 3);
            $seMovio = $i->contado !== null && abs($virtual - $virtualAlContar) > self::EPS;
            $costoUnitario = 0.0;
            if ($diferencia !== null && abs($diferencia) > self::EPS) {
                $prod = $this->producto($i->producto_id);
                $costoUnitario = $prod ? $this->costoDePerdida($prod, $i->presentacion_id) : 0.0;
            }
            $filas[] = [...$base,
                'virtual' => $virtual, 'virtualAlContar' => $i->virtual_al_contar !== null ? (float) $i->virtual_al_contar : null,
                'diferencia' => $diferencia, 'seMovio' => $seMovio, 'costoUnitario' => $costoUnitario,
                'diferenciaPlata' => $diferencia !== null ? round($diferencia * $costoUnitario, 2) : null,
            ];
        }

        return [
            ...(array) $c,
            'total' => $items->count(),
            'contados' => $items->whereNotNull('contado')->count(),
            'puedeVerVirtual' => $puedeVerVirtual,
            'items' => $filas,
        ];
    }

    public function contarItem(int $conteoId, int $itemId, array $o, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($conteoId, $itemId, $o, $soloSuc) {
            $c = $this->vivo($conteoId, $soloSuc);
            if ($c->estado !== 'en_curso') {
                throw new ErrorDeNegocio($c->estado === 'cerrado' ? 'El control está cerrado: reabrilo para seguir contando.' : 'Ese control ya no se puede contar.');
            }
            $it = DB::table('conteo_items')->where('id', $itemId)->where('conteo_id', $conteoId)->first();
            if (! $it) {
                throw new ErrorDeNegocio('Ese renglón no es de este control.');
            }
            if (! isset($o['contado']) || $o['contado'] === null || $o['contado'] === '') {
                DB::table('conteo_items')->where('id', $itemId)->update([
                    'contado' => null, 'virtual_al_contar' => null, 'contado_por' => null, 'contado_en' => null, 'recontar' => false,
                ]);

                return ['id' => $itemId, 'contado' => null, 'contadoEn' => null, 'recontar' => false];
            }
            $contado = (float) $o['contado'];
            $virtual = $this->cant($it->producto_id, $c->sucursal_id, $it->presentacion_id, 'disponible');
            $ahora = now();
            DB::table('conteo_items')->where('id', $itemId)->update([
                'contado' => $contado, 'virtual_al_contar' => $virtual, 'contado_por' => $o['usuarioId'] ?? null,
                'contado_en' => $ahora, 'recontar' => false, // recontada: la marca ya cumplió su trabajo
            ]);

            return ['id' => $itemId, 'contado' => $contado, 'contadoEn' => $ahora->toIso8601String(), 'recontar' => false];
        });
    }

    public function cerrar(int $id, ?int $soloSuc = null): object
    {
        $c = $this->vivo($id, $soloSuc);
        if ($c->estado !== 'en_curso') {
            throw new ErrorDeNegocio('Solo se cierra un control en curso.');
        }
        DB::table('conteos')->where('id', $id)->update(['estado' => 'cerrado', 'cerrado_en' => now(), 'updated_at' => now()]);

        return DB::table('conteos')->find($id);
    }

    public function reabrir(int $id, ?int $soloSuc = null): object
    {
        $c = $this->vivo($id, $soloSuc);
        if ($c->estado !== 'cerrado') {
            throw new ErrorDeNegocio('Solo se reabre un control cerrado sin aplicar.');
        }
        DB::table('conteos')->where('id', $id)->update(['estado' => 'en_curso', 'cerrado_en' => null, 'updated_at' => now()]);

        return DB::table('conteos')->find($id);
    }

    public function marcarRecontar(int $conteoId, int $itemId, bool $valor, ?int $soloSuc = null): object
    {
        $c = $this->vivo($conteoId, $soloSuc);
        if (in_array($c->estado, ['aplicado', 'descartado'], true)) {
            throw new ErrorDeNegocio('Ese control ya está terminado.');
        }
        $n = DB::table('conteo_items')->where('id', $itemId)->where('conteo_id', $conteoId)->update(['recontar' => $valor]);
        if (! $n) {
            throw new ErrorDeNegocio('Ese renglón no es de este control.');
        }

        return DB::table('conteo_items')->find($itemId);
    }

    public function aplicar(int $id, ?int $usuarioId = null, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $usuarioId, $soloSuc) {
            $c = $this->vivo($id, $soloSuc);
            if ($c->estado === 'aplicado') {
                throw new ErrorDeNegocio('Ese control ya se aplicó.');
            }
            if ($c->estado === 'descartado') {
                throw new ErrorDeNegocio('Ese control está descartado.');
            }
            if ($c->estado !== 'cerrado') {
                throw new ErrorDeNegocio('Cerrá el control antes de aplicarlo: el cierre es la foto final.');
            }
            $items = DB::table('conteo_items')->where('conteo_id', $id)->whereNotNull('contado')->get();
            $avisos = [];
            $ajustes = 0;
            foreach ($items as $it) {
                $virtualAlContar = (float) ($it->virtual_al_contar ?? 0);
                $delta = round((float) $it->contado - $virtualAlContar, 3);
                $virtualAhora = $this->cant($it->producto_id, $c->sucursal_id, $it->presentacion_id, 'disponible');
                $etiqueta = $it->pres_label ? $it->nombre.' · '.$it->pres_label : $it->nombre;
                if (abs($virtualAhora - $virtualAlContar) > self::EPS) {
                    $avisos[] = $etiqueta.': el stock se movió después de contarlo (era '.$this->num($virtualAlContar).', ahora '.$this->num($virtualAhora).'). ¿Se vendió algo con el local cerrado?';
                }
                if (abs($delta) < self::EPS) {
                    continue;
                }
                $prod = $this->producto($it->producto_id);
                if (! $prod) {
                    continue;
                }
                $this->addDelta($this->coord($it->producto_id, $c->sucursal_id, $it->presentacion_id, 'disponible'), $delta);
                $this->mov([
                    'tipo' => 'ajuste', 'producto_id' => $it->producto_id, 'sucursal_id' => $c->sucursal_id, 'presentacion_id' => $it->presentacion_id,
                    'signo' => $delta > 0 ? 1 : -1, 'cantidad' => abs($delta), 'unidad' => $it->unidad,
                    'estado_desde' => $delta < 0 ? 'disponible' : null, 'estado_hacia' => $delta > 0 ? 'disponible' : null,
                    'costo_unitario' => $this->costoDePerdida($prod, $it->presentacion_id), 'usuario_id' => $usuarioId, 'ref_conteo_id' => $id,
                    'motivo' => 'Control de stock '.($c->nombre ?: '#'.$id),
                    'descripcion' => 'Conteo: había '.$this->num((float) $it->contado).', el sistema decía '.$this->num($virtualAlContar).' ('.($delta > 0 ? '+' : '−').$this->num(abs($delta)).')',
                ]);
                $ajustes++;
            }
            DB::table('conteos')->where('id', $id)->update(['estado' => 'aplicado', 'aplicado_en' => now(), 'aplicado_por' => $usuarioId, 'updated_at' => now()]);

            return [...(array) DB::table('conteos')->find($id), 'ajustes' => $ajustes, 'sinDiferencia' => $items->count() - $ajustes, 'avisos' => $avisos];
        });
    }

    public function descartar(int $id, bool $puedeAplicar = false, ?int $soloSuc = null): object
    {
        $c = $this->vivo($id, $soloSuc);
        if ($c->estado === 'aplicado') {
            throw new ErrorDeNegocio('Un control aplicado no se descarta: ya movió stock.');
        }
        if ($c->estado === 'descartado') {
            return $c;
        }
        if (! $puedeAplicar && DB::table('conteo_items')->where('conteo_id', $id)->whereNotNull('contado')->exists()) {
            throw new AccessDeniedHttpException('Este control ya tiene renglones contados: descartarlo es tirar ese trabajo, y lo decide quien puede aplicar.');
        }
        DB::table('conteos')->where('id', $id)->update(['estado' => 'descartado', 'updated_at' => now()]);

        return DB::table('conteos')->find($id);
    }
}
