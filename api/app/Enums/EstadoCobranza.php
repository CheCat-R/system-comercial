<?php

namespace App\Enums;

enum EstadoCobranza: string
{
    case Confirmada = 'confirmada';
    case Anulada = 'anulada';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
