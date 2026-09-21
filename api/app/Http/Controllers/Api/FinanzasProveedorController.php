<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Compras\Documentos;
use App\Compras\FinanzasProveedorService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Compromisos (`proveedores.ctasctes`), echeqs (`proveedores.echeqs`) y estados de cuenta (`proveedores.edoc`). */
class FinanzasProveedorController extends Controller
{
    public function __construct(private readonly FinanzasProveedorService $svc) {}

    /* ---------------- Compromisos ---------------- */

    public function compromisos(Request $request): JsonResponse
    {
        return response()->json($this->svc->listarCompromisos(['filtro' => $request->query('filtro'), 'proveedorId' => $request->query('proveedorId')]));
    }

    public function statsCompromisos(): JsonResponse
    {
        return response()->json($this->svc->statsCompromisos());
    }

    public function compromiso(int $id): JsonResponse
    {
        return response()->json($this->svc->getCompromiso($id));
    }

    public function crearCompromiso(Request $request): JsonResponse
    {
        $d = $request->validate(['proveedorId' => ['required', 'integer'], 'importe' => ['required', 'numeric', 'min:0.01'], 'fechaVenc' => ['required', 'string', 'max:30'],
            'fechaEmision' => ['nullable', 'string', 'max:30'], 'obs' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->crearCompromisoManual($d), 201);
    }

    public function editarCompromiso(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['importe' => ['nullable', 'numeric', 'min:0.01'], 'fechaVenc' => ['nullable', 'string', 'max:30'], 'fechaEmision' => ['nullable', 'string', 'max:30'], 'obs' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->editarCompromiso($id, $d));
    }

    public function pagarCompromiso(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['medio' => ['nullable', Rule::in(Documentos::MEDIOS)], 'formas' => ['nullable', 'array', 'max:10'], 'formas.*.medio' => ['required', Rule::in(Documentos::MEDIOS)],
            'formas.*.importe' => ['required', 'numeric', 'min:0.01'], 'formas.*.fecha' => ['nullable', 'string', 'max:30'], 'fecha' => ['nullable', 'string', 'max:30'],
            'cajaSesionId' => ['nullable', 'integer'], 'referencia' => ['nullable', 'string', 'max:200'], 'obs' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->pagarCompromiso($id, $d, $sesion));
    }

    public function borrarCompromiso(int $id): JsonResponse
    {
        $this->svc->borrarCompromiso($id);

        return response()->json(['ok' => true]);
    }

    /* ---------------- Echeqs ---------------- */

    public function echeqs(Request $request): JsonResponse
    {
        return response()->json($this->svc->listarEcheqs($request->only(['filtro', 'proveedorId', 'buscar'])));
    }

    public function statsEcheqs(): JsonResponse
    {
        return response()->json($this->svc->statsEcheqs());
    }

    public function echeq(int $id): JsonResponse
    {
        return response()->json($this->svc->getEcheq($id));
    }

    private function echeqDatos(Request $request): array
    {
        return $request->validate(['numero' => ['nullable', 'string', 'max:40'], 'banco' => ['nullable', 'string', 'max:100'], 'importe' => ['nullable', 'numeric', 'min:0.01'],
            'fechaEmision' => ['nullable', 'string', 'max:30'], 'fechaVenc' => ['nullable', 'string', 'max:30'], 'proveedorId' => ['nullable', 'integer'], 'obs' => ['nullable', 'string', 'max:2000']]);
    }

    public function crearEcheq(Request $request): JsonResponse
    {
        return response()->json($this->svc->crearEcheq($this->echeqDatos($request)), 201);
    }

    public function editarEcheq(Request $request, int $id): JsonResponse
    {
        return response()->json($this->svc->editarEcheq($id, $this->echeqDatos($request)));
    }

    public function estadoEcheq(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['estado' => ['required', Rule::in(['emitido', 'entregado', 'cobrado', 'anulado'])]]);

        return response()->json($this->svc->estadoEcheq($id, $d['estado'], $sesion));
    }

    public function borrarEcheq(int $id): JsonResponse
    {
        $this->svc->borrarEcheq($id);

        return response()->json(['ok' => true]);
    }

    /* ---------------- Estado de cuenta ---------------- */

    public function edocGlobal(): JsonResponse
    {
        return response()->json($this->svc->edocGlobal());
    }

    public function edoc(int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->edocProveedor($proveedorId));
    }

    public function ajuste(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['proveedorId' => ['required', 'integer'], 'monto' => ['required', 'numeric', 'min:0.01'], 'tipo' => ['required', Rule::in(['debe', 'haber'])],
            'motivo' => ['required', 'string', 'max:500'], 'fecha' => ['nullable', 'string', 'max:30']]);

        return response()->json($this->svc->crearAjuste($d, $sesion->usuarioId), 201);
    }

    public function borrarAjuste(int $id): JsonResponse
    {
        $this->svc->borrarAjuste($id);

        return response()->json(['ok' => true]);
    }

    public function conciliar(int $proveedorId, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->conciliar($proveedorId, $sesion->usuarioId));
    }

    public function desconciliar(int $proveedorId): JsonResponse
    {
        return response()->json($this->svc->desconciliar($proveedorId));
    }
}
