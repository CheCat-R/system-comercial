<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Gerencia\RentabilidadService;
use App\Gerencia\ReportesVentasService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Rentabilidad (`gerencia.rentabilidad`) y Reportes de ventas (`gerencia.reportes`): en vivo, sin cachear. */
class GerenciaController extends Controller
{
    public function __construct(private readonly RentabilidadService $svc, private readonly ReportesVentasService $reportes) {}

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
}
