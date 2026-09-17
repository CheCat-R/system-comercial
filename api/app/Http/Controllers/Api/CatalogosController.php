<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ErrorDeNegocio;
use App\Http\Controllers\Controller;
use App\Services\CatalogosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogosController extends Controller
{
    public function __construct(private readonly CatalogosService $svc) {}

    private function tipo(string $tipo): string
    {
        if (! in_array($tipo, CatalogosService::TIPOS, true)) {
            throw new ErrorDeNegocio('Catálogo inexistente.');
        }

        return $tipo;
    }

    private function reglas(): array
    {
        return ['nombre' => ['required', 'string', 'max:120'], 'categoriaId' => ['nullable', 'integer'], 'color' => ['nullable', 'string', 'max:20'], 'activa' => ['nullable', 'boolean']];
    }

    public function index(): JsonResponse
    {
        return response()->json($this->svc->catalogo());
    }

    public function store(Request $request, string $tipo): JsonResponse
    {
        return response()->json($this->svc->crear($this->tipo($tipo), $request->validate($this->reglas())), 201);
    }

    public function update(Request $request, string $tipo, int $id): JsonResponse
    {
        return response()->json($this->svc->editar($this->tipo($tipo), $id, $request->validate($this->reglas())));
    }

    public function destroy(string $tipo, int $id): JsonResponse
    {
        return response()->json($this->svc->borrar($this->tipo($tipo), $id));
    }

    public function fusionar(Request $request, string $tipo, int $id): JsonResponse
    {
        $d = $request->validate(['haciaId' => ['required', 'integer']]);

        return response()->json($this->svc->fusionar($this->tipo($tipo), $id, (int) $d['haciaId']));
    }
}
