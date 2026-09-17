<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReglaMarca extends Model
{
    protected $table = 'reglas_marca';

    protected $fillable = ['marca_id', 'unidades_minimas', 'modalidad_id', 'activa'];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
        ];
    }

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class);
    }

    public function modalidad(): BelongsTo
    {
        return $this->belongsTo(ModalidadVenta::class, 'modalidad_id');
    }
}
