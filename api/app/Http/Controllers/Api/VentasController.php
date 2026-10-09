<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Exceptions\ErrorDeNegocio;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ventas\ConfirmarVentaRequest;
use App\Http\Requests\Ventas\GuardarVentaRequest;
use App\Http\Requests\Ventas\NotaCreditoRequest;
use App\Http\Requests\Ventas\SincronizarOfflineRequest;
use App\Ventas\CatalogoPos;
use App\Ventas\VentasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

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

    /** Los costos del renglón (el margen) viajan solo a quien tiene la llave de precios o de productos. */
    private const COSTOS = ['costoUnitario', 'ivaAbsorbidoUnitario', 'porcSinFactura'];

    /** La venta tal como sale hacia ESTA sesión: sin los costos de los renglones si no tiene la llave. */
    private function salida(array $v, Sesion $s): array
    {
        if ($s->puede('precios', 'compras.productos', 'compras.proveedores') || ! isset($v['items']) || ! is_array($v['items'])) {
            return $v;
        }
        $v['items'] = array_map(fn ($it) => is_array($it) ? array_diff_key($it, array_flip(self::COSTOS)) : $it, $v['items']);

        return $v;
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

        $filas = $this->svc->list([
            'clienteId' => $q['clienteId'] ?? null,
            'sucursalId' => $sesion->esJefe() ? ($q['sucursalId'] ?? null) : $sesion->sucursalId,
            'estado' => self::uno($q['estado'] ?? null, self::ESTADOS, 'Estado'),
            'desde' => $q['desde'] ?? null, 'hasta' => $q['hasta'] ?? null, 'limit' => $q['limit'] ?? null,
            'incluirItems' => ($q['incluirItems'] ?? '') === 'true',
        ]);

        return response()->json(array_map(fn ($v) => $this->salida((array) $v, $sesion), $filas));
    }

    public function show(int $id, Sesion $sesion): JsonResponse
    {
        $v = $this->svc->get($id);
        $sesion->exigirSucursal($v['sucursalId'] ?? null, 'Esa venta');

        return response()->json($this->salida($v, $sesion));
    }

    public function store(GuardarVentaRequest $request, Sesion $sesion): JsonResponse
    {
        $d = $request->validated();

        return response()->json($this->salida($this->svc->create($d, $this->opciones($sesion, (int) ($d['sucursalId'] ?? 0) ?: null)), $sesion), 201);
    }

    public function update(GuardarVentaRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->salida($this->svc->actualizar($id, $request->validated(), $this->opciones($sesion)), $sesion));
    }

    /** El lote de ventas que el POS armó sin conexión, recién mandado al volver internet. */
    public function sincronizarOffline(SincronizarOfflineRequest $request, Sesion $sesion): JsonResponse
    {
        // El pedido ya validó el sobre; cada fila se valida sola, y una mal armada no frena a las demás.
        $validas = [];
        $rechazadas = [];
        foreach ($request->input('ventas') as $fila) {
            $v = Validator::make($fila, SincronizarOfflineRequest::reglasDeFila());
            if ($v->fails()) {
                $rechazadas[] = ['idLocal' => (string) $fila['idLocal'], 'ok' => false, 'motivo' => 'La venta está mal armada: '.$v->errors()->first()];

                continue;
            }
            $validas[] = $v->validated();
        }
        $r = $validas ? $this->svc->sincronizarOffline($validas, $this->opciones($sesion)) : ['resultados' => [], 'stockNegativo' => []];
        $r['resultados'] = [...$rechazadas, ...$r['resultados']];

        return response()->json($r);
    }

    public function confirmar(ConfirmarVentaRequest $request, int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->salida($this->svc->confirmar($id, $request->validated(), $this->opciones($sesion)), $sesion));
    }

    public function delegar(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['paraUsuarioId' => ['required', 'integer']]);

        return response()->json($this->svc->delegar($id, (int) $d['paraUsuarioId'], $this->opciones($sesion)));
    }

    public function facturar(int $id, Sesion $sesion): JsonResponse
    {
        return response()->json($this->salida($this->svc->facturarAhora($id, $this->opciones($sesion)), $sesion));
    }

    public function anular(Request $request, int $id, Sesion $sesion): JsonResponse
    {
        $d = $request->validate(['motivo' => ['required', 'string', 'max:300']]);

        return response()->json($this->salida($this->svc->anular($id, $d['motivo'], $this->opciones($sesion)), $sesion));
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
