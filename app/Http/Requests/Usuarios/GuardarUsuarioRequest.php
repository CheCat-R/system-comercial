<?php

namespace App\Http\Requests\Usuarios;

use App\Http\Requests\ApiRequest;

class GuardarUsuarioRequest extends ApiRequest
{
    public function rules(): array
    {
        $esAlta = $this->isMethod('POST');
        $min = (int) config('checat.min_password', 8);

        return [
            'nombre' => [$esAlta ? 'required' : 'sometimes', 'string', 'min:1', 'max:80'],
            'rolId' => [$esAlta ? 'required' : 'sometimes', 'integer', 'min:1'],
            // En el alta es obligatoria; en la edición, vacía = no cambiar.
            'password' => [$esAlta ? 'required' : 'nullable', 'string', 'min:'.$min, 'max:200'],
            'activo' => ['sometimes', 'boolean'],
            'relevoCaja' => ['sometimes', 'boolean'],
            // El PIN del relevo: 4 a 6 dígitos. Vacío = no cambiar.
            'pin' => ['nullable', 'string', 'regex:/^\d{4,6}$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Poné el nombre del usuario.',
            'nombre.min' => 'El nombre no puede quedar vacío.',
            'rolId.*' => 'Elegí un rol válido.',
            'password.required' => 'La contraseña necesita al menos '.config('checat.min_password', 8).' caracteres.',
            'password.min' => 'La contraseña necesita al menos '.config('checat.min_password', 8).' caracteres.',
            'pin.regex' => 'El PIN del relevo son 4 a 6 dígitos.',
        ];
    }
}
