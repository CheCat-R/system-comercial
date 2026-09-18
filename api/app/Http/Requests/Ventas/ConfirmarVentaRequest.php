<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class ConfirmarVentaRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'tipo' => ['nullable', Rule::in(['ticket', 'factura'])],
            'condicionPago' => ['nullable', Rule::in(['contado', 'cuenta_corriente'])],
            'cajaSesionId' => ['nullable', 'integer'],
            'operadorId' => ['nullable', 'integer'],
            'observaciones' => ['nullable', 'string', 'max:2000'],
            'redondeo' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'pagos' => ['nullable', 'array', 'max:20'],
            'pagos.*.medio' => ['required', Rule::in(\App\Ventas\VentasService::MEDIOS_POS)],
            'pagos.*.importe' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'pagos.*.referencia' => ['nullable', 'string', 'max:120'],
        ];
    }
}
