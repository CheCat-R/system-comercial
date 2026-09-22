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

    public function percepciones(Proveedor $proveedor): JsonResponse
    {
        return response()->json($this->svc->percepciones($proveedor->id));
    }

    public function setPercepciones(Request $request, Proveedor $proveedor, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['percepciones' => ['present', 'array', 'max:20'], 'percepciones.*.nombre' => ['required', 'string', 'max:120'],
            'percepciones.*.alicuota' => ['nullable', 'numeric'], 'percepciones.*.base' => ['nullable', 'in:neto,total'], 'percepciones.*.activa' => ['nullable', 'boolean']]);

        return response()->json($this->svc->setPercepciones($proveedor, $d['percepciones'], $sesion->usuarioId));
    }

    public function cuentas(Proveedor $proveedor): JsonResponse
    {
        return response()->json($this->svc->cuentas($proveedor->id));
    }

    public function setCuentas(Request $request, Proveedor $proveedor): JsonResponse
    {
        $d = $request->validate(['cuentas' => ['present', 'array', 'max:10'], 'cuentas.*.cbuAlias' => ['required', 'string', 'max:120'], 'cuentas.*.descripcion' => ['nullable', 'string', 'max:120']]);

        return response()->json($this->svc->setCuentas($proveedor, $d['cuentas']));
    }

    public function importar(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['filas' => ['required', 'array', 'max:500']]);

        return response()->json($this->svc->importar($d['filas'], $sesion->usuarioId));
    }

    public function migracion(Request $request, Proveedor $proveedor): JsonResponse
    {
        $d = $request->validate(['lista' => ['nullable', 'boolean']]);

        return response()->json($this->svc->publica($this->svc->setMigracionLista($proveedor, (bool) ($d['lista'] ?? true))));
    }
}
