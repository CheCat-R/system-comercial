<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Vencimiento extends Model
{
    protected $table = 'vencimientos';

    protected $fillable = [
        'producto_id', 'presentacion_id', 'sucursal_id', 'sesion_id', 'fecha_vencimiento', 'cantidad',
        'costo_unitario', 'nombre', 'unidad', 'codigo_barras', 'observaciones', 'unidades_vendidas',
        'procesado', 'procesado_en', 'merma_movimiento_id', 'oferta_id', 'usuario_id',
    ];

    protected function casts(): array
    {
        return [
            'fecha_vencimiento' => 'date:Y-m-d',
            'cantidad' => 'float',
            'costo_unitario' => 'float',
            'unidades_vendidas' => 'float',
            'procesado' => 'boolean',
            'procesado_en' => 'datetime',
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
}
