<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditoriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AuditoriaController extends Controller
{
    public function __construct(private readonly AuditoriaService $svc) {}

    /** El rastro de una entidad: `?entidad=proveedor&entidadId=12`. */
    public function index(Request $request): JsonResponse
    {
        $entidad = (string) $request->query('entidad', '');
        $id = (int) $request->query('entidadId', 0);
        if ($entidad === '' || strlen($entidad) > 60) {
            throw ValidationException::withMessages(['entidad' => 'Falta la entidad.']);
        }
        if ($id <= 0) {
            throw ValidationException::withMessages(['entidadId' => 'Falta entidadId.']);
        }

        return response()->json($this->svc->listar($entidad, $id, $request->integer('limit') ?: null));
    }
}
