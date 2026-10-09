<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\Services\LicenciaService;
use Illuminate\Console\Command;
use PDO;
use Throwable;

/**
 * EL ALTA DE UN CLIENTE EN UNA INSTALACIÓN MULTI-CLIENTE.
 *
 * Antes hay dos pasos que en el hosting compartido son MANUALES (hPanel no los expone por comando):
 *   1. crear la base de datos (y su usuario) del cliente, VACÍA;
 *   2. crear el subdominio y activar su certificado SSL.
 * Este comando hace el resto: arma la carpeta del cliente con su `.env`, migra, siembra, fija el plan y deja un usuario inicial.
 *
 * Si algo falla, la carpeta que se acaba de crear se borra, así que se puede repetir sin limpiar nada a mano.
 */
class ClientesAlta extends Command
{
    protected $signature = 'ccs:alta {dominio : el dominio del cliente, p. ej. kiosco-lopez.tudominio.com}
        {--plan= : emprendedor|pymes|corporativo}
        {--nombre= : nombre del negocio (por defecto, el dominio)}
        {--db= : nombre de la base, ya creada y vacía}
        {--usuario-db= : usuario de esa base}
        {--clave-db= : contraseña de esa base (si se omite, se pregunta)}
        {--host-db=127.0.0.1}
        {--puerto-db=3306}
        {--iniciar : crea la carpeta de clientes si todavía no existe (esto ACTIVA el modo multi-cliente)}';

    protected $description = 'Da de alta un cliente: carpeta, .env, migraciones, datos mínimos, plan y usuario inicial';

    public function handle(): int
    {
        $dominio = SelectorDeCliente::normalizar($this->argument('dominio'));
        $plan = (string) $this->option('plan');
        if ($dominio === null || ! str_contains($dominio, '.')) {
            return $this->fallar('El dominio "'.$this->argument('dominio').'" no es válido. Usá el dominio completo, en minúsculas, sin https:// ni barras.');
        }
        if (! in_array($plan, LicenciaService::PLANES, true)) {
            return $this->fallar('Indicá el plan con --plan= ('.implode(', ', LicenciaService::PLANES).').');
        }
        foreach (['db' => '--db', 'usuario-db' => '--usuario-db'] as $opcion => $flag) {
            if (! $this->option($opcion)) {
                return $this->fallar('Falta '.$flag.'= (los datos de la base que creaste en hPanel).');
            }
        }

        $raiz = Registro::raiz();
        if ($raiz === null) {
            if (! $this->option('iniciar')) {
                return $this->fallar('Todavía no existe la carpeta de clientes ('.Registro::raizPrevista().'). Crearla activa el modo multi-cliente de esta instalación: si es lo que querés, repetí con --iniciar.');
            }
            if (! @mkdir(Registro::raizPrevista(), 0750, true) && ! is_dir(Registro::raizPrevista())) {
                return $this->fallar('No se pudo crear '.Registro::raizPrevista().'.');
            }
        }
        if (is_dir(Registro::carpeta($dominio))) {
            return $this->fallar('Ya existe la carpeta de '.$dominio.'. Para repetir el alta de un cliente que falló a medias, borrá esa carpeta primero.');
        }

        $clave = $this->option('clave-db');
        if ($clave === null) {
            $clave = $this->input->isInteractive() ? (string) $this->secret('Contraseña de la base '.$this->option('db')) : '';
        }
        if ($error = $this->probarBase($this->option('host-db'), (int) $this->option('puerto-db'), $this->option('db'), $this->option('usuario-db'), $clave)) {
            return $this->fallar($error);
        }

        $carpeta = Registro::carpeta($dominio);
        $inicial = $this->claveInicial();
        try {
            foreach (['', '/storage', '/arca', '/cache'] as $sub) {
                mkdir($carpeta.$sub, $sub === '/arca' || $sub === '' ? 0700 : 0775, true);
            }
            file_put_contents($carpeta.'/.env', $this->entorno($dominio, $clave));
            @chmod($carpeta.'/.env', 0600);
            Registro::guardarFicha($dominio, [
                'dominio' => $dominio, 'nombre' => $this->option('nombre') ?: $dominio, 'plan' => $plan,
                'base' => $this->option('db'), 'creado' => now()->toIso8601String(),
            ]);

            $this->info('Armando '.$dominio.' (migraciones y datos mínimos; tarda unos segundos)…');
            $p = Ejecutor::artisan($dominio, ['cliente:aprovisionar', '--plan='.$plan, '--forzar-cambio-clave'], ['SUPERADMIN_PASSWORD' => $inicial]);
            if (! $p->isSuccessful()) {
                throw new \RuntimeException(trim($p->getErrorOutput().PHP_EOL.$p->getOutput()));
            }
        } catch (Throwable $e) {
            Registro::borrarCarpeta($carpeta);
            $this->error('El alta falló y se deshizo la carpeta del cliente. La base quedó como estaba: si ya se migró algo, vaciala desde hPanel antes de repetir.');

            return $this->fallar($e->getMessage());
        }

        preg_match('/ID de esta instalación:\s*(\S+)/u', $p->getOutput(), $m);
        $this->newLine();
        $this->info('Cliente creado: '.$dominio.' — plan '.$plan);
        $this->table(['', ''], [
            ['Usuario inicial', 'Administrador'],
            ['Clave inicial', $inicial.'   (se muestra UNA vez; el sistema le pide cambiarla al entrar)'],
            ['ID de instalación', $m[1] ?? '(ver: CCS_CLIENTE='.$dominio.' php artisan licencia:estado)'],
            ['Carpeta', $carpeta],
        ]);
        $this->line('Falta, en hPanel: que el subdominio '.$dominio.' tenga SSL y apunte a la carpeta pública del sistema.');
        $this->line('Y la licencia: php artisan licencia:emitir --cliente="…" --plan='.$plan.' --instalacion=<ID> --meses=1 ; se carga en Sistema › Licencia del cliente.');

        return self::SUCCESS;
    }

