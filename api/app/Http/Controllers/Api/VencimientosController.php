<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Inventario\VencimientosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * El vigía de fechas es la pantalla `almacen.vencimientos`. PROCESAR es otra
 * cosa: da de baja el stock de verdad y asienta la pérdida contable, así que
 * pide `inventario` — la misma llave que el movimiento manual, porque es
 * exactamente la misma consecuencia (ver rutas).
 */
class VencimientosController extends Controller
{
    public function __construct(private readonly VencimientosService $svc) {}

    public function index(): JsonResponse
    {
        return response()->json($this->svc->listar());
    }

    public function resumen(): JsonResponse
    {
        return response()->json($this->svc->resumen());
    }

    public function reportes(Request $request): JsonResponse
    {
        return response()->json($this->svc->reportes((string) ($request->query('periodo') ?: 'mes')));
    }

    public function ofertas(): JsonResponse
    {
        return response()->json($this->svc->ofertasEnJuego());
    }

    public function crearSesion(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'sucursalId' => ['required', 'integer'],
            'items' => ['required', 'array', 'min:1', 'max:300'],
            'items.*.productoId' => ['required', 'integer'],
            'items.*.presentacionId' => ['nullable', 'integer'],
            'items.*.cantidad' => ['required', 'numeric'],
            'items.*.fechaVencimiento' => ['required', 'string', 'regex:/^\d{4}-\d{2}-\d{2}$/'],
            'items.*.observaciones' => ['nullable', 'string', 'max:300'],
        ]);
        // El control se carga en la sucursal donde se está mirando la góndola.
        $d['sucursalId'] = $sesion->sucursalDeOperacion((int) $d['sucursalId']);
        $d['usuarioId'] = $sesion->usuarioId;

        return response()->json($this->svc->crearSesion($d), 201);
    }

    public function borradorOferta(int $id): JsonResponse
    {
        return response()->json($this->svc->borradorOferta($id));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'cantidad' => ['nullable', 'numeric'],
            'fechaVencimiento' => ['nullable', 'string', 'regex:/^\d{4}-\d{2}-\d{2}$/'],
            'observaciones' => ['nullable', 'string', 'max:300'],
        ]);

        return response()->json($this->svc->editar($id, $d));
    }

    public function destroy(int $id): JsonResponse
    {
        return response()->json($this->svc->eliminar($id));
    }

    public function procesar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'unidadesVendidas' => ['required', 'numeric', 'min:0'],
            'generarMerma' => ['nullable', 'boolean'],
        ]);

        return response()->json($this->svc->procesar($id, $d, $sesion));
    }

    public function vincularOferta(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['ofertaId' => ['required', 'integer']]);

        return response()->json($this->svc->vincularOferta($id, (int) $d['ofertaId']));
    }
}
