<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Services\HistorialPreciosService;
use App\Services\PreciosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PreciosController extends Controller
{
    public function __construct(private readonly PreciosService $svc, private readonly HistorialPreciosService $evolucion) {}

    public function ultimoCambio(): JsonResponse
    {
        return response()->json($this->evolucion->ultimoCambio());
    }

    public function evolucion(Request $request): JsonResponse
    {
        return response()->json($this->evolucion->evolucion(['productoId' => $request->query('productoId'), 'desde' => $request->query('desde'), 'limit' => $request->query('limit')]));
    }

    public function historial(Request $request): JsonResponse
    {
        return response()->json($this->svc->historial(['productoId' => $request->query('productoId'), 'proveedorId' => $request->query('proveedorId'), 'lote' => $request->query('lote'), 'limit' => $request->query('limit')]));
    }

    public function costos(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'cambios' => ['required', 'array', 'min:1'], 'cambios.*.id' => ['required', 'integer'],
            'cambios.*.costo' => ['nullable', 'numeric'], 'cambios.*.descuento' => ['nullable', 'numeric'], 'cambios.*.flete' => ['nullable', 'numeric'],
            'origen' => ['nullable', Rule::in(['manual', 'masiva', 'recepcion'])], 'motivo' => ['nullable', 'string', 'max:300'],
        ]);

        return response()->json($this->svc->actualizarCostos([...$d, 'usuarioId' => $sesion->usuarioId]));
    }

    public function margenes(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['cambios' => ['required', 'array', 'min:1'], 'cambios.*.id' => ['required', 'integer'], 'cambios.*.valor' => ['required', 'numeric'], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->actualizarMargenes([...$d, 'usuarioId' => $sesion->usuarioId]));
    }

    public function activarProveedor(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['productoIds' => ['required', 'array', 'min:1'], 'productoIds.*' => ['integer'], 'proveedorId' => ['required', 'integer'], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->activarProveedor([...$d, 'usuarioId' => $sesion->usuarioId]));
    }

    public function revertir(string $lote, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->revertirLote($lote, $sesion->usuarioId));
    }
}
