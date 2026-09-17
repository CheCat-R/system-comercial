<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Proveedores\GuardarProveedorRequest;
use App\Models\Proveedor;
use App\Services\ProveedoresService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProveedoresController extends Controller
{
    public function __construct(private readonly ProveedoresService $svc) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->svc->listar($request->query('tipo')));
    }

    public function show(Proveedor $proveedor): JsonResponse
    {
        return response()->json($this->svc->publica($proveedor));
    }

    public function store(GuardarProveedorRequest $request): JsonResponse
    {
        return response()->json($this->svc->publica($this->svc->crear($request->validated())), 201);
    }

    public function update(GuardarProveedorRequest $request, Proveedor $proveedor, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->publica($this->svc->editar($proveedor, $request->validated(), $sesion->usuarioId)));
    }

    public function destroy(Proveedor $proveedor): JsonResponse
    {
        $this->svc->borrar($proveedor);

        return response()->json(['ok' => true]);
    }
}
