<?php

namespace App\Enums;

enum LetraComprobante: string
{
    case A = 'A';
    case B = 'B';
    case C = 'C';
    case X = 'X';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
