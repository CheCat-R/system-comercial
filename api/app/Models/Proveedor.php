<?php

namespace App\Models;

use App\Enums\CondicionCompra;
use App\Enums\CondicionIva;
use App\Enums\LetraComprobante;
use App\Enums\MedioHabitual;
use App\Enums\ModoCuenta;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Proveedor extends Model
{
    protected $table = 'proveedores';

    protected $fillable = [
        'nombre', 'cuit', 'condicion_iva', 'direccion', 'telefono', 'email',
        'provee_mercaderia', 'provee_gastos', 'letra_gasto', 'condicion_compra', 'porc_sin_factura',
        'medio_habitual', 'dias_pago', 'modo_cuenta', 'conciliado_hasta', 'conciliado_por', 'conciliado_at',
        'productos_esperados', 'migracion_lista',
    ];

    protected function casts(): array
    {
        return [
            'condicion_iva' => CondicionIva::class,
            'letra_gasto' => LetraComprobante::class,
            'condicion_compra' => CondicionCompra::class,
            'medio_habitual' => MedioHabitual::class,
            'modo_cuenta' => ModoCuenta::class,
            'provee_mercaderia' => 'boolean',
            'provee_gastos' => 'boolean',
            'migracion_lista' => 'boolean',
            'porc_sin_factura' => 'float',
            'conciliado_hasta' => 'datetime',
            'conciliado_at' => 'datetime',
        ];
    }

    public function formatos(): HasMany
    {
        return $this->hasMany(ProductoProveedor::class);
    }

    public function articulos(): HasMany
    {
        return $this->hasMany(ProveedorArticulo::class);
    }

    /** ¿Su factura discrimina IVA? Un monotributista o exento no lo hace. */
    public function discriminaIva(): bool
    {
        return $this->condicion_iva === CondicionIva::ResponsableInscripto;
    }
}
