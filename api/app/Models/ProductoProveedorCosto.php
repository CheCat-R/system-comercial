<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductoProveedorCosto extends Model
{
    protected $table = 'producto_proveedor_costos';

    public $timestamps = false;

    protected $fillable = ['producto_proveedor_id', 'fecha', 'costo_anterior', 'descuento_anterior', 'flete_anterior', 'costo', 'descuento', 'flete', 'origen', 'activo_anterior', 'activo_nuevo', 'motivo', 'lote', 'usuario_id', 'comprobante_id'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'origen' => \App\Enums\OrigenCosto::class,
        ];
    }

    public function formato(): BelongsTo
    {
        return $this->belongsTo(ProductoProveedor::class, 'producto_proveedor_id');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class);
    }
}
