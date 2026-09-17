<?php

namespace App\Auth;

use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

/**
 * FRENO DE INTENTOS DEL LOGIN.
 *
 * DOS CONTADORES, porque son dos ataques distintos:
 *  - por USUARIO **Y ORIGEN** — alguien machacando la cuenta de Lucas. Lleva
 *    la IP en la clave a propósito: si el contador fuera global, cinco intentos
 *    desde internet dejarían al dueño afuera un lunes a la mañana con la caja
 *    sin abrir. Cada origen gasta su propio cupo.
 *  - por IP — alguien probando la misma clave contra todos los usuarios.
 *
 * Sólo cuentan los intentos FALLIDOS y el login exitoso limpia el del usuario.
 * Usa el RateLimiter de Laravel sobre el cache (file en hosting compartido).
 */
final class FrenoLogin
{
    private static function claveUsuario(mixed $usuarioId, string $ip): string
    {
        return 'login:u:'.$usuarioId.'@'.$ip;
    }

    private static function claveIp(string $ip): string
    {
        return 'login:ip:'.$ip;
    }

    private static function esperaSegundos(): int
    {
        return max(60, (int) config('checat.login.espera_minutos', 5) * 60);
    }

    /** Antes de verificar la contraseña. Lanza 429 si está frenado. */
    public static function revisar(mixed $usuarioId, string $ip): void
    {
        $pares = [
            [self::claveUsuario($usuarioId, $ip), (int) config('checat.login.tope_usuario', 5)],
            [self::claveIp($ip), (int) config('checat.login.tope_ip', 20)],
        ];
        foreach ($pares as [$clave, $tope]) {
            if (RateLimiter::tooManyAttempts($clave, $tope)) {
                $min = (int) ceil(RateLimiter::availableIn($clave) / 60);
                throw new TooManyRequestsHttpException(
                    RateLimiter::availableIn($clave),
                    'Demasiados intentos fallidos. Probá de nuevo en '.$min.' minuto'.($min === 1 ? '' : 's').'.',
                );
            }
        }
    }

    /** Contraseña incorrecta (o usuario inexistente/desactivado): suma y estira la espera. */
    public static function fallo(mixed $usuarioId, string $ip): void
    {
        // La ventana se corre en cada fallo: probar uno cada 4 minutos para siempre no esquiva el tope.
        RateLimiter::hit(self::claveUsuario($usuarioId, $ip), self::esperaSegundos());
        RateLimiter::hit(self::claveIp($ip), self::esperaSegundos());
    }

    /** Entró bien: la dupla usuario+origen queda limpia (la IP no, por las dudas). */
    public static function exito(mixed $usuarioId, string $ip): void
    {
        RateLimiter::clear(self::claveUsuario($usuarioId, $ip));
    }
}
