<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Exceptions\ErrorDeNegocio;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ventas\ConfirmarVentaRequest;
use App\Http\Requests\Ventas\GuardarVentaRequest;
use App\Http\Requests\Ventas\NotaCreditoRequest;
use App\Ventas\CatalogoPos;
use App\Ventas\VentasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * VENTAS — el mostrador. Todo lo que decide QUIÉN y DÓNDE sale de la sesión y
 * viaja en `opciones`; el body no puede decirlo.
 */
class VentasController extends Controller
{
    private const ESTADOS = ['borrador', 'confirmada', 'anulada', 'pendiente_cae'];

    public function __construct(private readonly VentasService $svc) {}

    private function opciones(Sesion $s, ?int $sucursalPedida = null): array
    {
        return [
            'sucursalSesion' => $s->sucursalDeOperacion($sucursalPedida),
            'soloSuSucursal' => $s->soloSuSucursal(),
            'puedePisarPrecio' => $s->puede('precio_manual'),
            'esJefe' => $s->esJefe(),
            'usuarioId' => $s->usuarioId,
        ];
    }

    private static function uno(?string $v, array $validos, string $campo): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (! in_array($v, $validos, true)) {
            throw new ErrorDeNegocio($campo.' inválido: '.$v);
        }

        return $v;
    }

    public function bootstrap(Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->bootstrap($sesion->usuarioId));
    }

    public function catalogo(Request $request, Sesion $sesion, CatalogoPos $catalogo): JsonResponse
    {
        $sucursalId = $sesion->sucursalDeOperacion((int) $request->query('sucursalId') ?: null);

        return response()->json($catalogo->armar($sucursalId));
    }

    public function cuenta(int $clienteId): JsonResponse
    {
        return response()->json($this->svc->cuenta($clienteId));
    }

    /** El listado de la pantalla Ventas. La SUCURSAL la manda la sesión para el que no es jefe. */
    public function listado(Request $request, Sesion $sesion): JsonResponse
    {
        $q = $request->query();

        return response()->json($this->svc->listado([
            'desde' => $q['desde'] ?? null, 'hasta' => $q['hasta'] ?? null, 'q' => $q['q'] ?? null,
            'estado' => self::uno($q['estado'] ?? null, self::ESTADOS, 'Estado'),
            'medioPago' => self::uno($q['medioPago'] ?? null, VentasService::MEDIOS_POS, 'Medio de pago'),
            'origen' => self::uno($q['origen'] ?? null, ['pos', 'presupuesto'], 'Origen'),
            'sucursalId' => $sesion->esJefe() ? ($q['sucursalId'] ?? null) : $sesion->sucursalId,
            'usuarioId' => $q['usuarioId'] ?? null, 'clienteId' => $q['clienteId'] ?? null, 'cajaSesionId' => $q['cajaSesionId'] ?? null,
            'conOferta' => ($q['conOferta'] ?? '') === 'true', 'sinFacturar' => ($q['sinFacturar'] ?? '') === 'true',
            'offset' => $q['offset'] ?? null, 'limit' => $q['limit'] ?? null,
        ]));
    }

    public function index(Request $request, Sesion $sesion): JsonResponse
    {
        $q = $request->query();

        return response()->json($this->svc->list([
            'clienteId' => $q['clienteId'] ?? null,
            'sucursalId' => $sesion->esJefe() ? ($q['sucursalId'] ?? null) : $sesion->sucursalId,
            'estado' => self::uno($q['estado'] ?? null, self::ESTADOS, 'Estado'),
            'desde' => $q['desde'] ?? null, 'hasta' => $q['hasta'] ?? null, 'limit' => $q['limit'] ?? null,
            'incluirItems' => ($q['incluirItems'] ?? '') === 'true',
        ]));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->svc->get($id));
    }

    public function store(GuardarVentaRequest $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validated();

        return response()->json($this->svc->create($d, $this->opciones($sesion, (int) ($d['sucursalId'] ?? 0) ?: null)), 201);
    }

    public function update(GuardarVentaRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->actualizar($id, $request->validated(), $this->opciones($sesion)));
    }

    public function confirmar(ConfirmarVentaRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->confirmar($id, $request->validated(), $this->opciones($sesion)));
    }

    public function delegar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['paraUsuarioId' => ['required', 'integer']]);

        return response()->json($this->svc->delegar($id, (int) $d['paraUsuarioId'], $this->opciones($sesion)));
    }

    public function facturar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->facturarAhora($id, $this->opciones($sesion)));
    }

    public function anular(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['motivo' => ['required', 'string', 'max:300']]);

        return response()->json($this->svc->anular($id, $d['motivo'], $this->opciones($sesion)));
    }

    public function notaCredito(NotaCreditoRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->notaCredito($id, $request->validated(), $this->opciones($sesion)), 201);
    }

    public function destroy(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->descartar($id, $this->opciones($sesion)));
    }
}
