<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conteo extends Model
{
    protected $table = 'conteos';

    protected $fillable = ['sucursal_id', 'nombre', 'alcance', 'ciego', 'estado', 'usuario_id', 'cerrado_en', 'aplicado_en', 'aplicado_por'];

    protected function casts(): array
    {
        return [
            'ciego' => 'boolean',
            'cerrado_en' => 'datetime',
            'aplicado_en' => 'datetime',
            'estado' => \App\Enums\EstadoConteo::class,
        ];
    }

    public function sucursal(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ConteoItem::class);
    }
}
