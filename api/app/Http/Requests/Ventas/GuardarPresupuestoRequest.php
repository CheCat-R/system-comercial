<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarPresupuestoRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'clienteId' => ['nullable', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'vendedorId' => ['nullable', 'integer'],
            'entrega' => ['nullable', Rule::in(['retiro', 'cadete', 'camioneta'])],
            'observaciones' => ['nullable', 'string', 'max:500'],
            'items' => ['nullable', 'array', 'max:500'],
            'items.*.productoId' => ['required', 'integer'],
            'items.*.presentacionId' => ['nullable', 'integer'],
            'items.*.nombre' => ['nullable', 'string', 'max:200'],
            'items.*.detalle' => ['nullable', 'string', 'max:200'],
            'items.*.cantidad' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'items.*.precioLista' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'items.*.descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.iva' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.lista' => ['nullable', 'string', 'max:80'],
            'items.*.listaId' => ['nullable', 'integer'],
            'items.*.ofertaNombre' => ['nullable', 'string', 'max:120'],
        ];
    }
}
