<?php

namespace App\Enums;

enum CondicionIva: string
{
    case ResponsableInscripto = 'responsable_inscripto';
    case Monotributo = 'monotributo';
    case ConsumidorFinal = 'consumidor_final';
    case Exento = 'exento';
    case NoCategorizado = 'no_categorizado';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
