<?php

namespace App\Models;

use App\Enums\EstadoStock;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una fila por Producto × Sucursal × Presentación × Estado. Las escrituras
 * pasan por el motor de inventario, nunca directo desde un controlador.
 */
class Stock extends Model
{
    protected $table = 'stock';

    protected $fillable = ['producto_id', 'sucursal_id', 'presentacion_id', 'estado', 'cantidad'];

    protected $hidden = ['presentacion_key'];

    protected function casts(): array
    {
        return [
            'estado' => EstadoStock::class,
            'cantidad' => 'float',
        ];
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }

    public function sucursal(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class);
    }

    public function presentacion(): BelongsTo
    {
        return $this->belongsTo(Presentacion::class);
    }
}
