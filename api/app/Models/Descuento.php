<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Descuento extends Model
{
    protected $table = 'descuentos';

    protected $fillable = ['nombre', 'porcentaje', 'vence', 'medio_pago', 'lista_id', 'sucursal_id', 'requiere_admin', 'activo'];

    protected function casts(): array
    {
        return [
            'porcentaje' => 'float',
            'vence' => 'datetime',
            'requiere_admin' => 'boolean',
            'activo' => 'boolean',
        ];
    }
}
