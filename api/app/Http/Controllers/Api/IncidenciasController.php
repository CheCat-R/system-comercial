<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Inventario\IncidenciasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class IncidenciasController extends Controller
{
    public function __construct(private readonly IncidenciasService $svc) {}

    public function index(Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->listar($sesion->soloSuSucursal()));
    }

    public function store(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'productoId' => ['required', 'integer'], 'sucursalId' => ['nullable', 'integer'], 'presId' => ['nullable', 'integer'],
            'tipo' => ['required', 'string', 'max:40'], 'cantidad' => ['required', 'numeric', 'min:0.001', 'max:100000'],
            'responsableId' => ['nullable', 'integer'], 'motivo' => ['nullable', 'string', 'max:500'],
        ]);
        $d['sucursalId'] = $sesion->sucursalDeOperacion((int) ($d['sucursalId'] ?? 0) ?: null);

        return response()->json($this->svc->crear($d, $sesion->usuarioId), 201);
    }

    public function avanzar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->avanzar($id, $sesion->soloSuSucursal()));
    }

    public function resolver(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['resolucion' => ['required', Rule::in(IncidenciasService::RESOLUCIONES)]]);

        return response()->json($this->svc->resolver($id, $d['resolucion'], $sesion->usuarioId, $sesion->soloSuSucursal()));
    }
}
