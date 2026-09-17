<?php

namespace App\Enums;

enum TipoProducto: string
{
    case Granel = 'granel';
    case Entero = 'entero';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
