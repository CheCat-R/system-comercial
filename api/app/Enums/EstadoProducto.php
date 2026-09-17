<?php

namespace App\Enums;

enum EstadoProducto: string
{
    case Activo = 'activo';
    case Discontinuado = 'discontinuado';
    case Archivado = 'archivado';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
