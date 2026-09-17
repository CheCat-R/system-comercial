<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Productos\GuardarProductoRequest;
use App\Models\Producto;
use App\Services\ProductosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductosController extends Controller
{
    public function __construct(private readonly ProductosService $svc) {}

    /** Los costos (el MARGEN) viajan sólo a quien tiene la llave de precios o de productos. */
    private function veCostos(Sesion $s): bool
    {
        return $s->puede('precios', 'compras.productos', 'compras.proveedores');
    }

    public function index(Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->listar($this->veCostos($sesion)));
    }

    public function show(Producto $producto, Sesion $sesion): JsonResponse
    {
        return response()->json($this->svc->get($producto->id, $this->veCostos($sesion)));
    }

    public function siguienteCodigo(): JsonResponse
    {
        return response()->json($this->svc->siguienteCodigo());
    }

    public function siguienteEan(Request $request): JsonResponse
    {
        $excluir = array_filter(explode(',', (string) $request->query('excluir', '')));

        return response()->json($this->svc->siguienteEan13($excluir));
    }

    public function store(GuardarProductoRequest $request): JsonResponse
    {
        return response()->json($this->svc->crear($request->validated()), 201);
    }

    public function update(GuardarProductoRequest $request, Producto $producto): JsonResponse
    {
        return response()->json($this->svc->editar($producto, $request->validated()));
    }

    public function cartel(Request $request, Producto $producto): JsonResponse
    {
        $d = $request->validate(['etiquetaMarca' => ['nullable', 'string', 'max:120'], 'etiquetaNombre' => ['nullable', 'string', 'max:200']]);

        return response()->json($this->svc->guardarCartel($producto, $request->only(array_keys($d))));
    }

    public function destroy(Producto $producto): JsonResponse
    {
        $this->svc->borrar($producto);

        return response()->json(['ok' => true]);
    }

    public function cambiarEstado(Request $request, Producto $producto): JsonResponse
    {
        $d = $request->validate(['estado' => ['required', Rule::in(['activo', 'discontinuado', 'archivado'])], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->cambiarEstado($producto, $d['estado'], $d['motivo'] ?? null));
    }

    public function sugerenciasArchivado(): JsonResponse
    {
        return response()->json($this->svc->sugerenciasArchivado());
    }

    public function archivarLote(Request $request): JsonResponse
    {
        $d = $request->validate(['ids' => ['required', 'array', 'max:5000'], 'ids.*' => ['integer'], 'motivo' => ['nullable', 'string', 'max:300']]);

        return response()->json($this->svc->archivarLote($d['ids'], $d['motivo'] ?? null));
    }

    public function setPresentaciones(Request $request, Producto $producto): JsonResponse
    {
        $d = $request->validate(['items' => ['present', 'array', 'max:50'], 'items.*.id' => ['nullable', 'integer'], 'items.*.tamKg' => ['required', 'numeric', 'min:0'], 'items.*.codigoBarras' => ['nullable', 'string', 'max:60']]);

        return response()->json($this->svc->setPresentaciones($producto, $d['items']));
    }

    public function setFormatosCompra(Request $request, Producto $producto, Sesion $sesion): JsonResponse
    {
        $d = $request->validate([
            'items' => ['present', 'array', 'max:50'], 'items.*.id' => ['nullable', 'integer'], 'items.*.proveedorId' => ['required', 'integer', 'exists:proveedores,id'],
            'items.*.cantidad' => ['nullable', 'numeric'], 'items.*.costo' => ['nullable', 'numeric'], 'items.*.descuento' => ['nullable', 'numeric'],
            'items.*.descuento2' => ['nullable', 'numeric'], 'items.*.descuento3' => ['nullable', 'numeric'], 'items.*.descuento4' => ['nullable', 'numeric'],
            'items.*.flete' => ['nullable', 'numeric'], 'items.*.modoCosto' => ['nullable', Rule::in(['lista', 'final'])], 'items.*.costoFinal' => ['nullable', 'numeric'],
            'items.*.porcSinFactura' => ['nullable', 'numeric'], 'items.*.usarParaPrecio' => ['nullable', 'boolean'], 'items.*.codigoProveedor' => ['nullable', 'string', 'max:60'],
        ]);

        return response()->json($this->svc->setFormatosCompra($producto, $d['items'], $sesion->usuarioId));
    }

    private function reglasListas(): array
    {
        return [
            'items' => ['present', 'array', 'max:50'], 'items.*.listaId' => ['required', 'integer'],
            'items.*.modoPrecio' => ['nullable', Rule::in(['markup', 'precio'])], 'items.*.markup' => ['nullable', 'numeric'],
            'items.*.precioFijo' => ['nullable', 'numeric'], 'items.*.unidades' => ['nullable', 'numeric'],
            'items.*.codigoBarras' => ['nullable', 'string', 'max:60'], 'items.*.unidadesMinimas' => ['nullable', 'numeric'],
        ];
    }

    public function setListas(Request $request, Producto $producto): JsonResponse
    {
        $d = $request->validate($this->reglasListas());

        return response()->json($this->svc->setListas($producto, $d['items']));
    }

    public function setListasPresentacion(Request $request, int $presId): JsonResponse
    {
        $d = $request->validate($this->reglasListas());

        return response()->json($this->svc->setListasPresentacion($presId, $d['items']));
    }
}
