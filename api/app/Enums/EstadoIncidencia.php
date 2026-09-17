<?php

namespace App\Enums;

enum EstadoIncidencia: string
{
    case Pendiente = 'pendiente';
    case Revision = 'revision';
    case Resuelta = 'resuelta';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
