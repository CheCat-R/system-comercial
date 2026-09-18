<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CajaSesion extends Model
{
    protected $table = 'caja_sesiones';

    protected $fillable = ['sucursal_id', 'usuario_id', 'apertura', 'monto_inicial', 'cierre', 'declarado_efectivo', 'sistema_efectivo', 'diferencia', 'totales', 'estado', 'observaciones'];

    protected function casts(): array
    {
        return [
            'apertura' => 'datetime',
            'cierre' => 'datetime',
            'monto_inicial' => 'float',
            'declarado_efectivo' => 'float',
            'sistema_efectivo' => 'float',
            'diferencia' => 'float',
            'totales' => 'array',
        ];
    }
}
