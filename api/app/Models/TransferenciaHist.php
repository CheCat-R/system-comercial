<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransferenciaHist extends Model
{
    protected $table = 'transferencia_hist';

    public $timestamps = false;

    protected $fillable = ['transferencia_id', 'estado', 'fecha', 'usuario_id'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'estado' => \App\Enums\EstadoTransferencia::class,
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class);
    }
}
