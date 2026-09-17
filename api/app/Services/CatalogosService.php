<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * CATÁLOGOS DEL PRODUCTO: marcas, categorías, subcategorías, etiquetas. Se dan
 * de baja si tienen usos, se borran si no; y se pueden FUSIONAR ("Cachafaz" y
 * "CACHAFAZ" eran dos) moviendo todo lo que apuntaba a una hacia la otra.
 */
class CatalogosService
{
    public const TIPOS = ['marcas', 'categorias', 'subcategorias', 'etiquetas'];

    private const DEF = [
        'marcas' => [
            'singular' => 'La marca',
            'usos' => [['productos', 'marca_id', 'productos'], ['reglas_marca', 'marca_id', 'reglas de marca']],
            'mover' => [['productos', 'marca_id', null], ['reglas_marca', 'marca_id', 'modalidad_id']],
        ],
        'categorias' => [
            'singular' => 'La categoría',
            'usos' => [['productos', 'categoria_id', 'productos'], ['subcategorias', 'categoria_id', 'subcategorías']],
            'mover' => [['productos', 'categoria_id', null], ['subcategorias', 'categoria_id', 'nombre']],
        ],
        'subcategorias' => [
            'singular' => 'La subcategoría',
            'usos' => [['productos', 'subcategoria_id', 'productos']],
            'mover' => [['productos', 'subcategoria_id', null]],
        ],
        'etiquetas' => [
            'singular' => 'La etiqueta',
            'usos' => [['producto_etiquetas', 'etiqueta_id', 'productos']],
            'mover' => [['producto_etiquetas', 'etiqueta_id', 'producto_id']],
        ],
    ];

    /** Normaliza para comparar: sin acentos, mayúsculas, sin espacios de más. */
    public static function norm(?string $v): string
    {
        return Str::upper(trim(Str::ascii((string) $v)));
    }

    public function catalogo(): array
    {
        return [
            'marcas' => DB::table('marcas')->orderBy('nombre')->get(['id', 'nombre', 'activa'])->all(),
            'categorias' => DB::table('categorias')->orderBy('nombre')->get(['id', 'nombre', 'activa'])->all(),
            'subcategorias' => DB::table('subcategorias')->orderBy('nombre')->get(['id', 'categoria_id as categoriaId', 'nombre', 'activa'])->all(),
            'etiquetas' => DB::table('etiquetas')->orderBy('nombre')->get(['id', 'nombre', 'color', 'activa'])->all(),
        ];
    }

    private function def(string $tipo): array
    {
        if (! isset(self::DEF[$tipo])) {
            throw new ErrorDeNegocio('Catálogo inexistente.');
        }

        return self::DEF[$tipo];
    }

    private function duplicado(string $tipo, string $nombre, ?int $categoriaId = null, ?int $exceptoId = null): ?object
    {
        $n = self::norm($nombre);
        $filas = DB::table($tipo)
            ->when($exceptoId, fn ($q) => $q->where('id', '!=', $exceptoId))
            ->when($tipo === 'subcategorias' && $categoriaId, fn ($q) => $q->where('categoria_id', $categoriaId))
            ->get(['id', 'nombre']);

        return $filas->first(fn ($f) => self::norm($f->nombre) === $n);
    }

    private function fila(string $tipo, int $id): object
    {
        $f = DB::table($tipo)->find($id);
        if (! $f) {
            throw new NotFoundHttpException($this->def($tipo)['singular'].' no existe.');
        }

        return $f;
    }

    private function publica(string $tipo, object $f): array
    {
        $out = ['id' => $f->id, 'nombre' => $f->nombre, 'activa' => (bool) $f->activa];
        if ($tipo === 'subcategorias') {
            $out['categoriaId'] = $f->categoria_id;
        }
        if ($tipo === 'etiquetas') {
            $out['color'] = $f->color;
        }

        return $out;
    }

