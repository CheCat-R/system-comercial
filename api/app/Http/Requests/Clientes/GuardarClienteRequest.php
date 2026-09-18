<?php

namespace App\Http\Requests\Clientes;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarClienteRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'min:1', 'max:160'],
            'nombreFantasia' => ['nullable', 'string', 'max:160'],
            'tipoDoc' => ['nullable', Rule::in(TipoDoc::valores())],
            'numeroDoc' => ['nullable', 'string', 'max:20'],
            'condicionIva' => ['nullable', Rule::in(CondicionIva::valores())],
            'direccion' => ['nullable', 'string', 'max:200'],
            'localidad' => ['nullable', 'string', 'max:120'],
            'telefono' => ['nullable', 'string', 'max:60'],
            'email' => ['nullable', 'string', 'max:160'],
            'descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'vendedorId' => ['nullable', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'ctaCteHabilitada' => ['nullable', 'boolean'],
            'limiteCredito' => ['nullable', 'numeric', 'min:0'],
            'diasPlazo' => ['nullable', 'integer', 'min:0'],
            'observaciones' => ['nullable', 'string', 'max:2000'],
            'activo' => ['nullable', 'boolean'],
            'listas' => ['nullable', 'array'],
            'listas.*' => ['integer'],
        ];
    }
}
