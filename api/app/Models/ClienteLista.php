<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClienteLista extends Model
{
    protected $table = 'cliente_listas';

    public $timestamps = false;

    protected $fillable = ['cliente_id', 'lista_id'];
}
