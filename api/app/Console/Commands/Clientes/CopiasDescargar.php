<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\SelectorDeCliente;
use App\CopiasExternas\Cifrado;
use App\CopiasExternas\CopiaExterna;
use Illuminate\Console\Command;
use Throwable;

/**
 * BAJA DE DRIVE UNA COPIA Y LA DESCIFRA, lista para restaurar (el resultado es un `.sql.gz` común). Sirve para recuperar un cliente
 * si su servidor se perdió. Sin `--archivo`, baja la más nueva.
 */
class CopiasDescargar extends Command
{
    protected $signature = 'ccs:copias-descargar {dominio} {--archivo= : nombre exacto de la copia (ver ccs:copias-lista)} {--salida= : carpeta donde dejarla (por defecto, la actual)}';

    protected $description = 'Baja de Google Drive la copia de un cliente y la descifra';

    public function handle(): int
    {
        $n = SelectorDeCliente::normalizar($this->argument('dominio')) ?? $this->argument('dominio');
        $c = CopiaExterna::configuracion();
        if ($c === null) {
            $this->error('Las copias externas no están configuradas. Corré: php artisan ccs:copias-configurar');

            return self::FAILURE;
        }
        $salida = rtrim((string) ($this->option('salida') ?: getcwd()), '/\\');

        try {
            $servicio = new CopiaExterna;
            $copias = $servicio->copiasDe($n);
            $elegida = $this->option('archivo') ? collect($copias)->firstWhere('name', $this->option('archivo')) : ($copias[0] ?? null);
            if (! $elegida) {
                $this->error($this->option('archivo') ? 'No hay una copia llamada "'.$this->option('archivo').'" de '.$n.'.' : 'No hay copias de '.$n.' en Drive.');

                return self::FAILURE;
            }
            if (! is_dir($salida) && ! @mkdir($salida, 0750, true)) {
                $this->error('No se pudo crear '.$salida.'.');

                return self::FAILURE;
            }

            $cifrada = $salida.DIRECTORY_SEPARATOR.$elegida['name'];
            $plano = substr($cifrada, 0, -4);   // sin el ".enc"
            $servicio->drive()->descargar($elegida['id'], $cifrada);
            try {
                Cifrado::descifrar($cifrada, $plano, $c['claveCifrado']);
            } finally {
                @unlink($cifrada);
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('Copia lista para restaurar: '.$plano);
        $this->line('Para restaurar: crear la base del cliente, correr  CCS_CLIENTE=<dominio> php artisan migrate --force  (arma las tablas) y recién ahí importar este archivo (phpMyAdmin › Importar acepta el .sql.gz tal cual). La copia trae los datos, no las tablas.');

        return self::SUCCESS;
    }
}
