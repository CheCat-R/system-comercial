<?php

namespace App\Clientes;

use Illuminate\Foundation\Application;

/**
 * UN SOLO CÓDIGO, VARIOS CLIENTES (planes Emprendedor y Pymes en hosting compartido).
 * ============================================================================
 * Cada cliente tiene su BASE DE DATOS y su carpeta. Quien decide a cuál le toca cada pedido es el DOMINIO:
 *
 *     clientes/                      ← al lado de la carpeta del código (nunca adentro: un deploy no la toca)
 *       kiosco-lopez.ccs.com.ar/     ← el nombre de la carpeta ES el dominio del cliente
 *         .env                       ← su base, su APP_KEY, su CUIT y modo de ARCA…
 *         storage/                   ← sus logs, su caché, sus copias de seguridad
 *         arca/                      ← su certificado y su clave privada (permiso 0700)
 *         cache/config.php           ← SU caché de configuración (la de otro cliente no sirve)
 *
 * Con eso el aislamiento es total y sin tocar el resto del sistema: el token, los candados de caja, la caché y los
 * archivos de un cliente viven en SU base y SU carpeta, así que el ID 1 de uno nunca se cruza con el ID 1 de otro.
 *
 * QUEDA ACTIVO SOLO SI EXISTE la carpeta `clientes/` (o la que diga `CCS_CLIENTES`). Sin ella —un Corporativo dedicado, el
 * desarrollo, los tests— todo funciona como siempre, con el `.env` de la carpeta del código.
 *
 * Por línea de comandos el cliente se elige con la variable `CCS_CLIENTE` (el nombre de su carpeta):
 *     CCS_CLIENTE=kiosco-lopez.ccs.com.ar php artisan migrate --force
 * Un comando suelto, sin cliente, se RECHAZA: correr `migrate` contra "la base que haya" es como se pisa a un cliente.
 *
 * Esto corre ANTES de que Laravel lea el `.env` (lo llama `bootstrap/app.php`), por eso no usa `config()` ni `env()`.
 */
final class SelectorDeCliente
{
    /** Un dominio en minúsculas: letras, números, puntos y guiones. Sin barras ni `..`: es el nombre de una carpeta. */
    private const NOMBRE = '/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/';

    private static ?string $nombre = null;

    private static ?string $carpeta = null;

    /** Carpeta que contiene a todos los clientes, o null si esta instalación no es multi-cliente. */
    public static function carpetaDeClientes(string $base): ?string
    {
        $dir = getenv('CCS_CLIENTES') ?: dirname($base).DIRECTORY_SEPARATOR.'clientes';
        $real = is_dir($dir) ? realpath($dir) : false;

        return $real === false ? null : str_replace('\\', '/', $real);
    }

    /** `Kiosco.Lopez.com:443` → `kiosco.lopez.com`. Null si no puede ser el nombre de una carpeta. */
    public static function normalizar(?string $crudo): ?string
    {
        $n = strtolower(trim((string) $crudo));
        $n = preg_replace('/:\d{1,5}$/', '', $n) ?? '';
        $n = rtrim($n, '.');

        return $n !== '' && ! str_contains($n, '..') && preg_match(self::NOMBRE, $n) === 1 ? $n : null;
    }

    /**
     * Qué hacer con este pedido o comando. Pura (sin efectos), para poder probarla.
     *
     * @param  string|null  $comando  primer argumento de `artisan` (null si es un pedido web)
     * @return array{modo:'unico'}|array{modo:'sin-cliente'}|array{modo:'cliente',nombre:string,carpeta:string}|array{modo:'rechazado',mensaje:string,http:int}
     */
    public static function decidir(string $base, ?string $cliente, ?string $host, ?string $comando, ?string $appEnv): array
    {
        $raiz = self::carpetaDeClientes($base);
        if ($raiz === null || $appEnv === 'testing') {
            return ['modo' => 'unico'];
        }

        $cliente = trim((string) $cliente);
        if ($cliente !== '' || trim((string) $host) !== '') {
            $nombre = self::normalizar($cliente !== '' ? $cliente : $host);
            $carpeta = $nombre === null ? null : $raiz.'/'.$nombre;
            // Sin `.env` no es un cliente: es una carpeta cualquiera. El mensaje es el mismo para "no existe" y "no es válido".
            if ($carpeta !== null && is_file($carpeta.'/.env')) {
                return ['modo' => 'cliente', 'nombre' => $nombre, 'carpeta' => $carpeta];
            }

            return [
                'modo' => 'rechazado', 'http' => 404,
                'mensaje' => $cliente !== '' ? 'No hay un cliente con el nombre "'.$cliente.'" en '.$raiz.'.' : 'Sitio no encontrado.',
            ];
        }

        // Línea de comandos sin cliente: solo lo que no toca datos.
        if ($comando === null || $comando === 'list' || $comando === 'help' || str_starts_with($comando, '--') || str_starts_with($comando, 'ccs:')) {
            return ['modo' => 'sin-cliente'];
        }

        return [
            'modo' => 'rechazado', 'http' => 400,
            'mensaje' => 'Esta instalación atiende a varios clientes. Indicá a cuál con CCS_CLIENTE=<carpeta del cliente>, por ejemplo: CCS_CLIENTE=kiosco.ccs.com.ar php artisan '.$comando,
        ];
    }