    private function fallar(string $mensaje): int
    {
        $this->error($mensaje);

        return self::FAILURE;
    }

    /** Se conecta a la base con los datos dados y exige que esté VACÍA: el alta no mezcla un cliente con datos ajenos. */
    private function probarBase(string $host, int $puerto, string $base, string $usuario, string $clave): ?string
    {
        try {
            $pdo = new PDO("mysql:host={$host};port={$puerto};dbname={$base};charset=utf8mb4", $usuario, $clave, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]);
            $tablas = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        } catch (Throwable $e) {
            return 'No me pude conectar a la base "'.$base.'": '.$e->getMessage().'. ¿La creaste en hPanel y le diste permisos a ese usuario?';
        }

        return $tablas ? 'La base "'.$base.'" ya tiene '.count($tablas).' tablas. El alta necesita una base vacía; si es de otro cliente, usá otra.' : null;
    }

    /** 14 caracteres sin los que se confunden al dictarlos (0/O, 1/l/I). */
    private function claveInicial(): string
    {
        $alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $out = '';
        for ($i = 0; $i < 14; $i++) {
            $out .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
        }

        return $out;
    }

    private function valor(string $v): string
    {
        return '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $v).'"';
    }

    private function entorno(string $dominio, string $claveDb): string
    {
        $nombre = (string) ($this->option('nombre') ?: $dominio);

        return implode("\n", [
            '# Cliente '.$dominio.' — creado con ccs:alta el '.now()->format('Y-m-d').'. NO subir al repositorio.',
            'APP_NAME='.$this->valor($nombre),
            'APP_ENV=production',
            'APP_DEBUG=false',
            'APP_KEY=base64:'.base64_encode(random_bytes(32)),
            'APP_URL=https://'.$dominio,
            'APP_LOCALE=es',
            'APP_FALLBACK_LOCALE=es',
            'APP_MAINTENANCE_DRIVER=file',
            'BCRYPT_ROUNDS=12',
            '',
            'LOG_CHANNEL=single',
            'LOG_LEVEL=warning',
            '',
            'DB_CONNECTION=mysql',
            'DB_HOST='.$this->option('host-db'),
            'DB_PORT='.(int) $this->option('puerto-db'),
            'DB_DATABASE='.$this->option('db'),
            'DB_USERNAME='.$this->valor((string) $this->option('usuario-db')),
            'DB_PASSWORD='.$this->valor($claveDb),
            '',
            'SESSION_DRIVER=array',
            'CACHE_STORE=file',
            'QUEUE_CONNECTION=sync',
            'FILESYSTEM_DISK=local',
            'MAIL_MAILER=log',
            '',
            'CORS_ALLOWED_ORIGINS=https://'.$dominio,
            'SESION_INACTIVIDAD_HORAS=12',
            '',
            '# ARCA: homologación hasta que el cliente cargue su certificado y pase a producción. El certificado y la clave se guardan solos en arca/.',
            'ARCA_ENV=homologacion',
            'ARCA_CUIT=',
            'ARCA_PTO_VTA=',
            'ARCA_TIMEOUT_MS=15000',
            '',
        ]);
    }
}
