<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Services\UsuariosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Relevo de caja (0088): quién firma el ticket cuando no es la sesión
 * abierta. Ver `UsuariosService::verificarRelevo/volverDeRelevo`.
 */
class RelevosController extends Controller
{
    public function __construct(private readonly UsuariosService $svc) {}

    public function index(): JsonResponse
    {
        return response()->json($this->svc->listarRelevos());
    }

    public function verificar(Request $request, Sesion $sesion): JsonResponse
    {
        $datos = $request->validate([
            'relevoId' => ['required', 'integer'],
            'pin' => ['required', 'string'],
            'cajaSesionId' => ['nullable', 'integer'],
        ]);

        return response()->json($this->svc->verificarRelevo($datos, $sesion));
    }

    public function volver(Request $request, Sesion $sesion): JsonResponse
    {
        $datos = $request->validate([
            'cajaSesionId' => ['nullable', 'integer'],
            'operadorNombre' => ['nullable', 'string', 'max:120'],
        ]);

        return response()->json($this->svc->volverDeRelevo($datos, $sesion));
    }
}
