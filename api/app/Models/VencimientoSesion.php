<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VencimientoSesion extends Model
{
    protected $table = 'vencimiento_sesiones';

    public $timestamps = false;

    protected $fillable = ['fecha', 'sucursal_id', 'usuario_id', 'total_items', 'total_unidades'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'total_unidades' => 'float',
        ];
    }

    public function sucursal(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class);
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class);
    }
}
