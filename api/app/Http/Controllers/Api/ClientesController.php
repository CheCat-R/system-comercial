<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Clientes\GuardarClienteRequest;
use App\Services\ClientesService;
use App\Ventas\VentasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Las ESCRITURAS piden `ventas.clientes` (en rutas); las lecturas quedan
 * abiertas a sesión válida porque el padrón lo consumen el POS y los
 * presupuestos. Otorgar crédito pide la llave `cta_cte`, a nivel campo.
 */
class ClientesController extends Controller
{
    public function __construct(private readonly ClientesService $svc) {}

    private function conLlaveCredito(Sesion $s): bool
    {
        return $s->puede('cta_cte');
    }

    public function index(Request $request): JsonResponse
    {
        $activo = $request->query('activo');

        return response()->json($this->svc->listar($activo === null ? null : $activo === 'true'));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->svc->publico($this->svc->get($id)));
    }

    /** La cuenta corriente: saldo, comprobantes con saldo, límite. */
    public function cuenta(int $id, VentasService $ventas): JsonResponse
    {
        return response()->json($ventas->cuenta($id));
    }

    public function store(GuardarClienteRequest $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->publico($this->svc->crear($request->validated(), $this->conLlaveCredito($sesion))), 201);
    }

    public function update(GuardarClienteRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->publico($this->svc->editar($id, $request->validated(), $this->conLlaveCredito($sesion))));
    }

    public function reactivar(int $id): JsonResponse
    {
        return response()->json($this->svc->publico($this->svc->reactivar($id)));
    }

    public function credito(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['ctaCteHabilitada' => ['required', 'boolean'], 'limiteCredito' => ['nullable', 'numeric', 'min:0'], 'diasPlazo' => ['nullable', 'integer', 'min:0']]);

        return response()->json($this->svc->publico($this->svc->setCredito($id, $d)));
    }

    public function destroy(int $id): JsonResponse
    {
        return response()->json($this->svc->borrar($id));
    }
}
