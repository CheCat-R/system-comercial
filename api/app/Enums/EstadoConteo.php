<?php

namespace App\Enums;

enum EstadoConteo: string
{
    case EnCurso = 'en_curso';
    case Cerrado = 'cerrado';
    case Aplicado = 'aplicado';
    case Descartado = 'descartado';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
