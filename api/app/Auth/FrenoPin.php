<?php

namespace App\Auth;

use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * FRENO DE INTENTOS DEL PIN DE RELEVO (0088).
 *
 * Mismo criterio que `FrenoLogin`, pero por usuario relevado y no por
 * usuario+IP: acá quien prueba YA tiene una sesión ajena abierta adelante
 * (la de la cajera titular), así que el freno es lo único entre él y firmar
 * con el nombre de otro. Un PIN de 4 a 6 dígitos sin freno se adivina
 * probando.
 */
final class FrenoPin
{
    private static function clave(int $usuarioId): string
    {
        return 'relevo-pin:'.$usuarioId;
    }

    /** Antes de verificar el PIN. 422 y no 429: no es el usuario el que pide de más, es un ataque. */
    public static function revisar(int $usuarioId): void
    {
        $clave = self::clave($usuarioId);
        if (RateLimiter::tooManyAttempts($clave, 5)) {
            throw ValidationException::withMessages([
                'pin' => 'Demasiados intentos fallidos: el PIN queda bloqueado unos minutos.',
            ]);
        }
    }

    public static function fallo(int $usuarioId): void
    {
        RateLimiter::hit(self::clave($usuarioId), 5 * 60);
    }

    public static function exito(int $usuarioId): void
    {
        RateLimiter::clear(self::clave($usuarioId));
    }
}
