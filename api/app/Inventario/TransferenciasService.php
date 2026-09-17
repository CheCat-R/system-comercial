<?php

namespace App\Inventario;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Producto;
use App\Precios\CostoEntry;
use App\Precios\Pricing;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * TRANSFERENCIAS — modelo PULL con el stock acompañando los estados:
 *
 *   borrador ─enviar─► pendiente ─tomar─► preparada ─despachar─► transito ─recibir─► recibida
 *   (lo arma el       (demanda:           (dos listas: ENTEROS y      (comprometido→     (lo contado va al
 *    destino)          sin stock)          GRANEL; cada encargado      en_transito,       destino; el resto,
 *                                          CONFIRMA la suya y recién   sigue en el        a incidencia)
 *                                          ahí se reserva)             origen)
 *
 * El pedido NO exige ni toca stock. La realidad entra al CONFIRMAR cada
 * lista. El despacho exige todas las listas presentes confirmadas y viaja LO
 * PREPARADO, no lo pedido.
 */
class TransferenciasService extends StockCore
{
    private function listaDe(string $prodTipo): string
    {
        return $prodTipo === 'granel' ? 'granel' : 'enteros';
    }

    private function codigo(int $id): string
    {
        return 'TR'.str_pad((string) $id, 4, '0', STR_PAD_LEFT);
    }

    private function hist(int $tId, string $estado, ?int $usuarioId): void
    {
        DB::table('transferencia_hist')->insert(['transferencia_id' => $tId, 'estado' => $estado, 'fecha' => now(), 'usuario_id' => $usuarioId]);
    }

    private function buscar(int $id): object
    {
        $t = DB::table('transferencias')->find($id);
        if (! $t) {
            throw new NotFoundHttpException('Transferencia inexistente.');
        }

        return $t;
    }

    /** El cajero sólo toca las de su sucursal: el destino pide y recibe, el origen prepara. */
    private function exigirLado(object $t, ?int $soloSuc, string $lado): void
    {
        if ($soloSuc === null) {
            return;
        }
        if ((int) $t->{$lado} !== $soloSuc) {
            throw new AccessDeniedHttpException($lado === 'destino_id'
                ? 'Ese pedido es de otra sucursal: lo pide y lo recibe ella.'
                : 'Esa transferencia sale de otra sucursal: la prepara ella.');
        }
    }

    /* ---------------- Creación directa ---------------- */

    public function crear(array $o): array
    {
        return DB::transaction(function () use ($o) {
            [$origen, $destino] = $this->extremos((int) ($o['origenId'] ?? 0), (int) ($o['destinoId'] ?? 0));
            $items = array_values(array_filter($o['items'] ?? [], fn ($it) => (float) ($it['cantidad'] ?? 0) > 0));
            if (! $items) {
                throw new ErrorDeNegocio('Agregá al menos un ítem con cantidad.');
            }
            $id = DB::table('transferencias')->insertGetId([
                'codigo' => '', 'fecha' => now(), 'origen_id' => $origen->id, 'destino_id' => $destino->id,
                'usuario_id' => $o['usuarioId'] ?? null, 'estado' => 'pendiente',
                'observaciones' => trim((string) ($o['observaciones'] ?? '')), 'created_at' => now(), 'updated_at' => now(),
            ]);
            $codigo = $this->codigo($id);
            DB::table('transferencias')->where('id', $id)->update(['codigo' => $codigo]);
            $this->hist($id, 'pendiente', $o['usuarioId'] ?? null);
            DB::table('transferencia_items')->insert(array_map(fn ($it) => [
                'transferencia_id' => $id, 'producto_id' => (int) $it['productoId'],
                'presentacion_id' => (int) ($it['presId'] ?? 0) ?: null, 'cantidad' => (float) $it['cantidad'],
                // Lo preparado arranca igual a lo pedido; el origen lo ajusta después.
                'cantidad_preparada' => (float) $it['cantidad'],
            ], $items));

            return ['ok' => true, 'id' => $id, 'codigo' => $codigo];
        });
    }

