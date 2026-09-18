<?php

namespace App\Enums;

enum TipoDoc: string
{
    case Cuit = 'cuit';
    case Cuil = 'cuil';
    case Dni = 'dni';
    case SinIdentificar = 'sin_identificar';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
