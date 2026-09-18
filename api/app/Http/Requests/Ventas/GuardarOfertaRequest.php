<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class GuardarOfertaRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:120'],
            'tipo' => ['required', Rule::in(TipoOferta::valores())],
            'porcentaje' => ['nullable', 'numeric'],
            'precio' => ['nullable', 'numeric'],
            'lleva' => ['nullable', 'numeric'],
            'paga' => ['nullable', 'numeric'],
            'montoMinimo' => ['nullable', 'numeric'],
            'desde' => ['nullable', 'string'],
            'hasta' => ['nullable', 'string'],
            'dias' => ['nullable', 'string', 'max:7'],
            'sucursales' => ['nullable', 'string', 'max:100'],
            'mediosPago' => ['nullable', 'string', 'max:200'],
            'listas' => ['nullable', 'string', 'max:100'],
            'incluyeFraccionados' => ['nullable', 'boolean'],
            'activa' => ['nullable', 'boolean'],
            'alcances' => ['nullable', 'array', 'max:500'],
            'alcances.*.tipo' => ['required', Rule::in(AlcanceOferta::valores())],
            'alcances.*.refId' => ['required', 'integer'],
            'componentes' => ['nullable', 'array', 'max:50'],
            'componentes.*.productoId' => ['required', 'integer'],
            'componentes.*.cantidad' => ['required', 'numeric', 'min:0'],
        ];
    }
}
