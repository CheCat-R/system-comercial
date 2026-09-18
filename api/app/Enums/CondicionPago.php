<?php

namespace App\Enums;

enum CondicionPago: string
{
    case Contado = 'contado';
    case CuentaCorriente = 'cuenta_corriente';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
