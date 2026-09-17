<?php

namespace App\Enums;

enum OrigenCosto: string
{
    case Alta = 'alta';
    case Manual = 'manual';
    case Masiva = 'masiva';
    case Recepcion = 'recepcion';
    case Reversion = 'reversion';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
