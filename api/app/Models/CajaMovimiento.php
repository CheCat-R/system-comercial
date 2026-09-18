<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CajaMovimiento extends Model
{
    protected $table = 'caja_movimientos';

    public $timestamps = false;

    protected $fillable = ['caja_sesion_id', 'fecha', 'tipo', 'motivo', 'importe', 'usuario_id'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'importe' => 'float',
        ];
    }
}
