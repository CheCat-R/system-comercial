<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Licencias\LicenciaInvalida;
use App\Services\LicenciaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Sistema › Licencia: ver el estado y cargar la clave de activación.
 *
 * Todo lo que escribe pasa por una clave FIRMADA por CCS: esta ruta no acepta
 * "ponete el plan X" ni "vencé el día Y", solo una clave que se pueda verificar.
 * Por eso puede existir sin que el cliente pueda subirse de plan.
 */
class LicenciaController extends Controller
{
    public function __construct(private readonly LicenciaService $svc) {}

    public function show(): JsonResponse
    {
        return response()->json([...$this->svc->estado(), 'contacto' => config('licencia.contacto') ?: null, 'instalacionId' => $this->svc->instalacionId()]);
    }

    public function activar(Request $request): JsonResponse
    {
        $d = $request->validate(['clave' => ['required', 'string', 'max:3000']], [
            'clave.required' => 'Pegá la clave de activación.',
        ]);

        try {
            $estado = $this->svc->activar($d['clave']);
        } catch (LicenciaInvalida $e) {
            throw ValidationException::withMessages(['clave' => $e->getMessage()]);
        }

        return response()->json([...$estado, 'contacto' => config('licencia.contacto') ?: null, 'instalacionId' => $this->svc->instalacionId()]);
    }
}
