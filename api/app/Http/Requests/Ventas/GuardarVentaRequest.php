<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarVentaRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'clienteId' => ['nullable', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'operadorId' => ['nullable', 'integer'],
            'cajaSesionId' => ['nullable', 'integer'],
            'tipo' => ['nullable', Rule::in(['ticket', 'factura_a', 'factura_b', 'factura_c'])],
            'estado' => ['nullable', Rule::in(['borrador', 'confirmada'])],
            'condicionPago' => ['nullable', Rule::in(['contado', 'cuenta_corriente'])],
            'fecha' => ['nullable', 'string'],
            'listaPrecio' => ['nullable', 'string', 'max:80'],
            'observaciones' => ['nullable', 'string', 'max:2000'],
            'presupuestoId' => ['nullable', 'integer'],
            'items' => ['nullable', 'array', 'max:500'],
            'items.*.productoId' => ['required', 'integer'],
            'items.*.presentacionId' => ['nullable', 'integer'],
            'items.*.cantidad' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'items.*.listaId' => ['nullable', 'integer'],
            'items.*.lista' => ['nullable', 'string', 'max:80'],
            'items.*.listaOrigen' => ['nullable', Rule::in(['base', 'cliente', 'auto', 'manual', 'marca', 'monto', 'presupuesto'])],
            'items.*.precioLista' => ['nullable', 'numeric', 'min:0'],
            'items.*.precioUnitario' => ['nullable', 'numeric', 'min:0'],
            'items.*.descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.ofertaId' => ['nullable', 'integer'],
            'items.*.oferta' => ['nullable', 'string', 'max:120'],
            'items.*.ofertaDescuento' => ['nullable', 'numeric', 'min:0'],
            'extras' => ['nullable', 'array', 'max:50'],
            'extras.*.concepto' => ['required', 'string', 'max:120'],
            'extras.*.importe' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'extras.*.iva' => ['nullable', 'numeric', Rule::in([0, 2.5, 5, 10.5, 21, 27])],
            'pagos' => ['nullable', 'array', 'max:20'],
            'pagos.*.medio' => ['required', Rule::in(\App\Ventas\VentasService::MEDIOS_POS)],
            'pagos.*.importe' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'pagos.*.referencia' => ['nullable', 'string', 'max:120'],
            'descuentos' => ['nullable', 'array'],
            'descuentos.*' => ['integer'],
        ];
    }
}
