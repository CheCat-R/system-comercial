<?php

namespace App\Support;

use Illuminate\Http\Middleware\TrustProxies;

/**
 * EN QUÉ PROXIES SE CONFÍA PARA SABER LA IP DE QUIEN LLAMA.
 * ============================================================================
 * Si la API corre detrás de un proxy (Traefik, nginx, Cloudflare) y Laravel no
 * sabe cuál es, `$request->ip()` devuelve SIEMPRE la IP del proxy: todos los
 * pedidos parecen venir de la misma máquina. Con eso el freno del login cuenta
 * "por IP" para todo internet junto — 20 intentos fallidos de un anónimo dejan
 * afuera a todos los empleados — y la auditoría guarda una IP que no es de nadie.
 *
 * `TRUSTED_PROXIES` del .env: vacío (la API recibe a los clientes directo),
 * una lista de IPs o redes separadas por coma (`10.0.0.2,172.16.0.0/12`), o `*`.
 * El `*` solo es seguro si la API NO se puede alcanzar sin pasar por el proxy:
 * si fuera alcanzable directo, cualquiera podría mandar un `X-Forwarded-For`
 * inventado y pasar por otra IP (saltearse el freno del login).
 */
final class ProxiesConfiables
{
    /** @return array<int, string>|string|null  lo que entiende `TrustProxies::at()`; null = no se confía en ninguno */
    public static function interpretar(?string $valor): array|string|null
    {
        $valor = trim((string) $valor);
        if ($valor === '') {
            return null;
        }
        if ($valor === '*') {
            return '*';
        }

        return array_values(array_filter(array_map('trim', explode(',', $valor))));
    }

    /** Se llama al arrancar la app. Sin valor, no toca nada (la API recibe a los clientes directo). */
    public static function aplicar(?string $valor): void
    {
        $proxies = self::interpretar($valor);
        if ($proxies !== null) {
            TrustProxies::at($proxies);
        }
    }
}