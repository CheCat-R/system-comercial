<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OfertaComponente extends Model
{
    protected $table = 'oferta_componentes';

    public $timestamps = false;

    protected $fillable = ['oferta_id', 'producto_id', 'cantidad'];

    protected function casts(): array
    {
        return [
            'cantidad' => 'float',
        ];
    }
}
