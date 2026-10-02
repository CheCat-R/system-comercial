<?php

namespace App\Auth;

use Illuminate\Support\Str;

/**
 * EL NOMBRE COMO USUARIO DE ENTRADA.
 *
 * Quien entra al sistema ESCRIBE su nombre de usuario. Para que "María  Pérez",
 * "maria perez" y "MARÍA PÉREZ" sean la misma persona —y no una pantalla que
 * rechaza por una tilde o un espacio de más—, la comparación se hace sobre
 * esta forma normalizada: sin mayúsculas, sin acentos y con los espacios
 * colapsados.
 *
 * Se normaliza acá, en PHP, y no con la collation de la base: así no depende
 * de cómo se haya creado cada MySQL de cada cliente (una collation binaria
 * rompería el login en silencio) y se puede probar sin base.
 *
 * La misma forma se usa para exigir que no haya dos usuarios con el mismo
 * nombre: si los hubiera, el login no sabría a cuál de los dos dejar entrar.
 */
final class NombreUsuario
{
    public static function normalizar(string $nombre): string
    {
        $limpio = preg_replace('/\s+/u', ' ', trim($nombre)) ?? '';

        return Str::lower(Str::ascii($limpio));
    }
}
