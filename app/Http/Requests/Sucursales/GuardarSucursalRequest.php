<?php

namespace App\Http\Requests\Sucursales;

use App\Http\Requests\ApiRequest;
use App\Models\Sucursal;
use Illuminate\Validation\Rule;

class GuardarSucursalRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'min:1', 'max:80'],
            'tipo' => ['nullable', Rule::in(Sucursal::TIPOS)],
            'puntoVenta' => ['nullable', 'string', 'max:5'],
            'direccion' => ['nullable', 'string', 'max:200'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.*' => 'Poné el nombre de la sucursal.',
            'tipo.in' => 'El tipo es distribuidora o express.',
        ];
    }
}
