<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatLectura extends Model
{
    protected $table = 'chat_lecturas';

    public $timestamps = false;

    protected $fillable = ['sucursal_id', 'usuario_id', 'canal_usuario_id', 'ultimo_mensaje_id'];

    protected function casts(): array
    {
        return [];
    }
}
