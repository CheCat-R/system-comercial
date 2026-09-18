<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VentaPago extends Model
{
    protected $table = 'venta_pagos';

    public $timestamps = false;

    protected $fillable = ['venta_id', 'medio', 'importe', 'referencia'];

    protected function casts(): array
    {
        return [
            'importe' => 'float',
        ];
    }
}
