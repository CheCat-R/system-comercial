<?php

namespace App\Services;

use App\Models\Configuracion;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Throwable;

/**
 * ¿ESTA INSTALACIÓN ESTÁ LISTA PARA UN CLIENTE?
 * ============================================================================
 * La lista de cosas que, si se olvidan, no avisan: el sistema anda igual y el
 * problema aparece meses después (una contraseña de fábrica en producción, la
 * depuración prendida mostrando rutas y consultas a cualquiera, una instalación
 * sin plan que se comporta como Corporativo y le da de más a un Emprendedor).
 *
 * Cada control devuelve `ok`, `aviso` (conviene arreglarlo) o `fallo` (no se
 * entrega así). Lo corre a mano `php artisan produccion:verificar` y el
 * instalador al terminar. No modifica nada.
 */
class VerificacionEntorno
{
    /** La contraseña con que `SeguridadSeeder` deja al superadmin si no se define otra. */
    private const CLAVE_DE_FABRICA = 'admin1234';

    public function __construct(private readonly RespaldosService $respaldos) {}

    /** @return array<int, array{nivel:string, titulo:string, detalle:string}> */
    public function verificar(): array
    {
        $controles = [
            'entorno', 'depuracion', 'claveApp', 'url', 'cors', 'proxies', 'baseDeDatos', 'migraciones',
            'superadmin', 'plan', 'firmaLicencias', 'registro', 'arca', 'escritura', 'configCacheada', 'copiaAutomatica',
        ];
        $out = [];
        foreach ($controles as $c) {
            try {
                $out[] = $this->{$c}();
            } catch (Throwable $e) {
                // Un control que revienta no tumba a los demás: se informa como fallo.
                $out[] = $this->r('fallo', $c, 'No se pudo comprobar: '.$e->getMessage());
            }
        }

        return $out;
    }

    private function r(string $nivel, string $titulo, string $detalle = ''): array
    {
        return ['nivel' => $nivel, 'titulo' => $titulo, 'detalle' => $detalle];
    }

    private function entorno(): array
    {
        return app()->environment('production')
            ? $this->r('ok', 'Entorno de producción')
            : $this->r('fallo', 'APP_ENV no es "production"', 'Hoy es "'.app()->environment().'". Poné APP_ENV=production en el .env.');
    }

    private function depuracion(): array
    {
        if (config('app.debug')) {
            return $this->r('fallo', 'APP_DEBUG está prendido', 'Muestra rutas, consultas y variables ante cualquier error. Poné APP_DEBUG=false.');
        }

        return $this->r('ok', 'Depuración apagada');
    }

    private function claveApp(): array
    {
        return config('app.key')
            ? $this->r('ok', 'APP_KEY definida')
            : $this->r('fallo', 'Falta APP_KEY', 'Corré: php artisan key:generate --force');
    }

    private function url(): array
    {
        $url = (string) config('app.url');
        if (! str_starts_with($url, 'https://')) {
            return $this->r('fallo', 'APP_URL no es https', 'Hoy es "'.$url.'". En producción tiene que ser https://tu-dominio.');
        }
        if (preg_match('/localhost|127\.0\.0\.1/', $url)) {
            return $this->r('fallo', 'APP_URL apunta a localhost', $url);
        }

        return $this->r('ok', 'APP_URL con https');
    }

    private function cors(): array
    {
        $origenes = (array) config('cors.allowed_origins', []);
        $malos = array_values(array_filter($origenes, fn ($o) => $o === '*' || preg_match('/localhost|127\.0\.0\.1/', (string) $o)));
        if ($malos) {
            return $this->r('fallo', 'CORS permite orígenes de desarrollo', implode(', ', $malos).' — dejá solo el dominio real del panel (o vacío si el panel y la API comparten dominio).');
        }

        return $this->r('ok', 'CORS sin orígenes de desarrollo');
    }

    private function baseDeDatos(): array
    {
        DB::connection()->getPdo();

        return $this->r('ok', 'Base de datos conectada');
    }

    private function migraciones(): array
    {
        $archivos = count(glob(database_path('migrations/*.php')) ?: []);
        $corridas = DB::table('migrations')->count();
        $pendientes = $archivos - $corridas;

        return $pendientes > 0
            ? $this->r('fallo', 'Hay '.$pendientes.' migración(es) sin correr', 'Corré: php artisan migrate --force')
            : $this->r('ok', 'Migraciones al día');
    }

