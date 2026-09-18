<?php

namespace App\Services;

use App\Enums\AlcanceOferta;
use App\Enums\TipoOferta;
use App\Exceptions\ErrorDeNegocio;
use App\Support\Fila;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * OFERTAS — catálogo y validación de promociones. El backend guarda la
 * DEFINICIÓN y valida que sea coherente; la aplicación en vivo la hace el
 * motor del POS y el servidor la ACOTA al vender. La validación por tipo vive
 * en UNA tabla (`reglas()`): formulario y servicio no pueden discrepar.
 */
class OfertasService
{
    /** Qué necesita cada mecánica: si pide alcance y el chequeo de sus números. */
    private static function reglas(): array
    {
        return [
            'porcentaje' => ['alcance' => true, 'check' => fn ($o) => ($o['porcentaje'] > 0 && $o['porcentaje'] <= 100) ? null : 'El porcentaje tiene que estar entre 0 y 100.'],
            'precio_fijo' => ['alcance' => true, 'check' => fn ($o) => $o['precio'] > 0 ? null : 'El precio de oferta tiene que ser mayor a 0.'],
            'nxm' => ['alcance' => true, 'check' => function ($o) {
                if (floor($o['lleva']) != $o['lleva'] || floor($o['paga']) != $o['paga']) {
                    return 'Llevá y pagá tienen que ser enteros.';
                }

                return ($o['lleva'] >= 2 && $o['paga'] >= 1 && $o['paga'] < $o['lleva']) ? null : 'Tiene que ser llevá N > pagá M (por ejemplo 3×2).';
            }],
            'segunda_unidad' => ['alcance' => true, 'check' => fn ($o) => ($o['porcentaje'] > 0 && $o['porcentaje'] <= 100) ? null : 'El descuento de la 2ª unidad tiene que estar entre 0 y 100.'],
            'pack' => ['alcance' => true, 'check' => function ($o) {
                if (floor($o['lleva']) != $o['lleva'] || $o['lleva'] < 2) {
                    return 'El pack necesita una cantidad entera de al menos 2.';
                }

                return $o['precio'] > 0 ? null : 'El precio del pack tiene que ser mayor a 0.';
            }],
            'combo' => ['alcance' => false, 'check' => fn ($o) => $o['precio'] > 0 ? null : 'El precio del combo tiene que ser mayor a 0.'],
            'ticket' => ['alcance' => false, 'check' => function ($o) {
                if (! ($o['porcentaje'] > 0 && $o['porcentaje'] <= 100)) {
                    return 'El porcentaje tiene que estar entre 0 y 100.';
                }

                return $o['montoMinimo'] > 0 ? null : 'El monto mínimo del ticket tiene que ser mayor a 0.';
            }],
        ];
    }

    /** Todas, con alcances y componentes anidados. */
    public function listar(): array
    {
        $os = DB::table('ofertas')->orderBy('id')->get();
        $als = DB::table('oferta_alcances')->get()->groupBy('oferta_id');
        $comps = DB::table('oferta_componentes')->get()->groupBy('oferta_id');

        return $os->map(fn ($o) => [
            ...Fila::camel($o),
            'alcances' => ($als->get($o->id) ?? collect())->map(fn ($a) => ['tipo' => $a->tipo, 'refId' => (int) $a->ref_id])->values()->all(),
            'componentes' => ($comps->get($o->id) ?? collect())->map(fn ($c) => ['productoId' => (int) $c->producto_id, 'cantidad' => (float) $c->cantidad])->values()->all(),
        ])->all();
    }

    /** Las que embarca el catálogo del POS: solo activas. */
    public function activas(): array
    {
        return array_values(array_filter($this->listar(), fn ($o) => $o['activa']));
    }

    /** CSV de ids: sin repetidos, sin basura y ordenado. */
    public static function idsCsv(?string $csv): string
    {
        $ids = array_values(array_unique(array_filter(array_map(fn ($x) => (int) trim($x), explode(',', (string) $csv)), fn ($n) => $n > 0)));
        sort($ids);

        return implode(',', $ids);
    }

