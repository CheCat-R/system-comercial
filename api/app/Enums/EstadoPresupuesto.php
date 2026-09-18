<?php

namespace App\Enums;

enum EstadoPresupuesto: string
{
    case Borrador = 'borrador';
    case Enviado = 'enviado';
    case Confirmado = 'confirmado';
    case Cerrado = 'cerrado';
    case Cancelado = 'cancelado';
    case Pendiente = 'pendiente';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
