<?php

namespace App\Http\Requests\Terminales;

use App\Http\Requests\ApiRequest;

class GuardarTerminalRequest extends ApiRequest
{
    public function rules(): array
    {
        $esAlta = $this->isMethod('POST');

        return [
            'nombre' => [$esAlta ? 'required' : 'sometimes', 'string', 'min:1', 'max:60'],
            'sucursalId' => [$esAlta ? 'required' : 'sometimes', 'integer', 'exists:sucursales,id'],
            'activa' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Ponele un nombre al equipo: es como lo vas a reconocer en la lista.',
            'nombre.min' => 'El nombre no puede quedar vacío.',
            'sucursalId.*' => 'Elegí una sucursal válida.',
        ];
    }
}
