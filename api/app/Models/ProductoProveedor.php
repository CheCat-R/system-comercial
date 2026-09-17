<?php

namespace App\Models;

use App\Enums\ModoCosto;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * FORMATO DE COMPRA: cómo un proveedor vende un producto (caja x12 a $X con
 * descuentos y flete). Un producto puede tener varios; el que tiene
 * `usar_para_precio` es el ACTIVO y fija costo y precios.
 */
class ProductoProveedor extends Model
{
    protected $table = 'producto_proveedores';

    protected $fillable = [
        'producto_id', 'proveedor_id', 'cantidad', 'costo', 'descuento', 'descuento2', 'descuento3', 'descuento4',
        'flete', 'modo_costo', 'costo_final', 'porc_sin_factura', 'usar_para_precio', 'codigo_proveedor',
    ];

    protected function casts(): array
    {
        return [
            'modo_costo' => ModoCosto::class,
            'usar_para_precio' => 'boolean',
            'cantidad' => 'float',
            'costo' => 'float',
            'descuento' => 'float',
            'descuento2' => 'float',
            'descuento3' => 'float',
            'descuento4' => 'float',
            'flete' => 'float',
            'costo_final' => 'float',
            'porc_sin_factura' => 'float',
        ];
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }

    public function proveedor(): BelongsTo
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function costos(): HasMany
    {
        return $this->hasMany(ProductoProveedorCosto::class)->orderByDesc('fecha');
    }
}
