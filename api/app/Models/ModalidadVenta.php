<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ModalidadVenta extends Model
{
    protected $table = 'modalidades_venta';

    protected $fillable = ['nombre', 'orden', 'activa'];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
        ];
    }

    public function listas(): HasMany
    {
        return $this->hasMany(ListaVenta::class, 'modalidad_id')->orderBy('numero');
    }
}
