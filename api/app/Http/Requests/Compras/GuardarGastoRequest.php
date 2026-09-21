<?php

namespace App\Http\Requests\Compras;

use App\Compras\Documentos;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarGastoRequest extends ApiRequest
{
    public function rules(): array
    {
        $esAlta = $this->isMethod('POST');

        return [
            'fecha' => ['nullable', 'string', 'max:30'],
            'tipoDoc' => ['nullable', Rule::in(['factura', 'ticket', 'recibo', 'nota_credito', 'otro'])],
            'letra' => ['nullable', Rule::in(Documentos::LETRAS)],
            'numero' => ['nullable', 'string', 'max:40'],
            'proveedorId' => ['nullable', 'integer'],
            'proveedorTexto' => ['nullable', 'string', 'max:160'],
            'categoriaId' => [$esAlta ? 'required' : 'nullable', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'descripcion' => ['nullable', 'string', 'max:500'],
            'condicionPago' => ['nullable', Rule::in(['contado', 'cuenta_corriente'])],
            'vencimiento' => ['nullable', 'string', 'max:30'],
            'neto' => ['nullable', 'numeric'],
            'iva' => ['nullable', 'numeric'],
            'otros' => ['nullable', 'numeric'],
            'impInternos' => ['nullable', 'numeric', 'min:0'],
            'percDgi' => ['nullable', 'numeric', 'min:0'],
            'percDgr' => ['nullable', 'numeric', 'min:0'],
            'items' => ['nullable', 'array', 'max:50'],
            'items.*.concepto' => ['required', 'string', 'max:200'],
            'items.*.monto' => ['required', 'numeric', 'min:0.01'],
            'ivaAparte' => ['nullable', 'boolean'],
            'observaciones' => ['nullable', 'string', 'max:2000'],
            'pagoInmediato' => ['nullable', 'array'],
            'pagoInmediato.importe' => ['required_with:pagoInmediato', 'numeric', 'min:0.01'],
            'pagoInmediato.medio' => ['nullable', Rule::in(Documentos::MEDIOS)],
            'pagoInmediato.fecha' => ['nullable', 'string', 'max:30'],
            'pagoInmediato.referencia' => ['nullable', 'string', 'max:200'],
            'pagoInmediato.cajaSesionId' => ['nullable', 'integer'],
            'pagoInmediato.operadorId' => ['nullable', 'integer'],
        ];
    }

    public function messages(): array
    {
        return ['categoriaId.*' => 'Elegí el rubro al que se imputa el gasto.'];
    }
}
