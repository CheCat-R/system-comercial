<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class LoginRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            // Se valida ANTES de consultar: entrar sin escribir el usuario es error de quien entra, no un 500.
            'usuario' => ['required', 'string', 'max:80'],
            'password' => ['present', 'string', 'max:200'],
            // Obligatoria salvo superadmin o equipo registrado; esa regla vive en el controlador.
            'sucursalId' => ['nullable', 'integer', 'min:1'],
            'terminalToken' => ['nullable', 'string', 'max:200'],
        ];
    }

    public function messages(): array
    {
        return [
            'usuario.*' => 'Escribí tu usuario.',
            'sucursalId.*' => 'Elegí una sucursal válida.',
        ];
    }
}
