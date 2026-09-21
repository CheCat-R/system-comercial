<?php

namespace App\Http\Requests\Compras;

use App\Compras\Documentos;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarPagoRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'proveedorId' => ['nullable', 'integer'],
            'destino' => ['nullable', Rule::in(['mercaderia', 'gastos'])],
            'importe' => ['required', 'numeric', 'min:0.01', 'max:1000000000'],
            'medio' => ['nullable', Rule::in(Documentos::MEDIOS)],
            'fecha' => ['nullable', 'string', 'max:30'],
            'concepto' => ['nullable', 'string', 'max:300'],
            'referencia' => ['nullable', 'string', 'max:200'],
            'esFlete' => ['nullable', 'boolean'],
            'sucursalId' => ['nullable', 'integer'],
            'cajaSesionId' => ['nullable', 'integer'],
            'operadorId' => ['nullable', 'integer'],
            'observaciones' => ['nullable', 'string', 'max:1000'],
            'imputaciones' => ['nullable', 'array', 'max:50'],
            'imputaciones.*.gastoId' => ['nullable', 'integer'],
            'imputaciones.*.comprobanteId' => ['nullable', 'integer'],
            'imputaciones.*.importe' => ['required', 'numeric', 'min:0.01'],
            'formas' => ['nullable', 'array', 'max:10'],
            'formas.*.medio' => ['required', Rule::in(Documentos::MEDIOS)],
            'formas.*.importe' => ['required', 'numeric', 'min:0.01'],
            'formas.*.fecha' => ['nullable', 'string', 'max:30'],
            'fletes' => ['nullable', 'array', 'max:50'],
            'fletes.*.pagoId' => ['required', 'integer'],
            'fletes.*.gastoId' => ['nullable', 'integer'],
            'fletes.*.comprobanteId' => ['nullable', 'integer'],
            'fletes.*.importe' => ['required', 'numeric', 'min:0.01'],
        ];
    }

    public function messages(): array
    {
        return ['importe.*' => 'El importe del pago tiene que ser mayor a 0.'];
    }
}
