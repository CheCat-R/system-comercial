<?php

namespace App\Support;

/** Las alícuotas de IVA vigentes en Argentina. Cualquier otra es un error de carga. */
final class Iva
{
    public const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];

    public static function esValida(mixed $n): bool
    {
        if (! is_numeric($n)) {
            return false;
        }
        foreach (self::ALICUOTAS as $a) {
            if (abs((float) $n - $a) < 1e-9) {
                return true;
            }
        }

        return false;
    }

    public static function texto(): string
    {
        return implode(', ', self::ALICUOTAS);
    }
}
