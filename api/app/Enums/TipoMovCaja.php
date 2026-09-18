<?php

namespace App\Enums;

enum TipoMovCaja: string
{
    case Ingreso = 'ingreso';
    case Egreso = 'egreso';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
