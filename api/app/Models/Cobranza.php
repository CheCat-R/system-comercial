<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cobranza extends Model
{
    protected $table = 'cobranzas';

    protected $fillable = ['punto_venta', 'numero', 'fecha', 'cliente_id', 'sucursal_id', 'usuario_id', 'caja_sesion_id', 'total', 'a_cuenta', 'estado', 'observaciones', 'anulado_por', 'anulado_en', 'anulado_motivo'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'anulado_en' => 'datetime',
            'total' => 'float',
            'a_cuenta' => 'float',
        ];
    }
}
