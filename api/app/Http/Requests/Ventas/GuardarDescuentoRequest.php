<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarDescuentoRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'nombre' => ['nullable', 'string', 'max:60'],
            'porcentaje' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'vence' => ['nullable', 'string', 'max:30'],
            'medioPago' => ['nullable', Rule::in(['', ...\App\Enums\MedioPago::valores()])],
            'listaId' => ['nullable', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'requiereAdmin' => ['nullable', 'boolean'],
            'activo' => ['nullable', 'boolean'],
        ];
    }
}
