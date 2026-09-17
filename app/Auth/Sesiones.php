<?php

namespace App\Auth;

use App\Models\SesionToken;
use App\Models\Sucursal;
use App\Models\Usuario;
use Illuminate\Support\Str;

/**
 * EL ALMACÉN DE SESIONES, sobre los tokens de Sanctum.
 *
 * El token que viaja al cliente es aleatorio; en la base queda sólo su sha256
 * (lo hace Sanctum). Vence por INACTIVIDAD: `expires_at` se corre hacia
 * adelante con el uso, pero sólo cuando queda menos de la mitad de la ventana,
 * para no escribir en cada request (el POS hace varias por venta).
 */
final class Sesiones
{
    public static function horasVida(): int
    {
        return max(1, (int) config('checat.sesion_inactividad_horas', 12));
    }

    /** Crea la sesión y devuelve el token EN CLARO — la única vez que existe. */
    public static function crear(Usuario $usuario, Sucursal $sucursal, string $userAgent = ''): string
    {
        $nuevo = $usuario->createToken('sesion', ['*'], now()->addHours(self::horasVida()));
        $nuevo->accessToken->forceFill([
            'sucursal_id' => $sucursal->id,
            'user_agent' => Str::limit($userAgent, 300, ''),
        ])->save();

        return $nuevo->plainTextToken;
    }

    /**
     * Regla de validez que Sanctum consulta en cada request (ver AppServiceProvider):
     *  - vencida → se borra en el momento (no acumular basura);
     *  - usuario desactivado → TODAS sus sesiones dejan de servir YA
     *    ("se fue el empleado y quedó una pestaña abierta en la sucursal");
     *  - si queda menos de media ventana, se estira.
     */
    public static function validar(SesionToken $token, bool $valida): bool
    {
        if (! $valida) {
            if ($token->expires_at && $token->expires_at->isPast()) {
                $token->delete();
            }

            return false;
        }

        $usuario = $token->tokenable;
        if (! $usuario instanceof Usuario || ! $usuario->activo) {
            $usuario?->tokens()->delete();

            return false;
        }

        $horas = self::horasVida();
        if ($token->expires_at && $token->expires_at->diffInMinutes(now(), true) < ($horas * 60) / 2) {
            // Sanctum ya hace un save() por request para `last_used_at`: se cuelga de ese mismo write.
            $token->expires_at = now()->addHours($horas);
        }

        return true;
    }

    /** Mueve la sucursal DE ESTA SESIÓN (el jefe cambia desde el encabezado). */
    public static function moverSucursal(int $tokenId, int $sucursalId): void
    {
        SesionToken::query()->whereKey($tokenId)->update(['sucursal_id' => $sucursalId]);
    }

    /** Salir: mata ESTA sesión y no las otras (la tablet del local sigue abierta). */
    public static function cerrar(int $tokenId): void
    {
        SesionToken::query()->whereKey($tokenId)->delete();
    }

    /** Barrido de vencidas. Lo llama el login: no hace falta un cron para esto. */
    public static function limpiarVencidas(): void
    {
        SesionToken::query()->whereNotNull('expires_at')->where('expires_at', '<', now())->delete();
    }
}
