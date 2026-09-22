<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Services\RespaldosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class RespaldosController extends Controller
{
    public function __construct(private readonly RespaldosService $svc) {}

    public function info(): JsonResponse
    {
        return response()->json($this->svc->info());
    }

    public function descargar(Sesion $sesion): StreamedResponse
    {
        $sello = now()->format('Y-m-d-Hi');

        return response()->streamDownload(
            $this->svc->volcar($sesion->usuarioId),
            "respaldo-checat-{$sello}.sql",
            ['Content-Type' => 'application/sql; charset=utf-8'],
        );
    }

    /** La limpieza de fin de práctica es DEL SUPERADMIN y de nadie más: no es un permiso delegable — borra la operatoria entera. */
    private function soloSuperadmin(Sesion $sesion): void
    {
        if (! $sesion->esSuperadmin()) {
            throw new AccessDeniedHttpException('La limpieza del sistema es exclusiva del superadmin.');
        }
    }

    public function ensayoLimpieza(Sesion $sesion): JsonResponse
    {
        $this->soloSuperadmin($sesion);

        return response()->json($this->svc->ensayoLimpieza());
    }

    public function limpiar(Request $request, Sesion $sesion): JsonResponse
    {
        $this->soloSuperadmin($sesion);
        // La palabra tipeada es el segundo seguro: un clic solo, aunque pase por dos modales, sigue siendo un clic.
        if ((string) $request->input('confirmar', '') !== 'LIMPIAR') {
            throw ValidationException::withMessages(['confirmar' => 'Para confirmar, escribí LIMPIAR tal cual.']);
        }

        return response()->json($this->svc->limpiarPractica($sesion->usuarioId));
    }
}
