<?php

namespace App\Enums;

enum TipoOferta: string
{
    case Porcentaje = 'porcentaje';
    case PrecioFijo = 'precio_fijo';
    case Nxm = 'nxm';
    case SegundaUnidad = 'segunda_unidad';
    case Pack = 'pack';
    case Combo = 'combo';
    case Ticket = 'ticket';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
