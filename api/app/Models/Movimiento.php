<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Movimiento extends Model
{
    protected $table = 'movimientos';

    public $timestamps = false;

    protected $fillable = ['fecha', 'tipo', 'producto_id', 'sucursal_id', 'presentacion_id', 'signo', 'cantidad', 'unidad', 'motivo', 'pres_label', 'estado_desde', 'estado_hacia', 'sucursal_destino_id', 'vencimiento', 'costo_unitario', 'proveedor_nombre', 'usuario_id', 'ref_transferencia_id', 'ref_incidencia_id', 'ref_conteo_id', 'descripcion'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'vencimiento' => 'datetime',
            'tipo' => \App\Enums\TipoMovimiento::class,
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

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class);
    }
}
