<?php

namespace App\Http\Requests\Ventas;

use App\Enums\AlcanceOferta;
use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Enums\TipoOferta;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class NotaCreditoRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'motivo' => ['required', 'string', 'max:300'],
            'items' => ['nullable', 'array', 'max:500'],
            'items.*.itemId' => ['required', 'integer'],
            'items.*.cantidad' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'devuelveMercaderia' => ['nullable', 'boolean'],
            'devolverEfectivo' => ['nullable', 'boolean'],
        ];
    }
}
