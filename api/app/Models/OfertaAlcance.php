<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OfertaAlcance extends Model
{
    protected $table = 'oferta_alcances';

    public $timestamps = false;

    protected $fillable = ['oferta_id', 'tipo', 'ref_id'];
}
