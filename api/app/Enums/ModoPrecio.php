<?php

namespace App\Enums;

enum ModoPrecio: string
{
    case Markup = 'markup';
    case Precio = 'precio';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