    private function extremos(int $origenId, int $destinoId): array
    {
        $origen = DB::table('sucursales')->find($origenId);
        $destino = DB::table('sucursales')->find($destinoId);
        if (! $origen || ! $destino || $origen->id === $destino->id) {
            throw new ErrorDeNegocio('Elegí origen y destino distintos.');
        }

        return [$origen, $destino];
    }

    /* ---------------- Borrador (el pedido que arma el destino) ---------------- */

    /** Devuelve el borrador vigente del par origen→destino, creándolo si no existe (uno solo por par). */
    public function borrador(array $o): array
    {
        return DB::transaction(function () use ($o) {
            [$origen, $destino] = $this->extremos((int) ($o['origenId'] ?? 0), (int) ($o['destinoId'] ?? 0));
            $buscar = fn () => DB::table('transferencias')
                ->where('origen_id', $origen->id)->where('destino_id', $destino->id)->where('estado', 'borrador')->first();
            $t = $buscar();
            if (! $t) {
                try {
                    $id = DB::table('transferencias')->insertGetId([
                        'codigo' => '', 'fecha' => now(), 'origen_id' => $origen->id, 'destino_id' => $destino->id,
                        'usuario_id' => $o['usuarioId'] ?? null, 'estado' => 'borrador', 'observaciones' => '',
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                    $t = DB::table('transferencias')->find($id);
                } catch (QueryException $e) {
                    // Dos personas abrieron el pedido en el mismo segundo: el índice único dejó pasar a uno.
                    $t = $buscar();
                    if (! $t) {
                        throw $e;
                    }
                }
            }
            $items = DB::table('transferencia_items')->where('transferencia_id', $t->id)->get();

            return [...(array) $t, 'items' => $items->all()];
        });
    }

    private function borradorVigente(int $id, ?int $soloSuc): object
    {
        $t = DB::table('transferencias')->find($id);
        if (! $t) {
            throw new NotFoundHttpException('Pedido inexistente.');
        }
        $this->exigirLado($t, $soloSuc, 'destino_id');
        if ($t->estado !== 'borrador') {
            throw new ErrorDeNegocio('Este pedido ya se envió: no se edita como borrador.');
        }

        return $t;
    }

    public function guardarBorrador(int $id, array $o, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $o, $soloSuc) {
            $t = $this->borradorVigente($id, $soloSuc);
            $crudos = is_array($o['items'] ?? null) ? $o['items'] : [];
            if (count($crudos) > 300) {
                throw new ErrorDeNegocio('Demasiados renglones en un pedido (máximo 300).');
            }
            $filas = [];
            foreach ($crudos as $it) {
                $prodId = (int) ($it['productoId'] ?? 0);
                if ($prodId <= 0) {
                    continue;
                }
                if (! $this->producto($prodId)) {
                    throw new ErrorDeNegocio('Hay un renglón con un producto que ya no existe.');
                }
                if (! is_numeric($it['cantidad'] ?? null) || (float) $it['cantidad'] < 0) {
                    throw new ErrorDeNegocio('Cantidad inválida en un renglón.');
                }
                $presId = (int) ($it['presId'] ?? 0) ?: null;
                if ($presId && ! DB::table('presentaciones')->where('id', $presId)->where('producto_id', $prodId)->exists()) {
                    throw new ErrorDeNegocio('Una presentación elegida no es de su producto.');
                }
                $filas[] = ['transferencia_id' => $t->id, 'producto_id' => $prodId, 'presentacion_id' => $presId,
                    'cantidad' => (float) $it['cantidad'], 'cantidad_preparada' => (float) $it['cantidad']];
            }
            DB::table('transferencia_items')->where('transferencia_id', $t->id)->delete();
            if ($filas) {
                DB::table('transferencia_items')->insert($filas);
            }
            $patch = ['updated_at' => now()];
            if (array_key_exists('observaciones', $o)) {
                $patch['observaciones'] = trim((string) $o['observaciones']);
            }
            // Queda quién lo tocó ÚLTIMO: el borrador pasa de mano en mano entre turnos.
            if (! empty($o['usuarioId'])) {
                $patch['usuario_id'] = $o['usuarioId'];
            }
            DB::table('transferencias')->where('id', $t->id)->update($patch);

            return ['ok' => true, 'renglones' => count($filas)];
        });
    }

