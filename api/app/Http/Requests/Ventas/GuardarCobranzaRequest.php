<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarCobranzaRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'clienteId' => ['required', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'operadorId' => ['nullable', 'integer'],
            'fecha' => ['nullable', 'string'],
            'observaciones' => ['nullable', 'string', 'max:2000'],
            'pagos' => ['required', 'array', 'min:1', 'max:20'],
            'pagos.*.medio' => ['required', Rule::in(\App\Ventas\VentasService::MEDIOS_POS)],
            'pagos.*.importe' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'pagos.*.referencia' => ['nullable', 'string', 'max:120'],
            'imputaciones' => ['nullable', 'array', 'max:200'],
            'imputaciones.*.ventaId' => ['required', 'integer'],
            'imputaciones.*.importe' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'auto' => ['nullable', 'boolean'],
        ];
    }
}
