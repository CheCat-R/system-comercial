<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Compras\GastosService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Compras\GuardarGastoRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class GastosController extends Controller
{
    public function __construct(private readonly GastosService $svc) {}

    public function bootstrap(Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->bootstrap($sesion));
    }

    public function pendientes(): JsonResponse
    {
        return response()->json($this->svc->pendientes());
    }

    public function cuentasAPagar(Request $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->cuentasAPagar(['sucursalId' => $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId, 'proveedorId' => $request->query('proveedorId')]));
    }

    public function resumen(Request $request): JsonResponse
    {
        return response()->json($this->svc->resumen($request->only(['desde', 'hasta', 'sucursalId'])));
    }

    /* Rubros */

    public function categorias(): JsonResponse
    {
        return response()->json($this->svc->listarCategorias());
    }

    public function crearCategoria(Request $request): JsonResponse
    {
        return response()->json($this->svc->crearCategoria($this->categoriaDatos($request)), 201);
    }

    public function editarCategoria(Request $request, int $id): JsonResponse
    {
        return response()->json($this->svc->editarCategoria($id, $this->categoriaDatos($request)));
    }

    public function borrarCategoria(int $id): JsonResponse
    {
        $this->svc->borrarCategoria($id);

        return response()->json(['ok' => true]);
    }

    private function categoriaDatos(Request $request): array
    {
        return $request->validate(['nombre' => ['nullable', 'string', 'max:120'], 'tipo' => ['nullable', Rule::in(['fijo', 'variable'])], 'descripcion' => ['nullable', 'string', 'max:300'],
            'activa' => ['nullable', 'boolean'], 'orden' => ['nullable', 'integer']]);
    }

    /* Gastos fijos */

    public function recurrentes(): JsonResponse
    {
        return response()->json($this->svc->listarRecurrentes());
    }

    private function recurrenteDatos(Request $request): array
    {
        return $request->validate(['nombre' => ['nullable', 'string', 'max:160'], 'categoriaId' => ['nullable', 'integer'], 'proveedorId' => ['nullable', 'integer'], 'sucursalId' => ['nullable', 'integer'],
            'importeEstimado' => ['nullable', 'numeric', 'min:0'], 'frecuencia' => ['nullable', Rule::in(['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'])],
            'diaVencimiento' => ['nullable', 'integer', 'min:1', 'max:31'], 'activo' => ['nullable', 'boolean'], 'observaciones' => ['nullable', 'string', 'max:2000']]);
    }

    public function crearRecurrente(Request $request): JsonResponse
    {
        return response()->json($this->svc->crearRecurrente($this->recurrenteDatos($request)), 201);
    }

    public function editarRecurrente(Request $request, int $id): JsonResponse
    {
        return response()->json($this->svc->editarRecurrente($id, $this->recurrenteDatos($request)));
    }

    public function borrarRecurrente(int $id): JsonResponse
    {
        $this->svc->borrarRecurrente($id);

        return response()->json(['ok' => true]);
    }

    public function previaPeriodo(string $periodo): JsonResponse
    {
        return response()->json($this->svc->previsualizarPeriodo($periodo));
    }

    public function generarPeriodo(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['periodo' => ['required', 'regex:/^\d{4}-\d{2}$/'], 'ids' => ['nullable', 'array'], 'ids.*' => ['integer']]);

        return response()->json($this->svc->generarPeriodo($d['periodo'], $sesion->usuarioId, $d['ids'] ?? []));
    }

    /* Adjuntos */

    public function adjunto(int $id): Response
    {
        $a = $this->svc->adjunto($id);

        return response($a['bytes'], 200, [
            'Content-Type' => $a['mime'], 'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline; filename="'.$a['nombre'].'"', 'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    public function subirAdjunto(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['nombre' => ['nullable', 'string', 'max:160'], 'data' => ['required', 'string']]);

        return response()->json($this->svc->subirAdjunto($id, $d['nombre'] ?? null, $d['data']), 201);
    }

    public function borrarAdjunto(int $id): JsonResponse
    {
        $this->svc->borrarAdjunto($id);

        return response()->json(['ok' => true]);
    }

    /* Gastos */

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        $q = $request->only(['desde', 'hasta', 'categoriaId', 'proveedorId', 'sucursalId', 'estado', 'q', 'limit']);
        if (! $sesion->esJefe()) {
            $q['sucursalId'] = $sesion->sucursalId;
        }

        return response()->json($this->svc->listar($q));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->svc->get($id));
    }

    public function store(GuardarGastoRequest $request, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->crear($request->validated(), $sesion), 201);
    }

    public function update(GuardarGastoRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->editar($id, $request->validated(), $sesion));
    }

    public function anular(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->anular($id, $d['motivo'] ?? null));
    }

    public function pagar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['importe' => ['required', 'numeric', 'min:0.01'], 'medio' => ['nullable', 'string', 'max:20'], 'fecha' => ['nullable', 'string', 'max:30'],
            'referencia' => ['nullable', 'string', 'max:200'], 'cajaSesionId' => ['nullable', 'integer'], 'operadorId' => ['nullable', 'integer'],
            'formas' => ['nullable', 'array', 'max:10'], 'formas.*.medio' => ['required', 'string'], 'formas.*.importe' => ['required', 'numeric', 'min:0.01'], 'formas.*.fecha' => ['nullable', 'string']]);

        return response()->json($this->svc->pagar($id, $d, $sesion));
    }

    public function aplicarPago(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['pagoId' => ['required', 'integer'], 'importe' => ['required', 'numeric', 'min:0.01']]);

        return response()->json($this->svc->aplicarPago($id, (int) $d['pagoId'], (float) $d['importe'], $sesion));
    }
}
