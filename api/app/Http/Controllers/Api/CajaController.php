<?php

namespace App\Http\Controllers\Api;

use App\Auth\Operador;
use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Services\CajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Las escrituras trabajan sobre LA sucursal de la sesión. El jefe apunta a
 * otra al abrir; para cerrar, controlar o mover plata la sucursal se compara
 * contra la del turno, bajo candado. Las lecturas también son por sucursal.
 */
class CajaController extends Controller
{
    public function __construct(private readonly CajaService $svc) {}

    public function actual(int $sucursalId, Sesion $sesion): JsonResponse
    {
        $mia = $sesion->soloSuSucursal();
        if ($mia !== null && $mia !== $sucursalId) {
            throw new AccessDeniedHttpException('Ese turno es de otra sucursal.');
        }
        $t = $this->svc->actual($sucursalId);

        // Envuelto: un JSON `null` pelado sale como `{}` y el panel lo tomaría por un turno.
        return response()->json(['turno' => $t ? \App\Support\Fila::camel($t) : null]);
    }

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        $mia = $sesion->soloSuSucursal();

        return response()->json($this->svc->listar([
            'sucursalId' => $mia ?? $request->query('sucursalId'), 'estado' => $request->query('estado'), 'limit' => $request->query('limit'),
        ]));
    }

    private function exigirMiTurno(int $id, Sesion $sesion): void
    {
        $mia = $sesion->soloSuSucursal();
        if ($mia === null) {
            return;
        }
        $t = $this->svc->getOpcional($id);
        if ($t && (int) $t->sucursal_id !== $mia) {
            throw new AccessDeniedHttpException('Ese turno es de otra sucursal.');
        }
    }

    public function show(int $id, Sesion $sesion): JsonResponse
    {
        $this->exigirMiTurno($id, $sesion);

        return response()->json(\App\Support\Fila::camel($this->svc->get($id)));
    }

    public function arqueo(int $id, Sesion $sesion): JsonResponse
    {
        $this->exigirMiTurno($id, $sesion);

        return response()->json($this->svc->arqueo($id));
    }

    public function abrir(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['sucursalId' => ['nullable', 'integer'], 'montoInicial' => ['required', 'numeric'], 'observaciones' => ['nullable', 'string', 'max:500']]);
        $sucursalId = $sesion->sucursalDeOperacion((int) ($d['sucursalId'] ?? 0) ?: null);

        return response()->json($this->svc->abrir($sucursalId, $sesion->usuarioId, (float) $d['montoInicial'], $d['observaciones'] ?? ''), 201);
    }

    public function cerrar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['declaradoEfectivo' => ['required', 'numeric'], 'observaciones' => ['nullable', 'string', 'max:500']]);

        return response()->json($this->svc->cerrar($id, (float) $d['declaradoEfectivo'], $d['observaciones'] ?? null, $sesion->soloSuSucursal()));
    }

    public function control(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['contadoEfectivo' => ['required', 'numeric'], 'observaciones' => ['nullable', 'string', 'max:300'], 'operadorId' => ['nullable', 'integer']]);
        $autor = Operador::resolver($d['operadorId'] ?? null, $sesion->usuarioId);

        return response()->json($this->svc->control($id, (float) $d['contadoEfectivo'], $d['observaciones'] ?? '', $autor, $sesion->soloSuSucursal()), 201);
    }

    public function movimiento(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['tipo' => ['required', Rule::in(['ingreso', 'egreso'])], 'importe' => ['required', 'numeric'], 'motivo' => ['required', 'string', 'max:200'], 'operadorId' => ['nullable', 'integer']]);
        $autor = Operador::resolver($d['operadorId'] ?? null, $sesion->usuarioId);

        return response()->json($this->svc->movimiento($id, $d['tipo'], (float) $d['importe'], $d['motivo'], $autor, $sesion->soloSuSucursal()), 201);
    }
}
