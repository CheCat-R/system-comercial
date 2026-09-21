<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Compras\PedidosProveedorService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PedidosProveedorController extends Controller
{
    public function __construct(private readonly PedidosProveedorService $svc) {}

    public function kanban(): JsonResponse
    {
        return response()->json($this->svc->kanban());
    }

    public function stats(): JsonResponse
    {
        return response()->json($this->svc->stats());
    }

    public function recibidos(Request $request): JsonResponse
    {
        return response()->json($this->svc->recibidos($request->only(['filtro', 'proveedorId', 'buscar', 'page', 'limit'])));
    }

    public function alta(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['proveedorIds' => ['required', 'array', 'min:1', 'max:100'], 'proveedorIds.*' => ['integer'], 'notas' => ['nullable', 'string', 'max:2000']]);

        return response()->json($this->svc->alta($d['proveedorIds'], $d['notas'] ?? '', $sesion->usuarioId), 201);
    }

    public function directo(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['proveedorId' => ['required', 'integer'], 'notas' => ['nullable', 'string', 'max:2000']]);

        return response()->json($this->svc->directo((int) $d['proveedorId'], $d['notas'] ?? '', $sesion->usuarioId), 201);
    }

    public function editar(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['proveedorId' => ['nullable', 'integer'], 'notas' => ['nullable', 'string', 'max:2000']]);

        return response()->json($this->svc->editar($id, $d));
    }

    public function estado(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['estado' => ['required', Rule::in(PedidosProveedorService::ESTADOS)]]);

        return response()->json($this->svc->cambiarEstado($id, $d['estado']));
    }

    public function enviado(int $id): JsonResponse
    {
        return response()->json($this->svc->toggleEnviado($id));
    }

    public function revisado(Request $request, int $id): JsonResponse
    {
        return response()->json($this->svc->marcarRevisado($id, (bool) $request->input('deshacer', false)));
    }

    public function borrar(int $id): JsonResponse
    {
        $this->svc->borrar($id);

        return response()->json(['ok' => true]);
    }
}
