<?php

namespace App\Http\Requests\Compras;

use App\Http\Requests\ApiRequest;

/**
 * Llegó la factura de un remito: el encabezado del papel, los precios reales
 * por `itemId` (producto y cantidad quedan clavados), el pie y cómo se paga.
 */
class FacturarRemitoRequest extends ApiRequest
{
    public function rules(): array
    {
        $r = (new GuardarComprobanteRequest)->rules();
        foreach (array_keys($r) as $k) {
            if (str_starts_with($k, 'items') || in_array($k, ['tipo', 'proveedorId', 'sucursalId', 'estado', 'condicionPago', 'recepcion', 'refComprobanteId'], true)) {
                unset($r[$k]);
            }
        }

        return [...$r,
            'items' => ['nullable', 'array', 'max:500'],
            'items.*.itemId' => ['required', 'integer'],
            'items.*.costoUnitario' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'items.*.descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.iva' => ['nullable', 'numeric'],
        ];
    }
}
