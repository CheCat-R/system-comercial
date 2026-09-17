<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConteoItem extends Model
{
    protected $table = 'conteo_items';

    public $timestamps = false;

    protected $fillable = ['conteo_id', 'producto_id', 'presentacion_id', 'nombre', 'pres_label', 'unidad', 'contado', 'virtual_al_contar', 'contado_por', 'contado_en', 'recontar'];

    protected function casts(): array
    {
        return [
            'recontar' => 'boolean',
            'contado_en' => 'datetime',
        ];
    }

    public function conteo(): BelongsTo
    {
        return $this->belongsTo(Conteo::class);
    }
}
