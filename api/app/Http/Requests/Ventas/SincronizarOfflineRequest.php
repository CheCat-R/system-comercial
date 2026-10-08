<?php

namespace App\Http\Requests\Ventas;

use App\Http\Requests\ApiRequest;

/**
 * Forma del LOTE que manda el POS al volver la conexión — cada fila es una
 * venta ya armada y cobrada en el dispositivo mientras estuvo offline.
 *
 * El pedido solo exige el sobre (una lista de filas, cada una con su
 * `idLocal`). Cada FILA se valida aparte —`reglasDeFila()`— para que una mal
 * armada se informe como rechazada y las demás entren igual: si fallara todo el
 * lote por una fila, esa venta ya cobrada trabaría a todas las que vienen detrás.
 *
 * La fila lleva LAS MISMAS reglas que una venta en línea (`GuardarVentaRequest`):
 * cliente, ítems con todos sus campos, extras, descuentos con nombre,
 * observaciones. Antes solo pasaban idLocal, ítems y pagos, y `validated()`
 * descartaba el resto: la venta de "Juan Pérez" salía a nombre de Consumidor
 * Final, y una con envío o descuento se rechazaba porque los pagos "no cerraban".
 *
 * Lo que NO se acepta de la fila, porque lo decide el servidor con la sesión:
 * `operadorId` (quién firma), `sucursalId`, `estado`, `tipo`, `condicionPago`
 * (offline es siempre contado), `presupuestoId` y `fecha` (la real viaja en
 * `cobradaEn`, y se acota).
 */
class SincronizarOfflineRequest extends ApiRequest
{
    private const DEL_SERVIDOR = ['operadorId', 'sucursalId', 'estado', 'tipo', 'condicionPago', 'presupuestoId', 'fecha'];

    public function rules(): array
    {
        return [
            'ventas' => ['required', 'array', 'min:1', 'max:200'],
            'ventas.*' => ['array'],
            'ventas.*.idLocal' => ['required', 'string', 'max:64'],
        ];
    }

    /** Reglas de UNA fila del lote. */
    public static function reglasDeFila(): array
    {
        $reglas = [
            'idLocal' => ['required', 'string', 'max:64'],
            'borradorId' => ['nullable', 'integer', 'min:1'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'pagos' => ['required', 'array', 'min:1', 'max:20'],
            // El redondeo del cobro ($39.893 → $39.900): el POS lo suma al pago, acá viaja como lo que es.
            'redondeo' => ['nullable', 'numeric', 'min:0', 'max:100'],
            // Cuándo y por quién se cobró en el mostrador (la sesión que sincroniza puede ser otra).
            'cobradaEn' => ['nullable', 'date'],
            'cobradoPor' => ['nullable', 'string', 'max:120'],
        ];
        foreach ((new GuardarVentaRequest)->rules() as $campo => $regla) {
            if (in_array(explode('.', $campo)[0], self::DEL_SERVIDOR, true) || isset($reglas[$campo])) {
                continue;
            }
            $reglas[$campo] = $regla;
        }

        return $reglas;
    }
}
