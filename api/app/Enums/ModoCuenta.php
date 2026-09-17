<?php

namespace App\Enums;

enum ModoCuenta: string
{
    case Facturas = 'facturas';
    case Libre = 'libre';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
