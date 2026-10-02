<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class CambiarPasswordRequest extends ApiRequest
{
    public function rules(): array
    {
        $min = (int) config('checat.min_password', 8);

        return [
            'passwordActual' => ['required', 'string'],
            // `different`: sin esto, "cambiar" la contraseña inicial por la misma inicial cumplía el trámite sin cambiar nada.
            'password' => ['required', 'string', 'min:'.$min, 'max:200', 'different:passwordActual'],
        ];
    }

    public function messages(): array
    {
        $min = (int) config('checat.min_password', 8);

        return [
            'passwordActual.required' => 'Ingresá tu contraseña actual.',
            'password.required' => 'La contraseña nueva necesita al menos '.$min.' caracteres.',
            'password.min' => 'La contraseña nueva necesita al menos '.$min.' caracteres.',
            'password.different' => 'La contraseña nueva tiene que ser distinta de la actual.',
        ];
    }
}
