<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProveedorArticulo extends Model
{
    protected $table = 'proveedor_articulos';

    protected $fillable = ['proveedor_id', 'codigo', 'producto_id', 'descripcion'];

    protected function casts(): array
    {
        return [];
    }

    public function proveedor(): BelongsTo
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }
}
