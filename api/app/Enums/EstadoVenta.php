<?php

namespace App\Enums;

enum EstadoVenta: string
{
    case Borrador = 'borrador';
    case Confirmada = 'confirmada';
    case Anulada = 'anulada';
    case PendienteCae = 'pendiente_cae';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