    public function crear(string $tipo, array $d): array
    {
        $this->def($tipo);
        $nombre = trim((string) ($d['nombre'] ?? ''));
        if ($nombre === '') {
            throw new ErrorDeNegocio('El nombre es obligatorio.');
        }
        $categoriaId = null;
        if ($tipo === 'subcategorias') {
            $categoriaId = (int) ($d['categoriaId'] ?? 0);
            if (! $categoriaId) {
                throw new ErrorDeNegocio('La subcategoría necesita una categoría.');
            }
            if (! DB::table('categorias')->where('id', $categoriaId)->exists()) {
                throw new ErrorDeNegocio('Categoría inválida.');
            }
        }
        if ($dup = $this->duplicado($tipo, $nombre, $categoriaId)) {
            throw new ErrorDeNegocio('Ya existe: "'.$dup->nombre.'".');
        }
        $values = ['nombre' => $nombre, 'activa' => $d['activa'] ?? true, 'created_at' => now(), 'updated_at' => now()];
        if ($tipo === 'subcategorias') {
            $values['categoria_id'] = $categoriaId;
        }
        if ($tipo === 'etiquetas') {
            $values['color'] = trim((string) ($d['color'] ?? ''));
        }
        $id = DB::table($tipo)->insertGetId($values);

        return $this->publica($tipo, $this->fila($tipo, $id));
    }

    public function editar(string $tipo, int $id, array $d): array
    {
        $actual = $this->fila($tipo, $id);
        $nombre = trim((string) ($d['nombre'] ?? ''));
        if ($nombre === '') {
            throw new ErrorDeNegocio('El nombre es obligatorio.');
        }
        $catId = $tipo === 'subcategorias' ? (int) ($d['categoriaId'] ?? $actual->categoria_id) : null;
        if ($dup = $this->duplicado($tipo, $nombre, $catId, $id)) {
            throw new ErrorDeNegocio('Ya existe: "'.$dup->nombre.'".');
        }
        $values = ['nombre' => $nombre, 'activa' => $d['activa'] ?? true, 'updated_at' => now()];
        if ($tipo === 'subcategorias') {
            $values['categoria_id'] = $catId;
        }
        if ($tipo === 'etiquetas') {
            $values['color'] = trim((string) ($d['color'] ?? ''));
        }
        DB::table($tipo)->where('id', $id)->update($values);

        return $this->publica($tipo, $this->fila($tipo, $id));
    }

    private function usos(string $tipo, int $id): array
    {
        $out = [];
        foreach ($this->def($tipo)['usos'] as [$tabla, $col, $que]) {
            $n = DB::table($tabla)->where($col, $id)->count();
            if ($n > 0) {
                $out[] = $n.' '.$que;
            }
        }

        return $out;
    }

    public function borrar(string $tipo, int $id): array
    {
        $this->fila($tipo, $id);
        $usos = $this->usos($tipo, $id);
        if ($usos) {
            DB::table($tipo)->where('id', $id)->update(['activa' => false, 'updated_at' => now()]);

            return ['ok' => true, 'desactivada' => true, 'row' => $this->publica($tipo, $this->fila($tipo, $id)), 'detalle' => implode(', ', $usos)];
        }
        DB::table($tipo)->where('id', $id)->delete();

        return ['ok' => true, 'desactivada' => false];
    }

    public function fusionar(string $tipo, int $desdeId, int $haciaId): array
    {
        $d = $this->def($tipo);
        if ($desdeId === $haciaId) {
            throw new ErrorDeNegocio('Elegí dos distintas.');
        }
        $origen = $this->fila($tipo, $desdeId);
        $destino = $this->fila($tipo, $haciaId);
        if ($tipo === 'subcategorias' && $origen->categoria_id !== $destino->categoria_id) {
            throw new ErrorDeNegocio('Solo se fusionan subcategorías de la misma categoría.');
        }
        DB::transaction(function () use ($d, $tipo, $desdeId, $haciaId) {
            foreach ($d['mover'] as [$tabla, $col, $unicoCon]) {
                if ($unicoCon) {
                    // Si el destino ya tiene el par, la fila del origen sobra (chocaría con el único).
                    DB::statement("DELETE o FROM `$tabla` o WHERE o.`$col` = ? AND EXISTS (SELECT 1 FROM (SELECT `$unicoCon` FROM `$tabla` WHERE `$col` = ?) d WHERE d.`$unicoCon` = o.`$unicoCon`)", [$desdeId, $haciaId]);
                }
                DB::table($tabla)->where($col, $desdeId)->update([$col => $haciaId]);
            }
            DB::table($tipo)->where('id', $desdeId)->delete();
        });

        return ['ok' => true, 'destino' => $this->publica($tipo, $destino)];
    }
}
