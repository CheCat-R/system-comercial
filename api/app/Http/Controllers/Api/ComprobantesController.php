<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Compras\ComprobantesService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Compras\FacturarRemitoRequest;
use App\Http\Requests\Compras\GuardarComprobanteRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Todo el controller pide `compras.facturacion` (en rutas). Recibir mercadería
 * y tocar precios son DOS permisos: el alta llama por adentro al servicio de
 * precios, así que se pregunta por `precios` acá y se rechaza si falta.
 */
class ComprobantesController extends Controller
{
    public function __construct(private readonly ComprobantesService $svc) {}

    private function opciones(Sesion $s): array
    {
        return ['puedeTocarPrecios' => $s->puede('precios'), 'puedeLiquidaciones' => $s->puede('liquidaciones'), 'sucursalSesion' => $s->sucursalId,
            'cruzaSucursales' => $s->esJefe(), 'soloSuSucursal' => $s->soloSuSucursal(), 'usuarioId' => $s->usuarioId];
    }

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->listar([
            'proveedorId' => $request->query('proveedorId'), 'tipo' => $request->query('tipo'), 'estado' => $request->query('estado'),
            'sucursalId' => $request->query('sucursalId'), 'desde' => $request->query('desde'), 'hasta' => $request->query('hasta'), 'limit' => $request->query('limit'),
            'verLiquidaciones' => $sesion->puede('liquidaciones'),
        ]));
    }

    public function saldos(): JsonResponse
    {
        return response()->json($this->svc->saldos());
    }

    public function cuenta(int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->cuenta($proveedorId));
    }

    public function referenciables(int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->referenciables($proveedorId));
    }

    public function remitosPendientes(Request $request): JsonResponse
    {
        return response()->json($this->svc->remitosPendientes((int) $request->query('proveedorId') ?: null));
    }

    public function show(int $id, Sesion $sesion): JsonResponse
    {
        $c = $this->svc->get($id);
        if ($c['tipo'] === 'liquidacion' && ! $sesion->puede('liquidaciones')) {
            abort(403, 'Ver liquidaciones pide su propio permiso.');
        }

        return response()->json($c);
    }

    public function store(GuardarComprobanteRequest $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->crear($request->validated(), $this->opciones($sesion)), 201);
    }

    public function facturar(FacturarRemitoRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->facturar($id, $request->validated(), $this->opciones($sesion)));
    }

    public function confirmar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->confirmar($id, $sesion->usuarioId));
    }

    public function anular(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['motivo' => ['required', 'string', 'max:300']]);

        return response()->json($this->svc->anular($id, $d['motivo'], $sesion->usuarioId, $sesion->soloSuSucursal()));
    }

    public function destroy(int $id): JsonResponse
    {
        $this->svc->descartar($id);

        return response()->json(['ok' => true]);
    }
}
