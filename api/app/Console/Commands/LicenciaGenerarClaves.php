<?php

namespace App\Console\Commands;

use App\Licencias\Firma;
use Illuminate\Console\Command;
use RuntimeException;

/**
 * CREA EL PAR DE CLAVES con que se firman las licencias. Se corre UNA SOLA VEZ,
 * en TU máquina (la de quien emite las claves de activación).
 *
 *  - La clave PRIVADA se guarda en la ruta que le indiques (fuera del
 *    proyecto, y con copia en un lugar seguro: sin ella no se pueden emitir más
 *    licencias). Nunca va al repositorio ni a un servidor de cliente.
 *  - La clave PÚBLICA se escribe en `config/licencia.pub`, que sí va al
 *    repositorio: es lo que usan las instalaciones para comprobar que una clave
 *    la emitió CCS.
 *
 * Si ya hay una clave pública, NO se pisa sin `--forzar`: cambiarla deja sin
 * validar la licencia de todos los clientes que ya tienen el sistema.
 */
class LicenciaGenerarClaves extends Command
{
    protected $signature = 'licencia:generar-claves {--privada= : Dónde guardar la clave privada (fuera del proyecto)} {--openssl-cnf= : Ruta de openssl.cnf si OpenSSL no la encuentra (Windows)} {--forzar : Pisar una clave pública que ya existe}';

    protected $description = 'Crea el par de claves con que se firman las licencias (se corre una sola vez, en la máquina de quien emite)';

    public function handle(): int
    {
        $privada = (string) $this->option('privada');
        if ($privada === '') {
            $this->error('Indicá dónde guardar la clave privada, fuera del proyecto. Ej: --privada="C:/Users/vos/ccs-licencias/ccs-privada.pem"');

            return self::FAILURE;
        }

        $proyecto = str_replace('\\', '/', (string) realpath(base_path('..')));
        $destino = str_replace('\\', '/', $privada);
        if ($proyecto !== '' && str_starts_with(strtolower($destino), strtolower($proyecto))) {
            $this->error('La clave privada no puede quedar dentro del proyecto ('.$proyecto.'): terminaría en el repositorio.');

            return self::FAILURE;
        }
        if (is_file($privada) && ! $this->option('forzar')) {
            $this->error('Ya existe un archivo en '.$privada.'. No lo piso (usá --forzar solo si estás seguro).');

            return self::FAILURE;
        }

        $archivoPublica = (string) config('licencia.clave_publica_archivo');
        if (is_file($archivoPublica) && trim((string) file_get_contents($archivoPublica)) !== '' && ! $this->option('forzar')) {
            $this->error('Ya hay una clave pública en config/licencia.pub. Generar otra deja SIN VALIDAR la licencia de todos los clientes que ya tienen el sistema. Si de verdad querés, usá --forzar.');

            return self::FAILURE;
        }

        try {
            $par = Firma::generarPar($this->option('openssl-cnf') ?: null);
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $carpeta = dirname($privada);
        if (! is_dir($carpeta) && ! @mkdir($carpeta, 0700, true) && ! is_dir($carpeta)) {
            $this->error('No pude crear la carpeta '.$carpeta);

            return self::FAILURE;
        }
        file_put_contents($privada, $par['privada']);
        @chmod($privada, 0600);
        file_put_contents($archivoPublica, $par['publica']);

        $this->info('Listo.');
        $this->line('  Clave PRIVADA: '.$privada);
        $this->line('  Clave PÚBLICA: config/licencia.pub  (commitearla)');
        $this->newLine();
        $this->warn('Guardá la clave privada en un lugar seguro (gestor de contraseñas, pendrive aparte).');
        $this->warn('Si la perdés no se pueden emitir más licencias; si la filtran, cualquiera puede emitirlas.');

        return self::SUCCESS;
    }
}
