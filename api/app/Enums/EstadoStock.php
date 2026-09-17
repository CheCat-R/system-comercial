<?php

namespace App\Enums;

enum EstadoStock: string
{
    case Disponible = 'disponible';
    case Comprometido = 'comprometido';
    case Retenido = 'retenido';
    case Defectuoso = 'defectuoso';
    case Vencido = 'vencido';
    case EnTransito = 'en_transito';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
