<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Oferta extends Model
{
    protected $table = 'ofertas';

    protected $fillable = ['nombre', 'tipo', 'porcentaje', 'precio', 'lleva', 'paga', 'monto_minimo', 'desde', 'hasta', 'dias', 'sucursales', 'medios_pago', 'listas', 'incluye_fraccionados', 'activa'];

    protected function casts(): array
    {
        return [
            'porcentaje' => 'float',
            'precio' => 'float',
            'lleva' => 'float',
            'paga' => 'float',
            'monto_minimo' => 'float',
            'desde' => 'datetime',
            'hasta' => 'datetime',
            'incluye_fraccionados' => 'boolean',
            'activa' => 'boolean',
        ];
    }
}
