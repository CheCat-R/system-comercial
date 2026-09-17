<?php

namespace App\Http\Controllers\Api;

use App\Auth\Permisos;
use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Usuarios\GuardarRolRequest;
use App\Http\Resources\RolResource;
use App\Models\Rol;
use App\Services\UsuariosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Quién puede tocar roles: `gerencia.usuarios` (en las rutas). Repartir
 * permisos es la operación que permite darse a uno mismo cualquier otro
 * permiso, así que es la que más cerrada tiene que estar.
 */
class RolesController extends Controller
{
    public function __construct(private readonly UsuariosService $svc) {}

    public function index(): AnonymousResourceCollection
    {
        return RolResource::collection($this->svc->listarRoles());
    }

    /** El catálogo con el que el panel arma el editor de roles. */
    public function permisos(): JsonResponse
    {
        return response()->json(Permisos::CATALOGO);
    }

    public function store(GuardarRolRequest $request, Sesion $sesion): JsonResponse
    {
        $rol = $this->svc->crearRol($request->validated(), $sesion);

        return response()->json(['ok' => true, 'id' => $rol->id, 'rol' => new RolResource($rol)], 201);
    }

    public function update(GuardarRolRequest $request, Rol $rol, Sesion $sesion): JsonResponse
    {
        $rol = $this->svc->editarRol($rol, $request->validated(), $sesion);

        return response()->json(['ok' => true, 'rol' => new RolResource($rol)]);
    }

    public function destroy(Rol $rol): JsonResponse
    {
        $this->svc->borrarRol($rol);

        return response()->json(['ok' => true]);
    }
}
