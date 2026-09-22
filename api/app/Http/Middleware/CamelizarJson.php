<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Red de seguridad: convierte a camelCase cualquier clave snake_case que se
 * escape en una respuesta JSON, y suma alias español↔inglés para los
 * timestamps de Eloquent (ver `ALIAS_TIMESTAMPS` más abajo).
 *
 * EL PROBLEMA REAL: el panel se escribió contra crm-api (NestJS + Drizzle),
 * que devuelve camelCase SIEMPRE porque Drizzle lo mapea automáticamente
 * desde las columnas de Postgres. Acá no hay ese mapeo automático: la mayoría
 * de los servicios arman el array a mano con las claves bien puestas, pero
 * varios devuelven filas de `DB::table(...)->get()` TAL CUAL — `sucursal_id`
 * en vez de `sucursalId` — y esa fila viaja rota hasta el componente de React
 * que lee `fila.sucursalId` y encuentra `undefined`. Encontrado así en
 * `IncidenciasService::listar()` y `ConteosService::listar()`; hay ~35 sitios
 * más con el mismo patrón sin auditar uno por uno.
 *
 * En vez de perseguir cada sitio (y confiar en que el próximo que se escriba
 * se acuerde de alias-ear cada columna), esto lo arregla UNA sola vez en el
 * borde de salida. Para el código que YA devuelve camelCase a mano, es un
 * no-op: la clave no tiene `_seguido-de-minúscula` y sale intacta.
 *
 * Por qué es seguro camelizar CIEGO:
 *  - Solo toca CLAVES de arrays asociativos, nunca valores — un string como
 *    "gerencia.usuarios" (permiso) o "2026-09" (período) no se toca.
 *  - Los arrays de lista (`array_is_list`) se recorren sin tocar índices.
 *  - Las claves compuestas del código (ej. `"$productoId:$presId"`) usan `:`,
 *    no `_`, así que no matchean.
 *  - Nunca corre sobre binarios: solo actúa si la respuesta es `JsonResponse`
 *    (los adjuntos/respaldos/imágenes se sirven como `Response` crudo).
 */
class CamelizarJson
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response instanceof JsonResponse) {
            $response->setData(self::camelizar($response->getData(true)));
        }

        return $response;
    }

    /**
     * `created_at`/`updated_at` son los timestamps AUTOMÁTICOS de Eloquent
     * (`$table->timestamps()`), en inglés. crm-api-main —de donde salió el
     * contrato que sigue el panel— nombra esos mismos dos campos en español
     * (`creado_en`/`actualizado_en`) en CASI todas sus tablas: son las que
     * llegan hasta una pantalla. Las dos excepciones que tiene (`arca_tokens`,
     * `configuracion`) son filas puramente internas que el panel nunca lee
     * directo, así que la regla univesal de acá abajo no las toca en la
     * práctica. En vez de renombrar la columna real (una migración por
     * tabla, y esto ya se escribe en inglés en el resto del código Laravel),
     * se AGREGA el alias en español al lado del original — así sirve
     * cualquiera de los dos nombres que lea el componente, sin romper nada
     * que ya dependa de `createdAt`/`updatedAt`.
     */
    private const ALIAS_TIMESTAMPS = [
        'createdAt' => 'creadoEn',
        'updatedAt' => 'actualizadoEn',
    ];

    private static function camelizar(mixed $valor): mixed
    {
        if (! is_array($valor)) {
            return $valor;
        }

        if (array_is_list($valor)) {
            return array_map(self::camelizar(...), $valor);
        }

        $out = [];
        foreach ($valor as $clave => $v) {
            $claveNueva = is_string($clave)
                ? preg_replace_callback('/_([a-z0-9])/', fn ($m) => strtoupper($m[1]), $clave)
                : $clave;
            $out[$claveNueva] = self::camelizar($v);
        }

        foreach (self::ALIAS_TIMESTAMPS as $origen => $alias) {
            if (array_key_exists($origen, $out) && ! array_key_exists($alias, $out)) {
                $out[$alias] = $out[$origen];
            }
        }

        return $out;
    }
}
