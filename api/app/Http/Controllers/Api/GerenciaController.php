<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Gerencia\AuditoriaFeedService;
use App\Gerencia\RentabilidadService;
use App\Gerencia\ReportesVentasService;
use App\Gerencia\ValorizacionService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Rentabilidad, Reportes de ventas, Valorización de stock y Auditoría: en vivo, sin cachear. */
class GerenciaController extends Controller
{
    public function __construct(
        private readonly RentabilidadService $svc,
        private readonly ReportesVentasService $reportes,
        private readonly ValorizacionService $valorizacion,
        private readonly AuditoriaFeedService $auditoria,
    ) {}

    public function rentabilidad(Request $request, Sesion $sesion): JsonResponse
    {
        $sucursalId = $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId;

        return response()->json($this->svc->rentabilidad([
            'desde' => $request->query('desde'),
            'hasta' => $request->query('hasta'),
            'sucursalId' => $sucursalId,
        ]));
    }

    public function reportesVentas(Request $request, Sesion $sesion): JsonResponse
    {
        $sucursalId = $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId;

        return response()->json($this->reportes->reportes([
            'desde' => $request->query('desde'),
            'hasta' => $request->query('hasta'),
            'sucursalId' => $sucursalId,
        ]));
    }

    public function valorizacion(Request $request, Sesion $sesion): JsonResponse
    {
        $sucursalId = $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId;

        return response()->json($this->valorizacion->valorizacion(['sucursalId' => $sucursalId]));
    }

    public function auditoria(Request $request): JsonResponse
    {
        return response()->json($this->auditoria->feed([
            'desde' => $request->query('desde'),
            'hasta' => $request->query('hasta'),
            'tipo' => $request->query('tipo'),
        ]));
    }
}
