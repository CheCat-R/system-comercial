<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Presupuesto extends Model
{
    protected $table = 'presupuestos';

    protected $fillable = ['codigo', 'fecha', 'cliente_id', 'sucursal_id', 'usuario_id', 'vendedor_id', 'estado', 'entrega', 'vencimiento', 'venta_id', 'reservado', 'origen', 'web_cliente', 'observaciones', 'subtotal_neto', 'iva_total', 'total'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'vencimiento' => 'datetime',
            'reservado' => 'boolean',
            'web_cliente' => 'array',
            'subtotal_neto' => 'float',
            'iva_total' => 'float',
            'total' => 'float',
        ];
    }
}
