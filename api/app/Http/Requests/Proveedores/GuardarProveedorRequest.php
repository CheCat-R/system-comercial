<?php

namespace App\Http\Requests\Proveedores;

use App\Enums\CondicionCompra;
use App\Enums\CondicionIva;
use App\Enums\MedioHabitual;
use App\Enums\ModoCuenta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarProveedorRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'min:1', 'max:160'],
            'cuit' => ['nullable', 'string', 'max:20'],
            'condicionIva' => ['nullable', Rule::in(CondicionIva::valores())],
            'direccion' => ['nullable', 'string', 'max:200'],
            'telefono' => ['nullable', 'string', 'max:60'],
            'email' => ['nullable', 'string', 'max:120'],
            'proveeMercaderia' => ['nullable', 'boolean'],
            'proveeGastos' => ['nullable', 'boolean'],
            'letraGasto' => ['nullable', Rule::in(['A', 'B', 'C', 'X', ''])],
            'condicionCompra' => ['nullable', Rule::in(CondicionCompra::valores())],
            'medioHabitual' => ['nullable', Rule::in([...MedioHabitual::valores(), ''])],
            'diasPago' => ['nullable', 'integer', 'min:0', 'max:365'],
            'modoCuenta' => ['nullable', Rule::in(ModoCuenta::valores())],
            'porcSinFactura' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return ['nombre.*' => 'Poné el nombre del proveedor.'];
    }
}
