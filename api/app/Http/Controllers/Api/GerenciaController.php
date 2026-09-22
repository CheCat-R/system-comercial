<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Gerencia\RentabilidadService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Rentabilidad (`gerencia.rentabilidad`): el margen real del negocio, en vivo. */
class GerenciaController extends Controller
{
    public function __construct(private readonly RentabilidadService $svc) {}

    public function rentabilidad(Request $request, Sesion $sesion): JsonResponse
    {
        $sucursalId = $sesion->esJefe() ? $request->query('sucursalId') : $sesion->sucursalId;

        return response()->json($this->svc->rentabilidad([
            'desde' => $request->query('desde'),
            'hasta' => $request->query('hasta'),
            'sucursalId' => $sucursalId,
        ]));
    }
}
