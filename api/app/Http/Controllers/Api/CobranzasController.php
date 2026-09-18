<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ventas\GuardarCobranzaRequest;
use App\Ventas\CobranzasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CobranzasController extends Controller
{
    public function __construct(private readonly CobranzasService $svc) {}

    private function opciones(Sesion $s): array
    {
        return ['esJefe' => $s->esJefe(), 'soloSuSucursal' => $s->soloSuSucursal(), 'usuarioId' => $s->usuarioId];
    }

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->listar([
            'clienteId' => $request->query('clienteId'), 'estado' => $request->query('estado'), 'limit' => $request->query('limit'),
            'sucursalId' => $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId,
        ]));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->svc->get($id));
    }

    public function store(GuardarCobranzaRequest $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validated();
        $sucursalId = $sesion->sucursalDeOperacion((int) ($d['sucursalId'] ?? 0) ?: null);

        return response()->json($this->svc->crear($d, $sucursalId, $this->opciones($sesion)), 201);
    }

    public function anular(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['motivo' => ['required', 'string', 'max:300']]);

        return response()->json($this->svc->anular($id, $d['motivo'], $this->opciones($sesion)));
    }
}
