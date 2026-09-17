<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransferenciaItem extends Model
{
    protected $table = 'transferencia_items';

    public $timestamps = false;

    protected $fillable = ['transferencia_id', 'producto_id', 'presentacion_id', 'cantidad', 'cantidad_preparada', 'cantidad_recibida', 'agregado', 'motivo', 'costo_unitario'];

    protected function casts(): array
    {
        return [
            'agregado' => 'boolean',
        ];
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }

    public function presentacion(): BelongsTo
    {
        return $this->belongsTo(Presentacion::class);
    }
}
