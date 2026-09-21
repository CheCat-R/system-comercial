<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Compras\PagosProveedorService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Compras\GuardarPagoRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Plata que sale: tres permisos porque son tres caminos legítimos (rutas):
 * `compras.pagos` (administración), `gastos.pagos_proveedor` (el mismo padrón
 * del lado de Gastos) y `ventas.caja` (la cajera le paga al proveedor cuando
 * llega el camión). De qué cajón sale lo cierra el candado del servicio.
 */
class PagosProveedorController extends Controller
{
    public function __construct(private readonly PagosProveedorService $svc) {}

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        $q = $request->only(['proveedorId', 'sucursalId', 'cajaSesionId', 'destino', 'estado', 'desde', 'hasta', 'sinAplicar', 'esFlete', 'limit']);
        // La cajera ve los pagos de SU sucursal (y los sin sucursal, que son de administración, no).
        if (! $sesion->esJefe()) {
            $q['sucursalId'] = $sesion->sucursalId;
        }

        return response()->json($this->svc->listar($q));
    }

    public function sinAplicar(Request $request): JsonResponse
    {
        return response()->json($this->svc->resumenSinAplicar($request->query('destino')));
    }

    public function disponibles(Request $request, int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->disponibles($proveedorId, $request->query('destino')));
    }

    public function pendientes(Request $request, int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->documentosPendientes($proveedorId, $request->query('destino')));
    }

    public function cuenta(int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->cuenta($proveedorId));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->svc->get($id));
    }

    public function store(GuardarPagoRequest $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validated();
        $d['usuarioId'] = $sesion->usuarioId;
        // La sucursal del pago: el jefe elige; el resto graba en la suya.
        if (! $sesion->esJefe()) {
            $d['sucursalId'] = $sesion->sucursalId;
        }

        return response()->json($this->svc->crear($d, $sesion->sucursalId, $sesion->esJefe()), 201);
    }

    public function imputar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'imputaciones' => ['required', 'array', 'min:1', 'max:50'], 'imputaciones.*.gastoId' => ['nullable', 'integer'],
            'imputaciones.*.comprobanteId' => ['nullable', 'integer'], 'imputaciones.*.importe' => ['required', 'numeric', 'min:0.01'],
        ]);

        return response()->json($this->svc->imputar($id, $d['imputaciones'], $sesion->usuarioId, $sesion->esJefe()));
    }

    public function desimputar(int $id): JsonResponse
    {
        return response()->json($this->svc->desimputar($id));
    }

    public function descontarFletes(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'proveedorId' => ['required', 'integer'], 'fletes' => ['required', 'array', 'min:1', 'max:50'], 'fletes.*.pagoId' => ['required', 'integer'],
            'fletes.*.gastoId' => ['nullable', 'integer'], 'fletes.*.comprobanteId' => ['nullable', 'integer'], 'fletes.*.importe' => ['required', 'numeric', 'min:0.01'],
        ]);

        return response()->json($this->svc->descontarFletes((int) $d['proveedorId'], $d['fletes'], $sesion->usuarioId, $sesion->esJefe()));
    }

    public function anular(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->anular($id, $d['motivo'] ?? null));
    }

    public function destino(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['destino' => ['required', Rule::in(['mercaderia', 'gastos'])]]);

        return response()->json($this->svc->cambiarDestino($id, $d['destino']));
    }

    public function papel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['referencia' => ['nullable', 'string', 'max:200'], 'concepto' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->actualizarPapel($id, $d));
    }
}
