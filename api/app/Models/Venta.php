<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Venta extends Model
{
    protected $table = 'ventas';

    protected $fillable = ['tipo', 'punto_venta', 'numero', 'fecha', 'cliente_id', 'sucursal_id', 'usuario_id', 'caja_sesion_id', 'estado', 'condicion_pago', 'vencimiento_pago', 'presupuesto_id', 'lista_precio', 'subtotal_neto', 'descuento_total', 'iva_total', 'total', 'cae', 'cae_vencimiento', 'facturar_pendiente', 'facturar_motivo', 'facturar_cbte_nro', 'facturar_cbte_tipo', 'ref_venta_id', 'observaciones', 'anulado_por', 'anulado_en', 'anulado_motivo', 'cobrado_por'];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'vencimiento_pago' => 'datetime',
            'cae_vencimiento' => 'datetime',
            'anulado_en' => 'datetime',
            'facturar_pendiente' => 'boolean',
            'subtotal_neto' => 'float',
            'descuento_total' => 'float',
            'iva_total' => 'float',
            'total' => 'float',
        ];
    }
}
