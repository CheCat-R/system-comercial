<?php

namespace App\Enums;

enum OrigenPrecio: string
{
    case Inicial = 'inicial';
    case Costo = 'costo';
    case FormatoCompra = 'formato_compra';
    case FormatoVenta = 'formato_venta';
    case Activacion = 'activacion';
    case Reversion = 'reversion';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
