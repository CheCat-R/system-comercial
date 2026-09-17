<?php

namespace App\Enums;

enum MedioHabitual: string
{
    case Efectivo = 'efectivo';
    case Transferencia = 'transferencia';
    case Deposito = 'deposito';
    case Echeq = 'echeq';
    case CtaCte = 'cta_cte';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
