<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Auditoria extends Model
{
    protected $table = 'auditoria';

    public $timestamps = false;

    protected $fillable = ['fecha', 'usuario_id', 'entidad', 'entidad_id', 'ambito', 'detalle', 'campo', 'antes', 'despues'];

    protected function casts(): array
    {
        return ['fecha' => 'datetime'];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class);
    }
}
