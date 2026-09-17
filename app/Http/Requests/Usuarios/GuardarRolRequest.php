<?php

namespace App\Http\Requests\Usuarios;

use App\Http\Requests\ApiRequest;

class GuardarRolRequest extends ApiRequest
{
    public function rules(): array
    {
        $esAlta = $this->isMethod('POST');

        return [
            'nombre' => [$esAlta ? 'required' : 'sometimes', 'string', 'min:1', 'max:80'],
            'descripcion' => ['nullable', 'string', 'max:300'],
            'permisos' => [$esAlta ? 'nullable' : 'sometimes', 'array'],
            'permisos.*' => ['string', 'max:60'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Poné el nombre del rol.',
            'nombre.min' => 'El nombre no puede quedar vacío.',
            'permisos.array' => 'Permisos inválidos.',
        ];
    }
}
