<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ListaVenta extends Model
{
    protected $table = 'listas_venta';

    protected $fillable = ['modalidad_id', 'numero', 'nombre', 'orden', 'activa'];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
        ];
    }

    public function modalidad(): BelongsTo
    {
        return $this->belongsTo(ModalidadVenta::class, 'modalidad_id');
    }
}
