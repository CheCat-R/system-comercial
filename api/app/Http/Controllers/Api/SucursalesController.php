<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Sucursales\GuardarSucursalRequest;
use App\Http\Resources\SucursalResource;
use App\Models\Sucursal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class SucursalesController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return SucursalResource::collection(Sucursal::query()->orderBy('id')->get());
    }

    public function show(Sucursal $sucursal): SucursalResource
    {
        return new SucursalResource($sucursal);
    }

    public function store(GuardarSucursalRequest $request): JsonResponse
    {
        $sucursal = Sucursal::query()->create($this->normalizar($request->validated()));

        return response()->json(new SucursalResource($sucursal), 201);
    }

    public function update(GuardarSucursalRequest $request, Sucursal $sucursal): SucursalResource
    {
        $sucursal->update($this->normalizar($request->validated(), $sucursal->id));

        return new SucursalResource($sucursal->refresh());
    }

    public function destroy(Sucursal $sucursal): JsonResponse
    {
        /*
         * Borrarla se llevaría su stock sin dejar ningún movimiento. Las tablas
         * de stock e incidencias llegan en el paso de inventario; hasta entonces
         * el chequeo se saltea solo.
         */
        if (Schema::hasTable('stock') && DB::table('stock')->where('sucursal_id', $sucursal->id)->where('cantidad', '>', 0.000001)->exists()) {
            throw ValidationException::withMessages([
                'sucursal' => $sucursal->nombre.' todavía tiene mercadería cargada. Transferila o dala de baja antes de borrar la sucursal.',
            ]);
        }
        if (Schema::hasTable('incidencias') && DB::table('incidencias')->where('sucursal_id', $sucursal->id)->where('estado', '!=', 'resuelta')->exists()) {
            throw ValidationException::withMessages([
                'sucursal' => $sucursal->nombre.' tiene incidencias sin resolver: cerralas antes de borrarla.',
            ]);
        }
        $sucursal->delete();

        return response()->json(['ok' => true]);
    }

    private function normalizar(array $d, ?int $idPropio = null): array
    {
        $puntoVenta = Sucursal::normalizarPuntoVenta($d['puntoVenta'] ?? '');
        if ($puntoVenta !== '') {
            $dueño = Sucursal::query()->where('punto_venta', $puntoVenta)->first(['id', 'nombre']);
            if ($dueño && $dueño->id !== $idPropio) {
                throw ValidationException::withMessages([
                    'puntoVenta' => 'El punto de venta '.$puntoVenta.' ya es el de '.$dueño->nombre.'. '
                        .'Cada local tiene el suyo: compartirlo haría que las dos sucursales le pidan el mismo número a ARCA.',
                ]);
            }
        }
        $tipo = $d['tipo'] ?? Sucursal::TIPO_EXPRESS;
        if ($tipo === Sucursal::TIPO_DISTRIBUIDORA) {
            $otra = Sucursal::query()->where('tipo', Sucursal::TIPO_DISTRIBUIDORA)->first(['id', 'nombre']);
            if ($otra && $otra->id !== $idPropio) {
                throw ValidationException::withMessages([
                    'tipo' => 'Ya hay una distribuidora ('.$otra->nombre.'). Es la única: decide de qué depósito sale y entra la mercadería.',
                ]);
            }
        }

        return [
            'nombre' => trim($d['nombre']),
            'tipo' => $tipo,
            'punto_venta' => $puntoVenta,
            'direccion' => trim($d['direccion'] ?? ''),
        ];
    }
}
