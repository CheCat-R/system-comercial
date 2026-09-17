<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Exceptions\ErrorDeNegocio;
use App\Http\Controllers\Controller;
use App\Inventario\OperacionesService;
use App\Services\BootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/** Stock, movimientos, operaciones y bootstrap. */
class InventarioController extends Controller
{
    private const MAX_CANT = 100000;

    /** Qué llave habilita cada tipo de movimiento manual; el resto cae en `inventario`. */
    private const LLAVE_DE_TIPO = ['merma' => 'merma', 'vencido' => 'merma', 'defectuoso' => 'defectuoso'];

    public function __construct(private readonly OperacionesService $ops) {}

    public function bootstrap(Sesion $sesion, BootstrapService $bootstrap): JsonResponse
    {
        return response()->json($bootstrap->armar($sesion->puede('precios', 'compras.productos', 'compras.proveedores'), $sesion->soloSuSucursal()));
    }

    public function existencias(Sesion $sesion): JsonResponse
    {
        return response()->json($this->ops->existencias($sesion->soloSuSucursal())->map(fn ($s) => [
            'id' => $s->id, 'productoId' => $s->producto_id, 'sucursalId' => $s->sucursal_id, 'presentacionId' => $s->presentacion_id,
            'estado' => $s->estado, 'cantidad' => (float) $s->cantidad,
        ]));
    }

    public function movimientos(Request $request, Sesion $sesion): JsonResponse
    {
        $mia = $sesion->soloSuSucursal();

        return response()->json($this->ops->listarMovimientos([
            'productoId' => $request->query('productoId'),
            // El que no es jefe ve el movimiento de SU local.
            'sucursalId' => $mia ?? $request->query('sucursalId'),
            'tipo' => $request->query('tipo'), 'desde' => $request->query('desde'), 'hasta' => $request->query('hasta'), 'limit' => $request->query('limit'),
        ]));
    }

    private function conSesion(array $d, Sesion $s): array
    {
        return [...$d, 'usuarioId' => $s->usuarioId, 'sucursalId' => $s->sucursalDeOperacion((int) ($d['sucursalId'] ?? 0) ?: null)];
    }

    public function venta(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['productoId' => ['required', 'integer'], 'sucursalId' => ['nullable', 'integer'], 'presId' => ['nullable', 'integer'], 'cantidad' => ['required', 'numeric', 'min:0.001', 'max:'.self::MAX_CANT]]);

        return response()->json($this->ops->venta($this->conSesion($d, $sesion)));
    }

    public function fraccionar(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'productoId' => ['required', 'integer'], 'sucursalId' => ['nullable', 'integer'],
            'asignaciones' => ['required', 'array', 'max:50'], 'asignaciones.*.presId' => ['required', 'integer'], 'asignaciones.*.cant' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_CANT],
        ]);

        return response()->json($this->ops->fraccionar($this->conSesion($d, $sesion)));
    }

    public function corregirFraccionado(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['productoId' => ['required', 'integer'], 'sucursalId' => ['nullable', 'integer'], 'presId' => ['required', 'integer'], 'cantidadReal' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_CANT], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->ops->corregirFraccionado($this->conSesion($d, $sesion)));
    }

    public function movimiento(Request $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'productoId' => ['required', 'integer'], 'sucursalId' => ['nullable', 'integer'], 'presId' => ['nullable', 'integer'],
            'tipo' => ['required', Rule::in(['devolucion', 'ajuste', 'merma', 'vencido', 'defectuoso'])],
            'cantidad' => ['required', 'numeric', 'min:0.001', 'max:'.self::MAX_CANT], 'signo' => ['nullable', 'integer'], 'motivo' => ['nullable', 'string', 'max:300'],
        ]);
        $llave = self::LLAVE_DE_TIPO[$d['tipo']] ?? 'inventario';
        if (! $sesion->puede($llave)) {
            throw new AccessDeniedHttpException('Tu rol no puede cargar un movimiento de tipo "'.$d['tipo'].'".');
        }
        if ($d['tipo'] === 'ajuste' && trim((string) ($d['motivo'] ?? '')) === '') {
            throw new ErrorDeNegocio('Un ajuste necesita su motivo: es lo que queda en el historial.');
        }

        return response()->json($this->ops->simple($this->conSesion($d, $sesion)));
    }
}
