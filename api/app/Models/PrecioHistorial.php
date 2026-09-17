<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrecioHistorial extends Model
{
    protected $table = 'precio_historial';

    public $timestamps = false;

    protected $fillable = ['producto_id', 'lista_id', 'fecha', 'precio_anterior', 'precio', 'origen', 'detalle', 'usuario_id'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'origen' => \App\Enums\OrigenPrecio::class,
        ];
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }

    public function lista(): BelongsTo
    {
        return $this->belongsTo(ListaVenta::class, 'lista_id');
    }
}
