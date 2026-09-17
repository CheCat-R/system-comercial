<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Inventario\ConteosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ConteosController extends Controller
{
    public function __construct(private readonly ConteosService $svc) {}

    /** La llave del que revisa: ver diferencias, marcar recontar y APLICAR. */
    private function puedeAplicar(Sesion $s): bool
    {
        return $s->puede('conteos_aplicar');
    }

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        $pedida = (int) $request->query('sucursalId', 0) ?: null;

        return response()->json($this->svc->listar($sesion->soloSuSucursal() ?? $pedida));
    }

    public function show(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->get($id, $this->puedeAplicar($sesion), $sesion->soloSuSucursal()));
    }

    public function store(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'nombre' => ['nullable', 'string', 'max:120'], 'ciego' => ['nullable', 'boolean'], 'sucursalId' => ['nullable', 'integer'],
            'marcaId' => ['nullable', 'integer'], 'categoriaId' => ['nullable', 'integer'], 'proveedorId' => ['nullable', 'integer'],
            'tipo' => ['nullable', Rule::in(['entero', 'granel'])], 'soloConStock' => ['nullable', 'boolean'], 'incluirArchivados' => ['nullable', 'boolean'],
        ]);

        return response()->json($this->svc->crear([
            ...$d,
            'sucursalId' => $sesion->sucursalDeOperacion((int) ($d['sucursalId'] ?? 0) ?: null),
            // Sólo quien puede aplicar elige contar "a la vista"; el resto cuenta a ciegas.
            'ciego' => $this->puedeAplicar($sesion) ? ($d['ciego'] ?? true) : true,
            'usuarioId' => $sesion->usuarioId,
        ]), 201);
    }

    public function contar(Request $request, int $id, int $itemId, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['contado' => ['nullable', 'numeric', 'min:0', 'max:100000']]);

        return response()->json($this->svc->contarItem($id, $itemId, ['contado' => $d['contado'] ?? null, 'usuarioId' => $sesion->usuarioId], $sesion->soloSuSucursal()));
    }

    public function cerrar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->cerrar($id, $sesion->soloSuSucursal()));
    }

    public function reabrir(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->reabrir($id, $sesion->soloSuSucursal()));
    }

    public function recontar(Request $request, int $id, int $itemId, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['recontar' => ['required', 'boolean']]);

        return response()->json($this->svc->marcarRecontar($id, $itemId, (bool) $d['recontar'], $sesion->soloSuSucursal()));
    }

    public function aplicar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->aplicar($id, $sesion->usuarioId, $sesion->soloSuSucursal()));
    }

    public function destroy(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->descartar($id, $this->puedeAplicar($sesion), $sesion->soloSuSucursal()));
    }
}