    /** Normaliza + valida según el tipo. Es la única puerta de escritura. */
    private function normalizar(array $d): array
    {
        $nombre = trim($d['nombre'] ?? '');
        if ($nombre === '') {
            throw new ErrorDeNegocio('El nombre es obligatorio.');
        }
        $tipo = $d['tipo'] ?? '';
        $regla = self::reglas()[$tipo] ?? null;
        if (! $regla || ! in_array($tipo, TipoOferta::valores(), true)) {
            throw new ErrorDeNegocio('Tipo de oferta inválido.');
        }
        $o = [
            'nombre' => $nombre, 'tipo' => $tipo,
            'porcentaje' => (float) ($d['porcentaje'] ?? 0), 'precio' => (float) ($d['precio'] ?? 0),
            'lleva' => (float) ($d['lleva'] ?? 0), 'paga' => (float) ($d['paga'] ?? 0), 'montoMinimo' => (float) ($d['montoMinimo'] ?? 0),
            'desde' => ! empty($d['desde']) ? Carbon::parse($d['desde']) : null,
            'hasta' => ! empty($d['hasta']) ? Carbon::parse($d['hasta']) : null,
            'dias' => trim($d['dias'] ?? ''), 'sucursales' => self::idsCsv($d['sucursales'] ?? ''),
            'mediosPago' => $tipo === 'ticket' ? trim($d['mediosPago'] ?? '') : '',
            'listas' => self::idsCsv($d['listas'] ?? ''),
            'incluyeFraccionados' => (bool) ($d['incluyeFraccionados'] ?? false),
            'activa' => array_key_exists('activa', $d) ? (bool) $d['activa'] : true,
        ];
        if ($err = ($regla['check'])($o)) {
            throw new ErrorDeNegocio($err);
        }
        if ($o['desde'] && $o['hasta'] && $o['desde']->gt($o['hasta'])) {
            throw new ErrorDeNegocio('La vigencia termina antes de empezar.');
        }
        if ($o['dias'] !== '' && ! preg_match('/^[01]{7}$/', $o['dias'])) {
            throw new ErrorDeNegocio('Los días van como máscara de 7 (lunes a domingo).');
        }
        if ($o['dias'] === '0000000') {
            throw new ErrorDeNegocio('La oferta no vale ningún día.');
        }

        $alcances = [];
        foreach ($d['alcances'] ?? [] as $a) {
            if (in_array($a['tipo'] ?? '', AlcanceOferta::valores(), true) && (int) ($a['refId'] ?? 0) > 0) {
                $alcances[] = ['tipo' => $a['tipo'], 'ref_id' => (int) $a['refId']];
            }
        }
        if ($regla['alcance'] && ! $alcances) {
            throw new ErrorDeNegocio('Elegí a qué productos, paquetes, marcas, categorías o etiquetas alcanza.');
        }
        $componentes = [];
        foreach ($d['componentes'] ?? [] as $c) {
            if ((int) ($c['productoId'] ?? 0) > 0 && (float) ($c['cantidad'] ?? 0) > 0) {
                $componentes[(int) $c['productoId']] = ['producto_id' => (int) $c['productoId'], 'cantidad' => (float) $c['cantidad']];
            }
        }
        if ($tipo === 'combo' && count($componentes) < 2) {
            throw new ErrorDeNegocio('El combo necesita al menos dos productos.');
        }

        return [
            'fila' => [
                'nombre' => $o['nombre'], 'tipo' => $o['tipo'], 'porcentaje' => $o['porcentaje'], 'precio' => $o['precio'], 'lleva' => $o['lleva'],
                'paga' => $o['paga'], 'monto_minimo' => $o['montoMinimo'], 'desde' => $o['desde'], 'hasta' => $o['hasta'], 'dias' => $o['dias'],
                'sucursales' => $o['sucursales'], 'medios_pago' => $o['mediosPago'], 'listas' => $o['listas'],
                'incluye_fraccionados' => $o['incluyeFraccionados'], 'activa' => $o['activa'], 'updated_at' => now(),
            ],
            'alcances' => $regla['alcance'] ? $alcances : [],
            'componentes' => $tipo === 'combo' ? array_values($componentes) : [],
        ];
    }

    private function escribirHijas(int $ofertaId, array $alcances, array $componentes): void
    {
        DB::table('oferta_alcances')->where('oferta_id', $ofertaId)->delete();
        DB::table('oferta_componentes')->where('oferta_id', $ofertaId)->delete();
        $uniq = [];
        foreach ($alcances as $a) {
            $uniq[$a['tipo'].':'.$a['ref_id']] = [...$a, 'oferta_id' => $ofertaId];
        }
        if ($uniq) {
            DB::table('oferta_alcances')->insert(array_values($uniq));
        }
        if ($componentes) {
            DB::table('oferta_componentes')->insert(array_map(fn ($c) => [...$c, 'oferta_id' => $ofertaId], $componentes));
        }
    }

    public function crear(array $d): array
    {
        $n = $this->normalizar($d);

        return DB::transaction(function () use ($n) {
            $id = DB::table('ofertas')->insertGetId([...$n['fila'], 'created_at' => now()]);
            $this->escribirHijas($id, $n['alcances'], $n['componentes']);

            return $this->una($id);
        });
    }

    public function editar(int $id, array $d): array
    {
        $n = $this->normalizar($d);

        return DB::transaction(function () use ($id, $n) {
            if (! DB::table('ofertas')->where('id', $id)->update($n['fila'])) {
                throw new NotFoundHttpException('Oferta inexistente.');
            }
            $this->escribirHijas($id, $n['alcances'], $n['componentes']);

            return $this->una($id);
        });
    }

    public function una(int $id): array
    {
        $o = collect($this->listar())->firstWhere('id', $id);
        if (! $o) {
            throw new NotFoundHttpException('Oferta inexistente.');
        }

        return $o;
    }

    /** Usada en ventas → se desactiva (el ticket viejo la referencia). */
    public function borrar(int $id): array
    {
        if (! DB::table('ofertas')->where('id', $id)->exists()) {
            throw new NotFoundHttpException('Oferta inexistente.');
        }
        if (DB::table('venta_items')->where('oferta_id', $id)->exists()) {
            DB::table('ofertas')->where('id', $id)->update(['activa' => false, 'updated_at' => now()]);

            return ['ok' => true, 'desactivada' => true];
        }
        DB::table('ofertas')->where('id', $id)->delete();

        return ['ok' => true, 'desactivada' => false];
    }

    /** Para validar al confirmar: las ofertas de ticket con medio de pago exigido. */
    public function ticketConMedios(array $ids): array
    {
        if (! $ids) {
            return [];
        }

        return DB::table('ofertas')->whereIn('id', $ids)->where('tipo', 'ticket')->where('medios_pago', '!=', '')->get()->all();
    }
}
