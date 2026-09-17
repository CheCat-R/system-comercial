<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Transferencia extends Model
{
    protected $table = 'transferencias';

    protected $fillable = ['codigo', 'fecha', 'origen_id', 'destino_id', 'usuario_id', 'estado', 'observaciones', 'enteros_listo', 'granel_listo'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'enteros_listo' => 'boolean',
            'granel_listo' => 'boolean',
            'estado' => \App\Enums\EstadoTransferencia::class,
        ];
    }

    public function origen(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class, 'origen_id');
    }

    public function destino(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class, 'destino_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(TransferenciaItem::class);
    }

    public function historial(): HasMany
    {
        return $this->hasMany(TransferenciaHist::class)->orderBy('id');
    }
}