    public function enviarBorrador(int $id, array $o = [], ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $o, $soloSuc) {
            $t = $this->borradorVigente($id, $soloSuc);
            $items = DB::table('transferencia_items')->where('transferencia_id', $t->id)->get();
            $vacios = $items->filter(fn ($it) => ! ((float) $it->cantidad > self::EPS));
            if ($items->count() - $vacios->count() === 0) {
                throw new ErrorDeNegocio('El pedido no tiene ningún renglón con cantidad.');
            }
            DB::table('transferencia_items')->whereIn('id', $vacios->pluck('id'))->delete();

            $codigo = $this->codigo($t->id);
            // Reclamo atómico: dos "Enviar" simultáneos mandarían el pedido dos veces.
            $gano = DB::table('transferencias')->where('id', $t->id)->where('estado', 'borrador')->update([
                'estado' => 'pendiente', 'codigo' => $codigo, 'fecha' => now(),
                'usuario_id' => $o['usuarioId'] ?? $t->usuario_id, 'updated_at' => now(),
            ]);
            if (! $gano) {
                throw new ErrorDeNegocio('El pedido ya se había enviado — actualizá la pantalla.');
            }
            $this->hist($t->id, 'pendiente', $o['usuarioId'] ?? null);

            return ['ok' => true, 'id' => $t->id, 'codigo' => $codigo, 'renglones' => $items->count() - $vacios->count()];
        });
    }

    public function descartarBorrador(int $id, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $soloSuc) {
            $t = $this->borradorVigente($id, $soloSuc);
            DB::table('transferencia_items')->where('transferencia_id', $t->id)->delete();
            DB::table('transferencia_hist')->where('transferencia_id', $t->id)->delete();
            DB::table('transferencias')->where('id', $t->id)->delete();

            return ['ok' => true];
        });
    }

    /* ---------------- Preparación (el origen) ---------------- */

    private function enPreparacion(int $id, ?int $soloSuc): object
    {
        $t = $this->buscar($id);
        // Contra el ORIGEN: preparar es sacar mercadería del propio depósito.
        $this->exigirLado($t, $soloSuc, 'origen_id');
        if ($t->estado !== 'preparada') {
            throw new ErrorDeNegocio('Solo se edita durante la preparación.');
        }

        return $t;
    }

    private function listaBloqueada(object $t, string $lista): bool
    {
        return (bool) ($lista === 'enteros' ? $t->enteros_listo : $t->granel_listo);
    }

    private function item(int $tId, int $itemId): object
    {
        $it = DB::table('transferencia_items')->where('id', $itemId)->where('transferencia_id', $tId)->first();
        if (! $it) {
            throw new NotFoundHttpException('Renglón inexistente.');
        }

        return $it;
    }

    public function editarItem(int $id, int $itemId, array $o, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $itemId, $o, $soloSuc) {
            $t = $this->enPreparacion($id, $soloSuc);
            $it = $this->item($id, $itemId);
            $prod = $this->producto($it->producto_id);
            if ($this->listaBloqueada($t, $this->listaDe($prod->tipo->value))) {
                throw new ErrorDeNegocio('Esa lista ya está confirmada — desconfirmala para editar.');
            }
            $patch = [];
            if (array_key_exists('cantidadPreparada', $o) && $o['cantidadPreparada'] !== null) {
                if (! is_numeric($o['cantidadPreparada']) || (float) $o['cantidadPreparada'] < 0) {
                    throw new ErrorDeNegocio('Cantidad preparada inválida.');
                }
                $patch['cantidad_preparada'] = (float) $o['cantidadPreparada'];
            }
            if (array_key_exists('motivo', $o) && $o['motivo'] !== null) {
                $patch['motivo'] = trim((string) $o['motivo']);
            }
            if ($patch) {
                DB::table('transferencia_items')->where('id', $itemId)->update($patch);
            }

            return ['ok' => true];
        });
    }

    public function agregarItem(int $id, array $o, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $o, $soloSuc) {
            $t = $this->enPreparacion($id, $soloSuc);
            $prod = $this->producto((int) ($o['productoId'] ?? 0));
            if (! $prod) {
                throw new ErrorDeNegocio('Producto inválido.');
            }
            if ($this->listaBloqueada($t, $this->listaDe($prod->tipo->value))) {
                throw new ErrorDeNegocio('Esa lista ya está confirmada — desconfirmala para agregar.');
            }
            $c = (float) ($o['cantidad'] ?? 0);
            if (! ($c > 0)) {
                throw new ErrorDeNegocio('Ingresá la cantidad que se agrega.');
            }
            $itemId = DB::table('transferencia_items')->insertGetId([
                'transferencia_id' => $id, 'producto_id' => $prod->id, 'presentacion_id' => (int) ($o['presId'] ?? 0) ?: null,
                'cantidad' => 0, 'cantidad_preparada' => $c, 'agregado' => true,
                'motivo' => trim((string) ($o['motivo'] ?? '')) ?: 'Agregado en preparación',
            ]);

            return ['ok' => true, 'itemId' => $itemId];
        });
    }

    public function quitarItem(int $id, int $itemId, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $itemId, $soloSuc) {
            $t = $this->enPreparacion($id, $soloSuc);
            $it = $this->item($id, $itemId);
            if (! $it->agregado) {
                throw new ErrorDeNegocio('Los renglones pedidos por el destino no se borran: poné la cantidad preparada en 0.');
            }
            $prod = $this->producto($it->producto_id);
            if ($this->listaBloqueada($t, $this->listaDe($prod->tipo->value))) {
                throw new ErrorDeNegocio('Esa lista ya está confirmada — desconfirmala para quitar renglones.');
            }
            DB::table('transferencia_items')->where('id', $itemId)->delete();

            return ['ok' => true];
        });
    }

    /** Confirmar una lista es RESERVAR (disponible → comprometido); desconfirmar, liberar. */
    public function confirmarLista(int $id, array $o, ?int $soloSuc = null): array
    {
        $tipo = $o['tipo'] ?? '';
        if (! in_array($tipo, ['enteros', 'granel'], true)) {
            throw new ErrorDeNegocio('Lista inválida.');
        }
        $listo = (bool) ($o['listo'] ?? false);

        return DB::transaction(function () use ($id, $tipo, $listo, $o, $soloSuc) {
            $t = $this->enPreparacion($id, $soloSuc);
            $col = $tipo === 'enteros' ? 'enteros_listo' : 'granel_listo';
            $gano = DB::table('transferencias')->where('id', $id)->where('estado', 'preparada')->where($col, ! $listo)
                ->update([$col => $listo, 'updated_at' => now()]);
            if (! $gano) {
                throw new ErrorDeNegocio('La lista cambió de estado — actualizá la pantalla.');
            }

            $mios = [];
            foreach (DB::table('transferencia_items')->where('transferencia_id', $id)->get() as $it) {
                $prod = $this->producto($it->producto_id);
                if ($this->listaDe($prod->tipo->value) === $tipo && (float) $it->cantidad_preparada > self::EPS) {
                    $mios[] = [$it, $prod];
                }
            }

            if ($listo) {
                // Primero se valida TODO y recién después se mueve: sin reservas a medias.
                $faltas = [];
                foreach ($mios as [$it, $prod]) {
                    $disp = $this->cant($it->producto_id, $t->origen_id, $it->presentacion_id, 'disponible');
                    if ((float) $it->cantidad_preparada > $disp + self::EPS) {
                        $faltas[] = $prod->nombre.': preparado '.$this->fmtCant($prod->tipo->value, $it->presentacion_id, (float) $it->cantidad_preparada)
                            .', disponible '.$this->fmtCant($prod->tipo->value, $it->presentacion_id, $disp);
                    }
                }
                if ($faltas) {
                    throw new ErrorDeNegocio('Stock insuficiente para confirmar — '.implode(' · ', $faltas));
                }
            }

            $etiqueta = $tipo === 'enteros' ? 'Enteros' : 'Fraccionados';
            foreach ($mios as [$it, $prod]) {
                [$desde, $hacia] = $listo ? ['disponible', 'comprometido'] : ['comprometido', 'disponible'];
                $this->move($it->producto_id, $t->origen_id, $it->presentacion_id, $desde, $hacia, (float) $it->cantidad_preparada);
                $this->mov([
                    'tipo' => 'transferencia', 'producto_id' => $it->producto_id, 'sucursal_id' => $t->origen_id,
                    'presentacion_id' => $it->presentacion_id, 'signo' => 0, 'cantidad' => $it->cantidad_preparada,
                    'unidad' => $this->unidadDe($prod->tipo->value, $it->presentacion_id), 'estado_desde' => $desde, 'estado_hacia' => $hacia,
                    'sucursal_destino_id' => $t->destino_id, 'ref_transferencia_id' => $t->id, 'usuario_id' => $o['usuarioId'] ?? null,
                    'descripcion' => $t->codigo.': lista '.$etiqueta.($listo ? ' confirmada, stock reservado' : ' desconfirmada, stock liberado'),
                ]);
            }

            return ['ok' => true, 'tipo' => $tipo, 'listo' => $listo];
        });
    }

    private function despachar(object $t, ?int $usuarioId): void
    {
        $items = DB::table('transferencia_items')->where('transferencia_id', $t->id)->get();
        foreach ($items as $it) {
            // Viaja LO PREPARADO. Un renglón en 0 ("no había") no viaja ni se valúa.
            if (! ((float) $it->cantidad_preparada > self::EPS)) {
                continue;
            }
            $prod = $this->producto($it->producto_id);
            $activo = $this->formatoActivoDe($prod->id);
            $costo = Pricing::costoNetoEntry($activo ? CostoEntry::desde((array) $activo) : null, (float) $prod->iva);
            if ($it->presentacion_id) {
                $costo *= (float) (DB::table('presentaciones')->where('id', $it->presentacion_id)->value('tam_kg') ?? 1);
            }
            DB::table('transferencia_items')->where('id', $it->id)->update(['costo_unitario' => $costo]);

            $this->move($it->producto_id, $t->origen_id, $it->presentacion_id, 'comprometido', 'en_transito', (float) $it->cantidad_preparada);
            $this->mov([
                'tipo' => 'transferencia', 'producto_id' => $it->producto_id, 'sucursal_id' => $t->origen_id, 'presentacion_id' => $it->presentacion_id,
                'signo' => 0, 'cantidad' => $it->cantidad_preparada, 'unidad' => $this->unidadDe($prod->tipo->value, $it->presentacion_id),
                'estado_desde' => 'comprometido', 'estado_hacia' => 'en_transito', 'sucursal_destino_id' => $t->destino_id,
                'ref_transferencia_id' => $t->id, 'usuario_id' => $usuarioId, 'descripcion' => $t->codigo.': despacho hacia destino',
            ]);
        }
    }

    /** pendiente → preparada (abre la preparación, sin tocar stock) → transito (despacha). */
    public function avanzar(int $id, ?int $usuarioId = null, ?string $desde = null, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $usuarioId, $desde, $soloSuc) {
            $t = $this->buscar($id);
            $this->exigirLado($t, $soloSuc, 'origen_id');
            if ($desde && $t->estado !== $desde) {
                throw new ErrorDeNegocio('La transferencia cambió de estado — actualizá la pantalla.');
            }
            $siguiente = match ($t->estado) {
                'borrador' => throw new ErrorDeNegocio('Este pedido todavía se está armando: el que lo pide tiene que enviarlo.'),
                'pendiente' => 'preparada',
                'preparada' => 'transito',
                'transito' => throw new ErrorDeNegocio('Está en tránsito: se cierra desde "Recibir", contando lo que llegó.'),
                default => throw new ErrorDeNegocio('La transferencia ya está en su estado final.'),
            };

            if ($siguiente === 'transito') {
                $hayEnteros = $hayGranel = $viaja = false;
                foreach (DB::table('transferencia_items')->where('transferencia_id', $t->id)->get() as $it) {
                    $prod = $this->producto($it->producto_id);
                    if ($this->listaDe($prod->tipo->value) === 'granel') {
                        $hayGranel = true;
                    } else {
                        $hayEnteros = true;
                    }
                    if ((float) $it->cantidad_preparada > self::EPS) {
                        $viaja = true;
                    }
                }
                if (! $viaja) {
                    throw new ErrorDeNegocio('No hay nada preparado para despachar: todos los renglones están en 0.');
                }
                $faltan = [];
                if ($hayEnteros && ! $t->enteros_listo) {
                    $faltan[] = 'Enteros';
                }
                if ($hayGranel && ! $t->granel_listo) {
                    $faltan[] = 'Fraccionados';
                }
                if ($faltan) {
                    throw new ErrorDeNegocio('Falta confirmar: '.implode(' y ', $faltan).'. Cada encargado confirma su lista cuando la mercadería está apartada.');
                }
            }

            $gano = DB::table('transferencias')->where('id', $t->id)->where('estado', $t->estado)->update(['estado' => $siguiente, 'updated_at' => now()]);
            if (! $gano) {
                throw new ErrorDeNegocio('La transferencia cambió de estado — actualizá la pantalla.');
            }
            if ($siguiente === 'transito') {
                $this->despachar($t, $usuarioId);
            }
            $this->hist($t->id, $siguiente, $usuarioId);

            return ['ok' => true, 'estado' => $siguiente];
        });
    }

    /** Se recibe contra LO PREPARADO. El faltante queda comprometido en el origen con una incidencia. */
    public function recibir(int $id, array $o = [], ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $o, $soloSuc) {
            $t = $this->buscar($id);
            $this->exigirLado($t, $soloSuc, 'destino_id');
            if ($t->estado !== 'transito') {
                throw new ErrorDeNegocio('Solo se recibe lo que está en tránsito.');
            }
            $gano = DB::table('transferencias')->where('id', $t->id)->where('estado', 'transito')->update(['estado' => 'recibida', 'updated_at' => now()]);
            if (! $gano) {
                throw new ErrorDeNegocio('La transferencia cambió de estado — actualizá la pantalla.');
            }
            $items = DB::table('transferencia_items')->where('transferencia_id', $t->id)->get();
            $origen = DB::table('sucursales')->find($t->origen_id);
            $destino = DB::table('sucursales')->find($t->destino_id);
            $contado = [];
            foreach ($o['items'] ?? [] as $x) {
                $contado[(int) $x['itemId']] = (float) $x['cantidadRecibida'];
            }
            $usuarioId = $o['usuarioId'] ?? null;
            $incidenciasCreadas = [];

            foreach ($items as $it) {
                $enviado = (float) $it->cantidad_preparada;
                if (! ($enviado > self::EPS)) {
                    DB::table('transferencia_items')->where('id', $it->id)->update(['cantidad_recibida' => 0]);

                    continue;
                }
                $prod = $this->producto($it->producto_id);
                $tipo = $prod->tipo->value;
                $unidad = $this->unidadDe($tipo, $it->presentacion_id);
                // Sin conteo explícito se asume completo; jamás más de lo enviado.
                $rec = min(max($contado[$it->id] ?? $enviado, 0), $enviado);
                $faltante = $enviado - $rec;
                DB::table('transferencia_items')->where('id', $it->id)->update(['cantidad_recibida' => $rec]);

                if ($rec > self::EPS) {
                    $enTransito = $this->cant($it->producto_id, $t->origen_id, $it->presentacion_id, 'en_transito');
                    if ($enTransito + self::EPS < $rec) {
                        throw new ErrorDeNegocio($t->codigo.': '.$prod->nombre.' figura con '.$this->fmtCant($tipo, $it->presentacion_id, $enTransito)
                            .' en tránsito y se están recibiendo '.$this->fmtCant($tipo, $it->presentacion_id, $rec).'. El remito quedó inconsistente: revisalo antes de recibirlo.');
                    }
                    $this->addDelta($this->coord($it->producto_id, $t->origen_id, $it->presentacion_id, 'en_transito'), -$rec);
                    $this->mov([
                        'tipo' => 'transferencia', 'producto_id' => $it->producto_id, 'sucursal_id' => $t->origen_id, 'presentacion_id' => $it->presentacion_id,
                        'signo' => -1, 'cantidad' => $rec, 'unidad' => $unidad, 'estado_desde' => 'en_transito', 'sucursal_destino_id' => $t->destino_id,
                        'ref_transferencia_id' => $t->id, 'usuario_id' => $usuarioId, 'descripcion' => $t->codigo.': entregado a '.($destino->nombre ?? ''),
                    ]);
                    $this->addDelta($this->coord($it->producto_id, $t->destino_id, $it->presentacion_id, 'disponible'), $rec);
                    $this->mov([
                        'tipo' => 'transferencia', 'producto_id' => $it->producto_id, 'sucursal_id' => $t->destino_id, 'presentacion_id' => $it->presentacion_id,
                        'signo' => 1, 'cantidad' => $rec, 'unidad' => $unidad, 'estado_hacia' => 'disponible', 'ref_transferencia_id' => $t->id,
                        'usuario_id' => $usuarioId, 'descripcion' => $t->codigo.': recepción desde '.($origen->nombre ?? ''),
                    ]);
                }

                if ($faltante > self::EPS) {
                    // La diferencia no se pierde: queda retenida en el origen con una incidencia que ALGUIEN tiene que cerrar.
                    $this->move($it->producto_id, $t->origen_id, $it->presentacion_id, 'en_transito', 'comprometido', $faltante);
                    $incId = DB::table('incidencias')->insertGetId([
                        'codigo' => '', 'fecha' => now(), 'tipo' => 'faltante', 'estado' => 'pendiente', 'responsable_id' => $usuarioId,
                        'motivo' => $t->codigo.' '.($origen->nombre ?? '').' → '.($destino->nombre ?? '').': se enviaron '.$this->fmtCant($tipo, $it->presentacion_id, $enviado)
                            .' de '.$prod->nombre.' y llegaron '.$this->fmtCant($tipo, $it->presentacion_id, $rec).'.',
                        'producto_id' => $it->producto_id, 'sucursal_id' => $t->origen_id, 'presentacion_id' => $it->presentacion_id,
                        'cantidad' => $faltante, 'unidad' => $unidad, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                    $codigoInc = 'INC'.str_pad((string) $incId, 4, '0', STR_PAD_LEFT);
                    DB::table('incidencias')->where('id', $incId)->update(['codigo' => $codigoInc]);
                    $incidenciasCreadas[] = $codigoInc;
                    $this->mov([
                        'tipo' => 'ajuste', 'producto_id' => $it->producto_id, 'sucursal_id' => $t->origen_id, 'presentacion_id' => $it->presentacion_id, 'signo' => 0,
                        'cantidad' => $faltante, 'unidad' => $unidad, 'estado_desde' => 'en_transito', 'estado_hacia' => 'comprometido',
                        'ref_transferencia_id' => $t->id, 'ref_incidencia_id' => $incId, 'usuario_id' => $usuarioId,
                        'descripcion' => $t->codigo.': faltante en recepción → '.$codigoInc,
                    ]);
                }
            }

            $obs = trim((string) ($o['observaciones'] ?? ''));
            if ($obs !== '') {
                DB::table('transferencias')->where('id', $t->id)->update(['observaciones' => $t->observaciones ? $t->observaciones.' · '.$obs : $obs]);
            }
            $this->hist($t->id, 'recibida', $usuarioId);

            return ['ok' => true, 'estado' => 'recibida', 'incidencias' => $incidenciasCreadas];
        });
    }

    public function cancelar(int $id, ?int $usuarioId = null, ?int $soloSuc = null): array
    {
        return DB::transaction(function () use ($id, $usuarioId, $soloSuc) {
            $t = $this->buscar($id);
            $this->exigirLado($t, $soloSuc, 'origen_id');
            if ($t->estado === 'borrador') {
                throw new ErrorDeNegocio('Este pedido todavía se está armando: se descarta, no se cancela.');
            }
            if (! in_array($t->estado, ['pendiente', 'preparada'], true)) {
                throw new ErrorDeNegocio('Solo se cancelan transferencias pendientes o preparadas.');
            }
            $gano = DB::table('transferencias')->where('id', $t->id)->where('estado', $t->estado)->update(['estado' => 'cancelada', 'updated_at' => now()]);
            if (! $gano) {
                throw new ErrorDeNegocio('La transferencia cambió de estado — actualizá la pantalla.');
            }
            // El pedido (pendiente) nunca tocó stock. En preparación, la reserva existe SOLO en las listas confirmadas.
            if ($t->estado === 'preparada') {
                foreach (DB::table('transferencia_items')->where('transferencia_id', $t->id)->get() as $it) {
                    if (! ((float) $it->cantidad_preparada > self::EPS)) {
                        continue;
                    }
                    $prod = $this->producto($it->producto_id);
                    $confirmada = $this->listaDe($prod->tipo->value) === 'granel' ? $t->granel_listo : $t->enteros_listo;
                    if (! $confirmada) {
                        continue;
                    }
                    $this->move($it->producto_id, $t->origen_id, $it->presentacion_id, 'comprometido', 'disponible', (float) $it->cantidad_preparada);
                    $this->mov([
                        'tipo' => 'transferencia', 'producto_id' => $it->producto_id, 'sucursal_id' => $t->origen_id, 'presentacion_id' => $it->presentacion_id,
                        'signo' => 0, 'cantidad' => $it->cantidad_preparada, 'unidad' => $this->unidadDe($prod->tipo->value, $it->presentacion_id),
                        'estado_desde' => 'comprometido', 'estado_hacia' => 'disponible', 'usuario_id' => $usuarioId,
                        'ref_transferencia_id' => $t->id, 'descripcion' => $t->codigo.': cancelada, stock liberado',
                    ]);
                }
            }
            $this->hist($t->id, 'cancelada', $usuarioId);

            return ['ok' => true];
        });
    }

    /* ---------------- Consultas ---------------- */

    public function listar(?int $soloSuc = null): array
    {
        $ts = DB::table('transferencias')
            ->when($soloSuc !== null, fn ($q) => $q->where(fn ($w) => $w->where('origen_id', $soloSuc)->orWhere('destino_id', $soloSuc)))
            ->orderByDesc('id')->limit(300)->get();
        if ($ts->isEmpty()) {
            return [];
        }
        $ids = $ts->pluck('id');
        $items = DB::table('transferencia_items')->whereIn('transferencia_id', $ids)->get()->groupBy('transferencia_id');
        $hist = DB::table('transferencia_hist')->whereIn('transferencia_id', $ids)->orderBy('id')->get()->groupBy('transferencia_id');

        return $ts->map(fn ($t) => [
            ...(array) $t,
            'items' => ($items[$t->id] ?? collect())->values()->all(),
            'hist' => ($hist[$t->id] ?? collect())->values()->all(),
        ])->all();
    }

    public function get(int $id): array
    {
        $t = $this->buscar($id);

        return [
            ...(array) $t,
            'items' => DB::table('transferencia_items')->where('transferencia_id', $id)->get()->all(),
            'hist' => DB::table('transferencia_hist')->where('transferencia_id', $id)->orderBy('id')->get()->all(),
        ];
    }
}
