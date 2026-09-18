<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CajaControl extends Model
{
    protected $table = 'caja_controles';

    public $timestamps = false;

    protected $fillable = ['caja_sesion_id', 'fecha', 'esperado_efectivo', 'contado_efectivo', 'diferencia', 'observaciones', 'usuario_id'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'esperado_efectivo' => 'float',
            'contado_efectivo' => 'float',
            'diferencia' => 'float',
        ];
    }
}
