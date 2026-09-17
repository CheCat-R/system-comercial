<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Presentacion extends Model
{
    protected $table = 'presentaciones';

    protected $fillable = ['producto_id', 'tam_kg', 'codigo_barras'];

    protected function casts(): array
    {
        return [
            'tam_kg' => 'float',
        ];
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }

    /** Cómo se muestra el tamaño: "500 g" o "1,5 kg". */
    public function etiqueta(): string
    {
        $kg = (float) $this->tam_kg;

        return $kg < 1 ? round($kg * 1000).' g' : rtrim(rtrim(number_format($kg, 3, ',', ''), '0'), ',').' kg';
    }
}
