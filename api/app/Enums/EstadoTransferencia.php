<?php

namespace App\Enums;

enum EstadoTransferencia: string
{
    case Borrador = 'borrador';
    case Pendiente = 'pendiente';
    case Preparada = 'preparada';
    case Transito = 'transito';
    case Recibida = 'recibida';
    case Cancelada = 'cancelada';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
