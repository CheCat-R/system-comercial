<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ventas\GuardarDescuentoRequest;
use App\Http\Requests\Ventas\GuardarOfertaRequest;
use App\Services\DescuentosService;
use App\Services\OfertasService;
use Illuminate\Http\JsonResponse;

/** Ofertas y descuentos con nombre. La lectura queda abierta a sesión válida (el POS la consume). */
class OfertasController extends Controller
{
    public function __construct(private readonly OfertasService $ofertas, private readonly DescuentosService $descuentos) {}

    public function index(): JsonResponse
    {
        return response()->json($this->ofertas->listar());
    }

    public function store(GuardarOfertaRequest $request): JsonResponse
    {
        return response()->json($this->ofertas->crear($request->validated()), 201);
    }

    public function update(GuardarOfertaRequest $request, int $id): JsonResponse
    {
        return response()->json($this->ofertas->editar($id, $request->validated()));
    }

    public function destroy(int $id): JsonResponse
    {
        return response()->json($this->ofertas->borrar($id));
    }

    public function descuentos(): JsonResponse
    {
        return response()->json($this->descuentos->listar());
    }

    public function crearDescuento(GuardarDescuentoRequest $request): JsonResponse
    {
        return response()->json($this->descuentos->crear($request->validated()), 201);
    }

    public function editarDescuento(GuardarDescuentoRequest $request, int $id): JsonResponse
    {
        return response()->json($this->descuentos->editar($id, $request->validated()));
    }

    public function borrarDescuento(int $id): JsonResponse
    {
        return response()->json($this->descuentos->borrar($id));
    }
}
