<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VentaItem extends Model
{
    protected $table = 'venta_items';

    public $timestamps = false;

    protected $fillable = ['venta_id', 'producto_id', 'presentacion_id', 'cantidad', 'lista_id', 'lista', 'lista_origen', 'precio_lista', 'descuento', 'precio_unitario', 'iva', 'oferta_id', 'oferta', 'oferta_descuento', 'descuento_id', 'descuento_nombre', 'descuento_base', 'subtotal', 'costo_unitario', 'iva_absorbido_unitario', 'porc_sin_factura', 'ref_item_id'];

    protected function casts(): array
    {
        return [
            'cantidad' => 'float',
            'precio_lista' => 'float',
            'descuento' => 'float',
            'precio_unitario' => 'float',
            'iva' => 'float',
            'oferta_descuento' => 'float',
            'descuento_base' => 'float',
            'subtotal' => 'float',
            'costo_unitario' => 'float',
            'iva_absorbido_unitario' => 'float',
            'porc_sin_factura' => 'float',
        ];
    }
}
