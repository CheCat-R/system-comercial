<?php

namespace App\Enums;

enum OrigenLista: string
{
    case Base = 'base';
    case Cliente = 'cliente';
    case Auto = 'auto';
    case Manual = 'manual';
    case Marca = 'marca';
    case Monto = 'monto';
    case Presupuesto = 'presupuesto';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
