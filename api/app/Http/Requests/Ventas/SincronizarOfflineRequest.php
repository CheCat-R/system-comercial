<?php

namespace App\Http\Requests\Ventas;

use App\Http\Requests\ApiRequest;

/**
 * Forma del LOTE que manda el POS al volver la conexión — cada fila es una
 * venta ya armada y cobrada en el dispositivo mientras estuvo offline. El
 * resto de cada fila (items, pagos, cliente, etc.) tiene la MISMA forma que
 * ya valida `GuardarVentaRequest` para una venta confirmada de una — no se
 * duplican esas reglas acá: `VentasService::create()` ya las aplica, fila
 * por fila, dentro del loop. Acá solo se exige lo mínimo para no reventar
 * antes de llegar ahí: que cada fila traiga su `idLocal` (la idempotencia) y
 * al menos un ítem y un pago.
 */
class SincronizarOfflineRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'ventas' => ['required', 'array', 'min:1', 'max:200'],
            'ventas.*.idLocal' => ['required', 'string', 'max:64'],
            'ventas.*.borradorId' => ['nullable', 'integer', 'min:1'],
            'ventas.*.items' => ['required', 'array', 'min:1'],
            'ventas.*.pagos' => ['required', 'array', 'min:1'],
        ];
    }
}
