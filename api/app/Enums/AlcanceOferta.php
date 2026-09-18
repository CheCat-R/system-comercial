<?php

namespace App\Enums;

enum AlcanceOferta: string
{
    case Producto = 'producto';
    case Marca = 'marca';
    case Categoria = 'categoria';
    case Etiqueta = 'etiqueta';
    case Presentacion = 'presentacion';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
