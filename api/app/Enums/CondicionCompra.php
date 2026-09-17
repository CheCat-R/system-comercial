<?php

namespace App\Enums;

enum CondicionCompra: string
{
    case Factura = 'factura';
    case Liquidacion = 'liquidacion';
    case Mixto = 'mixto';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
