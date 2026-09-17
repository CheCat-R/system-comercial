<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Incidencia extends Model
{
    protected $table = 'incidencias';

    protected $fillable = ['codigo', 'fecha', 'tipo', 'estado', 'responsable_id', 'motivo', 'producto_id', 'sucursal_id', 'presentacion_id', 'cantidad', 'unidad', 'resolucion', 'fecha_resolucion', 'activa'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'fecha_resolucion' => 'datetime',
            'activa' => 'boolean',
            'estado' => \App\Enums\EstadoIncidencia::class,
        ];
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class);
    }

    public function sucursal(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class);
    }

    public function presentacion(): BelongsTo
    {
        return $this->belongsTo(Presentacion::class);
    }

    public function responsable(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'responsable_id');
    }
}