    private function superadmin(): array
    {
        $supers = Usuario::query()->whereHas('rol', fn ($q) => $q->where('clave', 'superadmin'))->get();
        if ($supers->isEmpty()) {
            return $this->r('fallo', 'No hay ningún superadmin', 'Corré: php artisan db:seed --force');
        }
        foreach ($supers as $u) {
            if ($u->tienePassword() && Hash::check(self::CLAVE_DE_FABRICA, $u->password)) {
                return $u->debe_cambiar_password
                    ? $this->r('aviso', '"'.$u->nombre.'" todavía tiene la contraseña de fábrica', 'El sistema le va a pedir elegir una en el primer ingreso: entrá vos antes de entregarlo, o pasale una temporal con usuario:restablecer-clave.')
                    : $this->r('fallo', '"'.$u->nombre.'" tiene la contraseña de fábrica (admin1234)', 'Cualquiera la conoce. Corré: php artisan usuario:restablecer-clave "'.$u->nombre.'"');
            }
        }

        return $this->r('ok', 'El superadmin no usa la contraseña de fábrica');
    }

    private function plan(): array
    {
        $svc = app(LicenciaService::class);

        // Con licencia exigida (producción), lo que manda es la LICENCIA FIRMADA.
        if ($svc->exigida()) {
            $e = $svc->estado();
            $vence = $e['vence'] ? date('d/m/Y', strtotime($e['vence'])) : '';

            return match ($e['estado']) {
                'activa' => $this->r('ok', 'Licencia vigente: plan '.$e['plan'].', vence el '.$vence),
                'por_vencer' => $this->r('aviso', 'La licencia vence el '.$vence.' (en '.$e['diasRestantes'].' días)', 'Emití la renovación: php artisan licencia:emitir ...'),
                'en_gracia' => $this->r('aviso', 'La licencia VENCIÓ el '.$vence, 'Está en el período de gracia; después queda en solo lectura.'),
                default => $this->r('fallo', 'Sin licencia vigente ('.$e['estado'].')', ($e['motivo'] ?: 'Venció el '.$vence.'.').' ID de esta instalación: '.$svc->instalacionId().'. Emití la clave con licencia:emitir y cargala (Sistema › Licencia o php artisan licencia:activar).'),
            };
        }

        // Sin plan fijado, LicenciaService cae a Corporativo (falla abierta): un Emprendedor recibiría todo.
        return Configuracion::query()->where('clave', 'licencia')->exists()
            ? $this->r('ok', 'Plan comercial fijado: '.$svc->plan())
            : $this->r('fallo', 'La instalación no tiene plan fijado', 'Se comporta como Corporativo (todas las funciones). Corré: php artisan licencia:plan emprendedor|pymes|corporativo');
    }

    private function firmaLicencias(): array
    {
        if (! extension_loaded('openssl')) {
            return $this->r('fallo', 'Falta la extensión openssl de PHP', 'Hace falta para verificar las licencias (y para ARCA).');
        }
        $pem = (string) config('licencia.clave_publica');
        if ($pem === '') {
            $archivo = (string) config('licencia.clave_publica_archivo');
            $pem = is_file($archivo) ? (string) file_get_contents($archivo) : '';
        }

        if (trim($pem) !== '') {
            return $this->r('ok', 'Clave pública de licencias presente');
        }

        return app(LicenciaService::class)->exigida()
            ? $this->r('fallo', 'Falta la clave pública de licencias (config/licencia.pub)', 'Sin ella no se puede validar ninguna clave. Se genera una vez con: php artisan licencia:generar-claves')
            : $this->r('aviso', 'Todavía no hay clave pública de licencias', 'Hace falta antes de entregar un sistema: php artisan licencia:generar-claves');
    }

    private function registro(): array
    {
        // Con la config en caché `env()` devuelve null fuera de los archivos de config: se lee del config, no del entorno.
        return strtolower((string) config('logging.channels.single.level', 'debug')) === 'debug'
            ? $this->r('aviso', 'El log está en nivel "debug"', 'Llena el disco de ruido en producción. Poné LOG_LEVEL=warning.')
            : $this->r('ok', 'Nivel de log razonable');
    }

