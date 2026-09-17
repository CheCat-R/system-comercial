<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Etiqueta extends Model
{
    protected $table = 'etiquetas';

    protected $fillable = ['nombre', 'color', 'activa'];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
        ];
    }
}
