<?php

namespace App\Enums;

enum ModoCosto: string
{
    case Lista = 'lista';
    case Final = 'final';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
