<?php

namespace App\Enums;

enum EstadoCaja: string
{
    case Abierta = 'abierta';
    case Cerrada = 'cerrada';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
