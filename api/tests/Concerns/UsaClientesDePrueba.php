<?php

namespace Tests\Concerns;

use PDO;
use Symfony\Component\Process\Process;

/**
 * Lo necesario para probar una instalación con VARIOS CLIENTES de verdad: bases MySQL propias, una carpeta de clientes temporal y
 * cada paso en un PROCESO APARTE (un pedido web por el `public/index.php`, un comando por `artisan`), como en el servidor.
 *
 * El proceso hijo no hereda lo de PHPUnit (otra base, APP_ENV=testing…): solo debe ver el `.env` del cliente.
 */
trait UsaClientesDePrueba
{
    private static string $raiz = '';

    private static array $conexion = [];

    private static bool $armado = false;

    // ------------------------------------------------------------------ armado y limpieza

    /** @param list<string> $sufijos una base `{prefijo}{sufijo}` por cada una */
    protected function iniciarEntorno(string $prefijo, array $sufijos): void
    {
        self::$conexion = config('database.connections.mysql');
        try {
            $pdo = self::pdo();
            foreach ($sufijos as $x) {
                $pdo->exec('DROP DATABASE IF EXISTS `'.$prefijo.$x.'`');
                $pdo->exec('CREATE DATABASE `'.$prefijo.$x.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            }
        } catch (\Throwable $e) {
            self::$conexion = [];
            $this->markTestSkipped('No se pueden crear bases de datos de prueba: '.$e->getMessage());
        }

        // Dentro del proyecto y no en /tmp: así comparte la unidad (Windows) con el código y la caché de configuración por cliente funciona.
        self::$raiz = str_replace('\\', '/', base_path('storage/framework/testing/clientes-'.bin2hex(random_bytes(4))));
        mkdir(self::$raiz.'/clientes', 0777, true);
        $this->escribirArnesesDePrueba();
        self::$armado = true;
    }

    protected static function derribarEntorno(string $prefijo, array $sufijos): void
    {
        if (self::$conexion) {
            $pdo = self::pdo();
            foreach ($sufijos as $x) {
                $pdo->exec('DROP DATABASE IF EXISTS `'.$prefijo.$x.'`');
            }
        }
        if (self::$raiz !== '' && is_dir(self::$raiz)) {
            self::borrar(self::$raiz);
        }
        self::$raiz = '';
        self::$conexion = [];
        self::$armado = false;
    }

    /** El `.env` de un cliente de prueba, a mano (para probar sin `ccs:alta`). */
    protected function escribirEntorno(string $dominio, string $base, string $clave = 'Clave-de-prueba-1'): void
    {
        $dir = self::$raiz.'/clientes/'.$dominio;
        @mkdir($dir, 0777, true);
        file_put_contents($dir.'/.env', implode("\n", [
            'APP_NAME="Cliente '.$dominio.'"', 'APP_ENV=local', 'APP_DEBUG=false', 'APP_KEY=base64:'.base64_encode(random_bytes(32)),
            'APP_URL=http://'.$dominio, 'LOG_CHANNEL=single', 'BCRYPT_ROUNDS=4',
            'DB_CONNECTION=mysql', 'DB_HOST='.self::$conexion['host'], 'DB_PORT='.self::$conexion['port'],
            'DB_DATABASE='.$base, 'DB_USERNAME='.self::$conexion['username'], 'DB_PASSWORD="'.self::$conexion['password'].'"',
            'CACHE_STORE=file', 'SESSION_DRIVER=array', 'QUEUE_CONNECTION=sync',
            'SUPERADMIN_PASSWORD='.$clave,
        ])."\n");
    }

    private function escribirArnesesDePrueba(): void
    {
        file_put_contents(self::$raiz.'/peticion.php', <<<'PHP'
<?php
// Un pedido HTTP como lo recibe el servidor, pero desde la consola: argv[1] = código, argv[2] = JSON del pedido.
$p = json_decode(file_get_contents($argv[2]), true);
$partes = parse_url($p['uri']);
parse_str($partes['query'] ?? '', $_GET);
$_POST = $p['datos'] ?? [];
$_SERVER = array_merge($_SERVER, [
    'HTTP_HOST' => $p['host'], 'SERVER_NAME' => $p['host'], 'REQUEST_METHOD' => $p['metodo'], 'REQUEST_URI' => $p['uri'],
    'SCRIPT_NAME' => '/index.php', 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_ACCEPT' => 'application/json',
    'CONTENT_TYPE' => 'application/x-www-form-urlencoded',
]);
if (! empty($p['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer '.$p['token'];
}
register_shutdown_function(function () {
    $cuerpo = ob_get_clean();
    echo json_encode(['status' => http_response_code() ?: 200, 'cuerpo' => json_decode($cuerpo, true) ?? $cuerpo]);
});
ob_start();
require $argv[1].'/public/index.php';
PHP);
        file_put_contents(self::$raiz.'/codigo.php', <<<'PHP'
<?php
// Arranca la aplicación como `artisan` (con CCS_CLIENTE) y corre el fragmento de argv[2]; devuelve su resultado en JSON.
define('LARAVEL_START', microtime(true));
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
echo json_encode(['r' => require $argv[2]]);
PHP);
    }

    // ------------------------------------------------------------------ ayudas

    private static function pdo(?string $base = null): PDO
    {
        $c = self::$conexion;

        return new PDO('mysql:host='.$c['host'].';port='.$c['port'].($base ? ';dbname='.$base : ''), $c['username'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    }

    private static function borrar(string $dir): void
    {
        foreach (glob($dir.'/{,.}[!.,!..]*', GLOB_BRACE) ?: [] as $f) {
            is_dir($f) && ! is_link($f) ? self::borrar($f) : @unlink($f);
        }
        @rmdir($dir);
    }

    protected function cuenta(string $base, string $tabla): int
    {
        return (int) self::pdo()->query('SELECT COUNT(*) FROM `'.$base.'`.`'.$tabla.'`')->fetchColumn();
    }

    /** Un comando de `artisan` en un proceso aparte. `$cliente` null = sin CCS_CLIENTE (administración). */
    protected function proceso(array $comando, ?string $cliente = null, array $extra = []): Process
    {
        $limpiar = [];
        foreach (array_keys(getenv()) as $k) {
            if (preg_match('/^(APP|DB|CACHE|SESSION|QUEUE|LOG|MAIL|ARCA|LICENCIA|CHECAT|RESPALDOS|TRUSTED|CORS|BCRYPT|SUPERADMIN|CCS|BROADCAST|PULSE|TELESCOPE)_/', $k)) {
                $limpiar[$k] = false;
            }
        }
        $entorno = $extra + ['CCS_CLIENTES' => self::$raiz.'/clientes'] + ($cliente !== null ? ['CCS_CLIENTE' => $cliente] : []);
        $p = new Process([PHP_BINARY, ...$comando], base_path(), $entorno + $limpiar, null, 300);
        $p->run();

        return $p;
    }

    protected function artisanDe(?string $cliente, array $args): Process
    {
        return $this->proceso([base_path('artisan'), ...$args, '--no-ansi'], $cliente);
    }

    protected function artisanOk(?string $cliente, array $args): Process
    {
        $p = $this->artisanDe($cliente, $args);
        $this->assertSame(0, $p->getExitCode(), 'artisan '.implode(' ', $args).' (cliente '.($cliente ?? '-')."):\n".$p->getOutput().$p->getErrorOutput());

        return $p;
    }

    /** @return array{status:int, cuerpo:mixed} */
    protected function pedir(string $host, string $metodo, string $uri, array $datos = [], ?string $token = null): array
    {
        $archivo = self::$raiz.'/pedido-'.bin2hex(random_bytes(3)).'.json';
        file_put_contents($archivo, json_encode(['host' => $host, 'metodo' => $metodo, 'uri' => $uri, 'datos' => $datos, 'token' => $token]));
        $p = $this->proceso([self::$raiz.'/peticion.php', base_path(), $archivo]);
        $r = json_decode($p->getOutput(), true);
        $this->assertIsArray($r, "El pedido {$metodo} {$uri} ({$host}) no respondió:\n".$p->getOutput().$p->getErrorOutput());

        return $r;
    }

    protected function login(string $host, string $clave = 'Clave-de-prueba-1'): string
    {
        $r = $this->pedir($host, 'POST', '/api/auth/login', ['usuario' => 'Administrador', 'password' => $clave]);
        $this->assertSame(200, $r['status'], json_encode($r));

        return $r['cuerpo']['token'];
    }

    /** Corre un fragmento de PHP dentro de la aplicación de ese cliente (como un comando de consola). */
    protected function dentroDe(string $cliente, string $fragmento): mixed
    {
        $archivo = self::$raiz.'/fragmento-'.bin2hex(random_bytes(3)).'.php';
        file_put_contents($archivo, "<?php\n".$fragmento);
        $p = $this->proceso([self::$raiz.'/codigo.php', base_path(), $archivo], $cliente);
        $r = json_decode($p->getOutput(), true);
        $this->assertIsArray($r, "El fragmento falló en {$cliente}:\n".$p->getOutput().$p->getErrorOutput());

        return $r['r'];
    }
}
