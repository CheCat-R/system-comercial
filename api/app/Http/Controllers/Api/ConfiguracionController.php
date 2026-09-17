<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Services\ConfiguracionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class ConfiguracionController extends Controller
{
    /** Quién puede ESCRIBIR cada área. Leer puede cualquiera con sesión (las pantallas lo necesitan). */
    private const DUENO_DE_AREA = [
        'ventas' => ['ventas.configuracion'],
        'empresa' => ['sistema.empresa'],
        'impresion' => ['sistema.impresion'],
        'web' => ['web.configuracion'],
    ];

    public function __construct(private readonly ConfiguracionService $svc) {}

    public function show(string $clave): JsonResponse
    {
        return response()->json($this->svc->get($clave));
    }

    public function update(Request $request, string $clave, Sesion $sesion): JsonResponse
    {
        $llaves = self::DUENO_DE_AREA[$clave] ?? ['gerencia.configuracion'];
        if (! $sesion->puede(...$llaves)) {
            throw new AccessDeniedHttpException('Tu rol no puede cambiar la configuración de '.$clave.'.');
        }

        return response()->json($this->svc->set($clave, $request->all()));
    }
}
