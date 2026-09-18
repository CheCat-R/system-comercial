<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CobranzaImputacion extends Model
{
    protected $table = 'cobranza_imputaciones';

    public $timestamps = false;

    protected $fillable = ['cobranza_id', 'venta_id', 'importe'];

    protected function casts(): array
    {
        return [
            'importe' => 'float',
        ];
    }
}
