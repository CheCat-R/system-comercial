<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Usuarios\GuardarUsuarioRequest;
use App\Http\Resources\UsuarioResource;
use App\Models\Usuario;
use App\Services\UsuariosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class UsuariosController extends Controller
{
    public function __construct(private readonly UsuariosService $svc) {}

    public function index(): AnonymousResourceCollection
    {
        return UsuarioResource::collection($this->svc->listarUsuarios());
    }

    public function store(GuardarUsuarioRequest $request, Sesion $sesion): JsonResponse
    {
        $usuario = $this->svc->crearUsuario($request->validated(), $sesion);

        return response()->json(['ok' => true, 'id' => $usuario->id, 'usuario' => new UsuarioResource($usuario->load('rol'))], 201);
    }

    public function update(GuardarUsuarioRequest $request, Usuario $usuario, Sesion $sesion): JsonResponse
    {
        $usuario = $this->svc->editarUsuario($usuario, $request->validated(), $sesion);

        return response()->json(['ok' => true, 'usuario' => new UsuarioResource($usuario)]);
    }
}
