<?php

namespace App\Auth;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Usuario;

/**
 * EL RELEVO DE CAJA: quién está físicamente en la registradora cuando no es
 * el de la sesión ("la cajera se ausenta, cobra el repositor"). El POS manda
 * `operadorId`; acá se valida que exista, esté activo y esté habilitado como
 * relevo. Sin operador, firma el usuario de la sesión.
 */
final class Operador
{
    public static function resolver(?int $operadorId, int $usuarioSesion): int
    {
        if (! $operadorId || $operadorId === $usuarioSesion) {
            return $usuarioSesion;
        }
        $u = Usuario::query()->find($operadorId);
        if (! $u || ! $u->activo) {
            throw new ErrorDeNegocio('El operador de relevo no existe o está dado de baja.');
        }
        if (! $u->relevo_caja) {
            throw new ErrorDeNegocio($u->nombre.' no está habilitado como relevo de caja (Gerencia › Usuarios).');
        }

        return $u->id;
    }
}
