<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ventas\GuardarPresupuestoRequest;
use App\Ventas\PresupuestosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** El jefe atraviesa sucursales; el vendedor no sale de la suya, ni para tocar ni para ver. */
class PresupuestosController extends Controller
{
    public function __construct(private readonly PresupuestosService $svc) {}

    private function opciones(Sesion $s): array
    {
        return ['soloSuSucursal' => $s->soloSuSucursal()];
    }

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->listar([
            'estado' => $request->query('estado'), 'origen' => $request->query('origen'), 'limit' => $request->query('limit'),
            'sucursalId' => $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId,
        ]));
    }

    public function ordenesPendientes(): JsonResponse
    {
        return response()->json($this->svc->ordenesPendientes());
    }

    public function show(int $id, Sesion $sesion): JsonResponse
    {
        $p = $this->svc->get($id);
        if ($sesion->soloSuSucursal() !== null && (int) $p['sucursalId'] !== $sesion->soloSuSucursal()) {
            throw new \Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException('Ese presupuesto es de otra sucursal.');
        }

        return response()->json($p);
    }

    public function store(GuardarPresupuestoRequest $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validated();
        $sucursalId = $sesion->sucursalDeOperacion((int) ($d['sucursalId'] ?? 0) ?: null);

        return response()->json($this->svc->crear($d, $sucursalId, $sesion->usuarioId), 201);
    }

    public function update(GuardarPresupuestoRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->actualizar($id, $request->validated(), $this->opciones($sesion)));
    }

    public function enviar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->enviar($id, $this->opciones($sesion)));
    }

    public function reabrir(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->reabrir($id, $this->opciones($sesion)));
    }

    public function confirmar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->confirmar($id, $sesion->usuarioId, $this->opciones($sesion)));
    }

    public function armar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['items' => ['nullable', 'array'], 'items.*.itemId' => ['required', 'integer'], 'items.*.cantidadArmada' => ['nullable', 'numeric', 'min:0'], 'items.*.motivo' => ['nullable', 'string', 'max:200']]);

        return response()->json($this->svc->armar($id, $d['items'] ?? [], $this->opciones($sesion)));
    }

    public function delegar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['vendedorId' => ['nullable', 'integer']]);

        return response()->json($this->svc->delegar($id, $d['vendedorId'] ?? null, $this->opciones($sesion)));
    }

    public function aceptar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['clienteId' => ['nullable', 'integer'], 'crearCliente' => ['nullable', 'boolean']]);

        return response()->json($this->svc->aceptar($id, $d, $sesion->usuarioId, $this->opciones($sesion)));
    }

    public function cancelar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->cancelar($id, $sesion->usuarioId, $d['motivo'] ?? null, $this->opciones($sesion)));
    }
}
