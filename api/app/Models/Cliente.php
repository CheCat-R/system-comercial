<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cliente extends Model
{
    protected $table = 'clientes';

    protected $fillable = ['nombre', 'nombre_fantasia', 'tipo_doc', 'numero_doc', 'condicion_iva', 'direccion', 'localidad', 'telefono', 'email', 'descuento', 'vendedor_id', 'sucursal_id', 'cta_cte_habilitada', 'limite_credito', 'dias_plazo', 'observaciones', 'activo', 'es_consumidor_final'];

    protected function casts(): array
    {
        return [
            'descuento' => 'float',
            'limite_credito' => 'float',
            'dias_plazo' => 'integer',
            'cta_cte_habilitada' => 'boolean',
            'activo' => 'boolean',
            'es_consumidor_final' => 'boolean',
        ];
    }
}
