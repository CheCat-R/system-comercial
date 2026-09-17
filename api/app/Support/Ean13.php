<?php

namespace App\Support;

/** EAN-13: 12 dígitos + verificador. La serie interna usa prefijos 20–29 (reservados para uso interno). */
final class Ean13
{
    public const PREFIJOS_INTERNOS = ['29', '28', '27', '26', '25', '24', '23', '22', '21', '20'];

    public static function digitoVerificador(string $doce): int
    {
        $suma = 0;
        for ($i = 0; $i < 12; $i++) {
            $suma += (int) $doce[$i] * ($i % 2 ? 3 : 1);
        }

        return (10 - ($suma % 10)) % 10;
    }

    public static function esValido(mixed $codigo): bool
    {
        $c = trim((string) ($codigo ?? ''));
        if (! preg_match('/^\d{13}$/', $c)) {
            return false;
        }

        return self::digitoVerificador(substr($c, 0, 12)) === (int) $c[12];
    }

    public static function armar(string $prefijo, int $secuencia): string
    {
        $doce = $prefijo.str_pad((string) $secuencia, 10, '0', STR_PAD_LEFT);

        return $doce.self::digitoVerificador($doce);
    }

    public static function secuenciaDe(mixed $codigo, string $prefijo): ?int
    {
        $c = trim((string) ($codigo ?? ''));
        if (! preg_match('/^\d{13}$/', $c) || ! str_starts_with($c, $prefijo)) {
            return null;
        }

        return (int) substr($c, 2, 10);
    }
}
