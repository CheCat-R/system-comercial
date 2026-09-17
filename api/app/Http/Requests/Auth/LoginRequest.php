<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class LoginRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            // Se valida ANTES de consultar: entrar sin elegir usuario es error de quien entra, no un 500.
            'usuarioId' => ['required', 'integer', 'min:1'],
            'password' => ['present', 'string', 'max:200'],
            // Obligatoria salvo superadmin o equipo registrado; esa regla vive en el controlador.
            'sucursalId' => ['nullable', 'integer', 'min:1'],
            'terminalToken' => ['nullable', 'string', 'max:200'],
        ];
    }

    public function messages(): array
    {
        return [
            'usuarioId.*' => 'Elegí un usuario válido.',
            'sucursalId.*' => 'Elegí una sucursal válida.',
        ];
    }
}
