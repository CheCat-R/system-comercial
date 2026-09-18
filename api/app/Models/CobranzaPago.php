<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CobranzaPago extends Model
{
    protected $table = 'cobranza_pagos';

    public $timestamps = false;

    protected $fillable = ['cobranza_id', 'medio', 'importe', 'referencia'];

    protected function casts(): array
    {
        return [
            'importe' => 'float',
        ];
    }
}