    /** Se llama una vez, apenas se crea la aplicación y antes de que lea su `.env`. */
    public static function aplicar(Application $app): void
    {
        $esWeb = isset($_SERVER['HTTP_HOST']) || PHP_SAPI !== 'cli';
        $d = self::decidir(
            $app->basePath(),
            getenv('CCS_CLIENTE') ?: null,
            $_SERVER['HTTP_HOST'] ?? null,
            PHP_SAPI === 'cli' && ! isset($_SERVER['HTTP_HOST']) ? ($_SERVER['argv'][1] ?? null) : null,
            getenv('APP_ENV') ?: ($_SERVER['APP_ENV'] ?? null),
        );

        if ($d['modo'] === 'rechazado') {
            if ($esWeb) {
                // Al que pregunta por la web no se le cuenta qué clientes existen: el mismo 404 para todo.
                http_response_code(404);
                header('Content-Type: application/json');
                echo json_encode(['message' => 'Sitio no encontrado.']);
            } else {
                fwrite(STDERR, $d['mensaje'].PHP_EOL);
            }
            exit(1);
        }
        if ($d['modo'] !== 'cliente') {
            return;
        }

        self::$nombre = $d['nombre'];
        self::$carpeta = $d['carpeta'];
        self::asegurarCarpetas($d['carpeta']);

        $app->useEnvironmentPath($d['carpeta']);
        $app->loadEnvironmentFrom('.env');
        $app->useStoragePath($d['carpeta'].'/storage');

        // La configuración cacheada es de UN cliente (trae su base y sus claves): cada uno tiene la suya. Laravel solo
        // entiende rutas que empiezan con `/` o `\`, así que en Windows se saca la letra de unidad si es la misma del código.
        $cache = self::rutaParaLaravel($d['carpeta'].'/cache/config.php', $app->basePath());
        foreach (['APP_CONFIG_CACHE' => $cache, 'CCS_CLIENTE_ACTUAL' => $d['nombre']] as $k => $v) {
            if ($v !== null) {
                putenv($k.'='.$v);
                $_ENV[$k] = $_SERVER[$k] = $v;
            }
        }
        if ($cache === null) {
            // No se puede expresar la ruta: mejor SIN caché que con la del código, que sería la de otro cliente.
            putenv('APP_CONFIG_CACHE=/ccs-sin-cache/config.php');
            $_ENV['APP_CONFIG_CACHE'] = $_SERVER['APP_CONFIG_CACHE'] = '/ccs-sin-cache/config.php';
        }
    }

    /** Nombre (dominio) del cliente atendiendo este pedido; null si la instalación no es multi-cliente. */
    public static function nombre(): ?string
    {
        return self::$nombre;
    }

    /** Carpeta del cliente (con `/`), o null. */
    public static function carpeta(): ?string
    {
        return self::$carpeta;
    }

    public static function olvidar(): void
    {
        self::$nombre = self::$carpeta = null;
    }

    private static function asegurarCarpetas(string $carpeta): void
    {
        foreach (['storage/app', 'storage/framework/cache/data', 'storage/framework/sessions', 'storage/framework/views', 'storage/logs', 'cache'] as $sub) {
            if (! is_dir($carpeta.'/'.$sub)) {
                @mkdir($carpeta.'/'.$sub, 0775, true);
            }
        }
        // El certificado de ARCA y su clave privada: solo el dueño.
        if (! is_dir($carpeta.'/arca')) {
            @mkdir($carpeta.'/arca', 0700, true);
        }
    }

    private static function rutaParaLaravel(string $ruta, string $base): ?string
    {
        if (str_starts_with($ruta, '/')) {
            return $ruta;
        }
        if (preg_match('#^([A-Za-z]):(/.*)$#', $ruta, $m) === 1 && strncasecmp($base, $m[1].':', 2) === 0) {
            return $m[2];
        }

        return null;
    }
}
