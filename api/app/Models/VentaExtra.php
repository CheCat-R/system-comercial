<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VentaExtra extends Model
{
    protected $table = 'venta_extras';

    public $timestamps = false;

    protected $fillable = ['venta_id', 'concepto', 'importe', 'iva'];

    protected function casts(): array
    {
        return [
            'importe' => 'float',
            'iva' => 'float',
        ];
    }
}
