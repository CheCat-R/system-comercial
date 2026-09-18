<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PresupuestoItem extends Model
{
    protected $table = 'presupuesto_items';

    public $timestamps = false;

    protected $fillable = ['presupuesto_id', 'producto_id', 'presentacion_id', 'nombre', 'detalle', 'cantidad', 'cantidad_armada', 'precio_lista', 'descuento', 'iva', 'lista', 'lista_id', 'oferta_nombre', 'motivo'];

    protected function casts(): array
    {
        return [
            'cantidad' => 'float',
            'cantidad_armada' => 'float',
            'precio_lista' => 'float',
            'descuento' => 'float',
            'iva' => 'float',
        ];
    }
}
