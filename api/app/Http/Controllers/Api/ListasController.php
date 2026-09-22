<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ListaVenta;
use App\Models\ModalidadVenta;
use App\Models\ReglaMarca;
use App\Services\ListasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ListasController extends Controller
{
    public function __construct(private readonly ListasService $svc) {}

    public function catalogo(): JsonResponse
    {
        return response()->json($this->svc->catalogo());
    }

    private function reglasModalidad(): array
    {
        return ['nombre' => ['required', 'string', 'max:80'], 'orden' => ['nullable', 'integer'], 'activa' => ['nullable', 'boolean']];
    }

    public function crearModalidad(Request $request): JsonResponse
    {
        return response()->json($this->svc->crearModalidad($request->validate($this->reglasModalidad())), 201);
    }

    public function editarModalidad(Request $request, ModalidadVenta $modalidad): JsonResponse
    {
        return response()->json($this->svc->editarModalidad($modalidad, $request->validate($this->reglasModalidad())));
    }

    public function borrarModalidad(ModalidadVenta $modalidad): JsonResponse
    {
        $this->svc->borrarModalidad($modalidad);

        return response()->json(['ok' => true]);
    }

    private function reglasLista(): array
    {
        return ['modalidadId' => ['required', 'integer'], 'numero' => ['nullable', 'integer', 'min:1'], 'nombre' => ['present', 'string', 'max:80'], 'orden' => ['nullable', 'integer'], 'activa' => ['nullable', 'boolean']];
    }

    public function crear(Request $request): JsonResponse
    {
        return response()->json($this->svc->crearLista($request->validate($this->reglasLista())), 201);
    }

    public function editar(Request $request, ListaVenta $lista): JsonResponse
    {
        return response()->json($this->svc->editarLista($lista, $request->validate($this->reglasLista())));
    }

    public function borrar(ListaVenta $lista): JsonResponse
    {
        return response()->json($this->svc->borrarLista($lista));
    }

    public function reglas(): JsonResponse
    {
        return response()->json($this->svc->catalogo()['reglasMarca']);
    }

    /** Listas predeterminadas de un cliente (reemplaza el conjunto completo). */
    public function setCliente(Request $request, int $clienteId): JsonResponse
    {
        $d = $request->validate(['listas' => ['nullable', 'array'], 'listas.*' => ['integer']]);

        return response()->json($this->svc->setListasDeCliente($clienteId, $d['listas'] ?? []));
    }

    private function reglasRegla(): array
    {
        return ['marcaId' => ['required', 'integer'], 'unidadesMinimas' => ['required', 'numeric'], 'modalidadId' => ['required', 'integer'], 'activa' => ['nullable', 'boolean']];
    }

    public function crearRegla(Request $request): JsonResponse
    {
        return response()->json($this->svc->crearRegla($request->validate($this->reglasRegla())), 201);
    }

    public function editarRegla(Request $request, ReglaMarca $regla): JsonResponse
    {
        return response()->json($this->svc->editarRegla($regla, $request->validate($this->reglasRegla())));
    }

    public function borrarRegla(ReglaMarca $regla): JsonResponse
    {
        $regla->delete();

        return response()->json(['ok' => true]);
    }
}
