<?php

namespace App\Services;

use App\Models\Configuracion;
use InvalidArgumentException;

/**
 * EL PLAN COMERCIAL de esta instalación (Emprendedor/Pymes/Corporativo) — lo define
 * CheCAT, no el cliente. A propósito vive separado de `ConfiguracionService`: esa
 * clase expone cada área por HTTP a quien tenga el permiso de esa área (ver
 * `ConfiguracionController::DUENO_DE_AREA`, que además cae a `gerencia.configuracion`
 * — el permiso que el Administrador del cliente SÍ tiene — para cualquier clave no
 * listada), así que si el plan viviera ahí, el propio cliente podría subirse de plan
 * solo con un PUT. Por eso esta clase no pasa por esa puerta: no hay ruta HTTP para
 * escribir el plan todavía. Hasta que exista el canal de control de CheCAT (pendiente,
 * ver memoria del proyecto), se fija con `php artisan licencia:plan <plan>`.
 *
 * Guarda en la misma tabla `configuracion` (clave = 'licencia') que ya usa
 * ConfiguracionService — mismo mecanismo de storage, puerta de escritura distinta.
 */
class LicenciaService
{
    public const PLANES = ['emprendedor', 'pymes', 'corporativo'];

    private const CLAVE = 'licencia';

    /**
     * Una instalación sin plan fijado se comporta como Corporativo: falla ABIERTA.
     * Ninguna instalación existente (la de desarrollo, la del primer cliente) se queda
     * sin funciones el día que este código se despliega, sin que alguien lo haya
     * decidido a propósito con el comando de abajo.
     */
    private const PLAN_POR_DEFECTO = 'corporativo';

    private ?string $cache = null;

    public function plan(): string
    {
        if ($this->cache !== null) {
            return $this->cache;
        }
        $valor = Configuracion::query()->where('clave', self::CLAVE)->value('valor');
        $plan = is_array($valor) ? ($valor['plan'] ?? null) : null;

        return $this->cache = in_array($plan, self::PLANES, true) ? $plan : self::PLAN_POR_DEFECTO;
    }

    public function fijar(string $plan): string
    {
        if (! in_array($plan, self::PLANES, true)) {
            throw new InvalidArgumentException(
                'Plan inválido: "'.$plan.'". Válidos: '.implode(', ', self::PLANES).'.'
            );
        }
        Configuracion::query()->updateOrCreate(
            ['clave' => self::CLAVE],
            ['valor' => ['plan' => $plan, 'activadoEn' => now()->toIso8601String()]],
        );

        return $this->cache = $plan;
    }
}