    private function proxies(): array
    {
        $valor = trim((string) config('checat.proxies_confiables'));
        if ($valor === '') {
            return $this->r('aviso', 'TRUSTED_PROXIES vacío', 'Si la API está detrás de un proxy (Traefik, nginx, Cloudflare), todos los pedidos parecen venir de una sola IP y el freno del login puede dejar afuera a toda la empresa con 20 intentos fallidos. Poné en TRUSTED_PROXIES la IP o red del proxy. Si la API recibe a los clientes directo, está bien así.');
        }
        if ($valor === '*') {
            return $this->r('aviso', 'TRUSTED_PROXIES=* confía en cualquiera', 'Solo es seguro si la API no se puede alcanzar sin pasar por el proxy; si no, alguien puede inventar su IP y saltearse el freno del login. Lo mejor es listar la IP o red del proxy.');
        }

        return $this->r('ok', 'Proxies confiables definidos', $valor);
    }

    private function arca(): array
    {
        $cfg = config('arca');
        if ($cfg['cuit'] === '') {
            return $this->r('aviso', 'Facturación electrónica (ARCA) sin configurar', 'Mientras tanto se emite ticket provisorio. Si el cliente factura, completá ARCA_* en el .env.');
        }
        if (! $cfg['produccion']) {
            return $this->r('aviso', 'ARCA en homologación', 'Las facturas son de prueba, no valen. Cuando el cliente esté listo: ARCA_ENV=produccion.');
        }
        foreach (['cert_path' => 'certificado', 'key_path' => 'clave privada'] as $k => $nombre) {
            if ($cfg[$k] === '' || ! is_readable($cfg[$k])) {
                return $this->r('fallo', 'ARCA en producción pero no se lee el '.$nombre, 'Ruta: "'.$cfg[$k].'". Tiene que existir y ser legible por el usuario del servidor web.');
            }
        }
        if ($cfg['pto_vta'] <= 0) {
            return $this->r('fallo', 'ARCA en producción sin punto de venta', 'Completá ARCA_PTO_VTA.');
        }
        // La clave privada firma en nombre de la empresa ante ARCA: dentro de la carpeta pública se descarga con una URL.
        foreach (['cert_path' => 'certificado', 'key_path' => 'clave privada'] as $k => $nombre) {
            $real = realpath($cfg[$k]) ?: $cfg[$k];
            $publica = realpath(public_path()) ?: public_path();
            if (str_starts_with(str_replace('\\', '/', $real), rtrim(str_replace('\\', '/', $publica), '/').'/')) {
                return $this->r('fallo', 'El '.$nombre.' de ARCA está en la carpeta pública', 'Ruta: "'.$cfg[$k].'". Cualquiera puede descargarlo: movelo fuera de public/ y actualizá ARCA_*_PATH.');
            }
        }

        return $this->r('ok', 'ARCA en producción, certificado legible');
    }

    private function escritura(): array
    {
        foreach ([storage_path(), base_path('bootstrap/cache')] as $dir) {
            if (! is_dir($dir) || ! is_writable($dir)) {
                return $this->r('fallo', 'El servidor web no puede escribir en '.basename($dir), $dir);
            }
        }

        return $this->r('ok', 'storage/ y bootstrap/cache escribibles');
    }

    private function configCacheada(): array
    {
        return app()->configurationIsCached()
            ? $this->r('ok', 'Configuración en caché')
            : $this->r('aviso', 'La configuración no está en caché', 'Más lento en cada pedido. Corré: php artisan config:cache (y de nuevo después de cada cambio del .env).');
    }

    private function copiaAutomatica(): array
    {
        if (! $this->respaldos->automaticoIncluido()) {
            return $this->r('ok', 'Plan sin copia automática (solo descarga manual)');
        }
        if ($this->respaldos->automatico()['copias'] === []) {
            return $this->r('aviso', 'Todavía no hay copias automáticas', 'La primera sale a las 3:00. Comprobá que el servidor tenga el cron de "schedule:run" (ver api/deploy/PRODUCCION.md).');
        }

        return $this->r('ok', 'Hay copias automáticas');
    }
}
