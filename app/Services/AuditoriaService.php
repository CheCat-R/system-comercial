<?php

namespace App\Services;

use App\Models\Auditoria;
use Illuminate\Support\Str;

/**
 * Registro de cambios campo por campo. Registrar es del módulo dueño, que es
 * el único que sabe qué cambió: acá sólo se escribe lo que le pasan.
 */
class AuditoriaService
{
    /**
     * @param array<int, array{entidad:string, entidadId:int, ambito:string, campo:string, detalle?:string, antes?:mixed, despues?:mixed, usuarioId?:int|null}> $cambios
     */
    public function registrar(array $cambios): void
    {
        $filas = [];
        $ahora = now();
        foreach ($cambios as $c) {
            if (empty($c['campo'])) {
                continue;
            }
            $filas[] = [
                'fecha' => $ahora,
                'usuario_id' => $c['usuarioId'] ?? null,
                'entidad' => $c['entidad'],
                'entidad_id' => $c['entidadId'],
                'ambito' => $c['ambito'],
                'detalle' => Str::limit((string) ($c['detalle'] ?? ''), 200, ''),
                'campo' => Str::limit((string) $c['campo'], 120, ''),
                'antes' => Str::limit((string) ($c['antes'] ?? ''), 300, ''),
                'despues' => Str::limit((string) ($c['despues'] ?? ''), 300, ''),
            ];
        }
        if ($filas) {
            Auditoria::query()->insert($filas);
        }
    }

    /**
     * Arma los asientos comparando dos fotos de la entidad. `$campos` mapea
     * clave → etiqueta visible; sólo se anota lo que cambió.
     *
     * @param array{entidad:string, entidadId:int, ambito:string, detalle?:string, usuarioId?:int|null} $base
     */
    public function diferencias(array $base, array $antes, array $despues, array $campos): array
    {
        $out = [];
        foreach ($campos as $clave => $etiqueta) {
            $a = (string) ($antes[$clave] ?? '');
            $d = (string) ($despues[$clave] ?? '');
            if ($a !== $d) {
                $out[] = [...$base, 'campo' => $etiqueta, 'antes' => $a, 'despues' => $d];
            }
        }

        return $out;
    }

    public function listar(string $entidad, int $entidadId, ?int $limit = null): array
    {
        $limit = min(max($limit ?? 100, 1), 500);

        return Auditoria::query()
            ->with('usuario:id,nombre')
            ->where('entidad', $entidad)
            ->where('entidad_id', $entidadId)
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (Auditoria $a) => [
                'id' => $a->id,
                'fecha' => $a->fecha?->toIso8601String(),
                'ambito' => $a->ambito,
                'detalle' => $a->detalle,
                'campo' => $a->campo,
                'antes' => $a->antes,
                'despues' => $a->despues,
                'usuario' => $a->usuario?->nombre ?? '',
            ])
            ->all();
    }
}
