<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Inventario\TransferenciasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TransferenciasController extends Controller
{
    private const MAX_CANT = 100000;

    public function __construct(private readonly TransferenciasService $svc) {}

    public function index(Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->listar($sesion->soloSuSucursal()));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->svc->get($id));
    }

    public function borrador(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['origenId' => ['required', 'integer'], 'destinoId' => ['nullable', 'integer']]);

        return response()->json($this->svc->borrador([
            'origenId' => $d['origenId'], 'destinoId' => $sesion->sucursalDeOperacion((int) ($d['destinoId'] ?? 0) ?: null), 'usuarioId' => $sesion->usuarioId,
        ]));
    }

    public function guardarBorrador(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'items' => ['nullable', 'array', 'max:300'], 'items.*.productoId' => ['required', 'integer'], 'items.*.presId' => ['nullable', 'integer'],
            'items.*.cantidad' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_CANT], 'observaciones' => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json($this->svc->guardarBorrador($id, [...$d, 'usuarioId' => $sesion->usuarioId], $sesion->soloSuSucursal()));
    }

    public function enviarBorrador(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->enviarBorrador($id, ['usuarioId' => $sesion->usuarioId], $sesion->soloSuSucursal()));
    }

    public function descartarBorrador(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->descartarBorrador($id, $sesion->soloSuSucursal()));
    }

    public function store(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'origenId' => ['required', 'integer'], 'destinoId' => ['required', 'integer'], 'observaciones' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'max:300'], 'items.*.productoId' => ['required', 'integer'], 'items.*.presId' => ['nullable', 'integer'],
            'items.*.cantidad' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_CANT],
        ]);

        return response()->json($this->svc->crear([...$d, 'usuarioId' => $sesion->usuarioId]), 201);
    }

    public function avanzar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['desde' => ['nullable', 'string', 'max:20']]);

        return response()->json($this->svc->avanzar($id, $sesion->usuarioId, $d['desde'] ?? null, $sesion->soloSuSucursal()));
    }

    public function editarItem(Request $request, int $id, int $itemId, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['cantidadPreparada' => ['nullable', 'numeric', 'min:0', 'max:'.self::MAX_CANT], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->editarItem($id, $itemId, $d, $sesion->soloSuSucursal()));
    }

    public function agregarItem(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['productoId' => ['required', 'integer'], 'presId' => ['nullable', 'integer'], 'cantidad' => ['required', 'numeric', 'min:0.001', 'max:'.self::MAX_CANT], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->agregarItem($id, $d, $sesion->soloSuSucursal()));
    }

    public function quitarItem(int $id, int $itemId, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->quitarItem($id, $itemId, $sesion->soloSuSucursal()));
    }

    public function confirmarLista(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['tipo' => ['required', Rule::in(['enteros', 'granel'])], 'listo' => ['required', 'boolean']]);

        return response()->json($this->svc->confirmarLista($id, [...$d, 'usuarioId' => $sesion->usuarioId], $sesion->soloSuSucursal()));
    }

    public function recibir(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'items' => ['nullable', 'array', 'max:300'], 'items.*.itemId' => ['required', 'integer'],
            'items.*.cantidadRecibida' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_CANT], 'observaciones' => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json($this->svc->recibir($id, [...$d, 'usuarioId' => $sesion->usuarioId], $sesion->soloSuSucursal()));
    }

    public function cancelar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->cancelar($id, $sesion->usuarioId, $sesion->soloSuSucursal()));
    }
}
