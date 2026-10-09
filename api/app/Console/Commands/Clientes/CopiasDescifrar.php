<?php

namespace App\Console\Commands\Clientes;

use App\CopiasExternas\Cifrado;
use App\CopiasExternas\CopiaExterna;
use Illuminate\Console\Command;
use Throwable;

/**
 * DESCIFRA UNA COPIA que bajaste a mano desde el sitio de Google Drive. Sirve en CUALQUIER máquina con este código: lo único
 * que hace falta es la clave de cifrado que guardaste en tu gestor de contraseñas (no depende de este servidor).
 */
class CopiasDescifrar extends Command
{
    protected $signature = 'ccs:copias-descifrar {archivo : la copia .sql.gz.enc} {salida : dónde dejar el .sql.gz} {--clave= : la clave de cifrado (si se omite, la de la configuración de esta instalación)}';

    protected $description = 'Descifra una copia bajada a mano de Google Drive';

    public function handle(): int
    {
        $clave = (string) ($this->option('clave') ?: (CopiaExterna::configuracion()['claveCifrado'] ?? ''));
        if ($clave === '') {
            $this->error('Falta la clave de cifrado: pasala con --clave=');

            return self::FAILURE;
        }
        if (! is_file($this->argument('archivo'))) {
            $this->error('No existe '.$this->argument('archivo').'.');

            return self::FAILURE;
        }
        try {
            Cifrado::descifrar($this->argument('archivo'), $this->argument('salida'), $clave);
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
        $this->info('Listo: '.$this->argument('salida'));

        return self::SUCCESS;
    }
}
