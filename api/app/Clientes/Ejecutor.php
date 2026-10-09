<?php

namespace App\Clientes;

use Symfony\Component\Process\Process;

/**
 * CORRE UN COMANDO DE `artisan` COMO SI LO ESCRIBIERA ALGUIEN PARA UN CLIENTE.
 *
 * Cada cliente en su propio proceso: no se puede "cambiar de cliente" dentro de uno que ya cargó la configuración de otro.
 * Además aísla los errores — si uno revienta, los demás siguen.
 *
 * El proceso hijo NO hereda el entorno de quien lo lanzó: una variable ya definida (otra base, otro `APP_KEY`) le ganaría al `.env`
 * del cliente, porque el `.env` nunca pisa lo que ya está en el entorno. Es el error que haría escribir en la base equivocada.
 */
final class Ejecutor
{
    /** Todo lo que un `.env` de cliente define y que no puede venir de afuera. */
    private const PREFIJOS = '/^(APP|DB|CACHE|SESSION|QUEUE|LOG|MAIL|ARCA|LICENCIA|CHECAT|RESPALDOS|TRUSTED|CORS|BCRYPT|SUPERADMIN|CCS|BROADCAST|FILESYSTEM|SESION|PULSE|TELESCOPE)_/';

    /**
     * @param  list<string>  $args  por ejemplo `['migrate', '--force']`
     * @param  array<string,string>  $env  variables extra para este proceso
     */
    public static function artisan(string $cliente, array $args, array $env = [], int $timeout = 900): Process
    {
        $entorno = [];
        foreach (array_keys(getenv()) as $k) {
            if (preg_match(self::PREFIJOS, $k) === 1) {
                $entorno[$k] = false;   // false = sacarla del entorno del hijo
            }
        }
        $entorno['CCS_CLIENTES'] = Registro::raizPrevista();
        $entorno['CCS_CLIENTE'] = $cliente;

        $php = getenv('CCS_PHP') ?: PHP_BINARY;
        $p = new Process([$php, base_path('artisan'), ...$args, '--no-interaction', '--no-ansi'], base_path(), $env + $entorno, null, $timeout);
        $p->run();

        return $p;
    }
}
