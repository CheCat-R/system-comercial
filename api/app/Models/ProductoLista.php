<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductoLista extends Model
{
    protected $table = 'producto_listas';

    protected $fillable = ['producto_id', 'presentacion_id', 'lista_id', 'unidades', 'codigo_barras', 'modo_precio', 'markup', 'precio_fijo', 'unidades_minimas'];

    protected function casts(): array
    {
        return [
            'modo_precio' => \App\Enums\ModoPrecio::class,
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

    public function lista(): BelongsTo
    {
        return $this->belongsTo(ListaVenta::class, 'lista_id');
    }
}
