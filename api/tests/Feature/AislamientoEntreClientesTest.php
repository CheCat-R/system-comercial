<?php

namespace Tests\Feature;

use PDO;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * DOS CLIENTES EN LA MISMA INSTALACIÓN NO SE VEN.
 *
 * Es la prueba de que "un código, una base por cliente" aísla de verdad. Se arman dos clientes reales (cada uno con su base MySQL,
 * su `.env` y su carpeta) y se los usa como en producción: por el `public/index.php` con el dominio de cada uno y por `artisan`
 * con `CCS_CLIENTE`. Cada paso corre en un PROCESO APARTE, igual que dos pedidos distintos del servidor.
 */
class AislamientoEntreClientesTest extends TestCase
{
    private const A = 'cliente-a.ccs.test';

    private const B = 'cliente-b.ccs.test';

    private const CLAVE = 'Clave-de-prueba-1';

    private static bool $armado = false;

    private static string $raiz = '';

    private static array $conexion = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (! self::$armado) {
            $this->armarClientes();
        }
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$conexion) {
            $pdo = self::pdo();
            foreach (['a', 'b'] as $x) {
                $pdo->exec('DROP DATABASE IF EXISTS `ccs_aislamiento_'.$x.'`');
            }
        }
        if (self::$raiz !== '' && is_dir(self::$raiz)) {
            self::borrar(self::$raiz);
        }
        parent::tearDownAfterClass();
    }

    // ------------------------------------------------------------------ armado

    private function armarClientes(): void
    {
        self::$conexion = config('database.connections.mysql');
        try {
            $pdo = self::pdo();
            foreach (['a', 'b'] as $x) {
                $pdo->exec('DROP DATABASE IF EXISTS `ccs_aislamiento_'.$x.'`');
                $pdo->exec('CREATE DATABASE `ccs_aislamiento_'.$x.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            }
        } catch (\Throwable $e) {
            self::$conexion = [];
            $this->markTestSkipped('No se pueden crear bases de datos de prueba: '.$e->getMessage());
        }

        // Dentro del proyecto y no en /tmp: así comparte la unidad (Windows) con el código y la caché de configuración por cliente funciona.
        self::$raiz = base_path('storage/framework/testing/aislamiento-'.bin2hex(random_bytes(4)));
        foreach ([self::A => 'a', self::B => 'b'] as $dominio => $x) {
            mkdir(self::$raiz.'/clientes/'.$dominio, 0777, true);
            file_put_contents(self::$raiz.'/clientes/'.$dominio.'/.env', implode("\n", [
                'APP_NAME="Cliente '.strtoupper($x).'"', 'APP_ENV=local', 'APP_DEBUG=false', 'APP_KEY=base64:'.base64_encode(random_bytes(32)),
                'APP_URL=http://'.$dominio, 'LOG_CHANNEL=single', 'BCRYPT_ROUNDS=4',
                'DB_CONNECTION=mysql', 'DB_HOST='.self::$conexion['host'], 'DB_PORT='.self::$conexion['port'],
                'DB_DATABASE=ccs_aislamiento_'.$x, 'DB_USERNAME='.self::$conexion['username'], 'DB_PASSWORD="'.self::$conexion['password'].'"',
                'CACHE_STORE=file', 'SESSION_DRIVER=array', 'QUEUE_CONNECTION=sync',
                'SUPERADMIN_PASSWORD='.self::CLAVE,
            ])."\n");
        }

        // Cada uno con SU plan: si algo se cruzara, se vería.
        $this->artisan_(self::A, ['cliente:aprovisionar', '--plan=pymes']);
        $this->artisan_(self::B, ['cliente:aprovisionar', '--plan=emprendedor']);

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

        self::$armado = true;
    }

    // ------------------------------------------------------------------ ayudas

    private static function pdo(): PDO
    {
        $c = self::$conexion;

        return new PDO('mysql:host='.$c['host'].';port='.$c['port'], $c['username'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    }

    private static function borrar(string $dir): void
    {
        foreach (glob($dir.'/{,.}[!.,!..]*', GLOB_BRACE) ?: [] as $f) {
            is_dir($f) && ! is_link($f) ? self::borrar($f) : @unlink($f);
        }
        @rmdir($dir);
    }

    /** El proceso hijo NO hereda lo de PHPUnit (otra base, APP_ENV=testing…): solo debe ver el `.env` del cliente. */
    private function proceso(array $comando, array $extra = []): Process
    {
        $limpiar = [];
        foreach (array_keys(getenv()) as $k) {
            if (preg_match('/^(APP|DB|CACHE|SESSION|QUEUE|LOG|MAIL|ARCA|LICENCIA|CHECAT|RESPALDOS|TRUSTED|CORS|BCRYPT|SUPERADMIN|CCS|BROADCAST|PULSE|TELESCOPE)_/', $k)) {
                $limpiar[$k] = false;
            }
        }
        $p = new Process([PHP_BINARY, ...$comando], base_path(), $limpiar + ['CCS_CLIENTES' => self::$raiz.'/clientes'] + $extra, null, 120);
        $p->run();

        return $p;
    }

    private function artisan_(string $cliente, array $args): Process
    {
        $p = $this->proceso([base_path('artisan'), ...$args], ['CCS_CLIENTE' => $cliente]);
        $this->assertSame(0, $p->getExitCode(), 'artisan '.implode(' ', $args)." (cliente {$cliente}):\n".$p->getOutput().$p->getErrorOutput());

        return $p;
    }

    /** @return array{status:int, cuerpo:mixed} */
    private function pedir(string $host, string $metodo, string $uri, array $datos = [], ?string $token = null): array
    {
        $archivo = self::$raiz.'/pedido-'.bin2hex(random_bytes(3)).'.json';
        file_put_contents($archivo, json_encode(['host' => $host, 'metodo' => $metodo, 'uri' => $uri, 'datos' => $datos, 'token' => $token]));
        $p = $this->proceso([self::$raiz.'/peticion.php', base_path(), $archivo]);
        $r = json_decode($p->getOutput(), true);
        $this->assertIsArray($r, "El pedido {$metodo} {$uri} ({$host}) no respondió:\n".$p->getOutput().$p->getErrorOutput());

        return $r;
    }

    private function login(string $host): string
    {
        $r = $this->pedir($host, 'POST', '/api/auth/login', ['usuario' => 'Administrador', 'password' => self::CLAVE]);
        $this->assertSame(200, $r['status'], json_encode($r));

        return $r['cuerpo']['token'];
    }

    /** Corre un fragmento de PHP dentro de la aplicación de ese cliente (como un comando de consola). */
    private function dentroDe(string $cliente, string $fragmento): mixed
    {
        $archivo = self::$raiz.'/fragmento-'.bin2hex(random_bytes(3)).'.php';
        file_put_contents($archivo, "<?php\n".$fragmento);
        $p = $this->proceso([self::$raiz.'/codigo.php', base_path(), $archivo], ['CCS_CLIENTE' => $cliente]);
        $r = json_decode($p->getOutput(), true);
        $this->assertIsArray($r, "El fragmento falló en {$cliente}:\n".$p->getOutput().$p->getErrorOutput());

        return $r['r'];
    }

    private function cuenta(string $x, string $tabla): int
    {
        return (int) self::pdo()->query('SELECT COUNT(*) FROM `ccs_aislamiento_'.$x.'`.`'.$tabla.'`')->fetchColumn();
    }

    // ------------------------------------------------------------------ pruebas

    public function test_cada_cliente_usa_su_base_su_carpeta_y_su_certificado(): void
    {
        $a = $this->dentroDe(self::A, 'return [config("database.connections.mysql.database"), str_replace("\\\\", "/", storage_path()), str_replace("\\\\", "/", config("arca.cert_path")), str_replace("\\\\", "/", config("arca.key_path"))];');
        $b = $this->dentroDe(self::B, 'return [config("database.connections.mysql.database"), str_replace("\\\\", "/", storage_path()), str_replace("\\\\", "/", config("arca.cert_path")), str_replace("\\\\", "/", config("arca.key_path"))];');
        $raiz = str_replace('\\', '/', realpath(self::$raiz.'/clientes'));

        $this->assertSame('ccs_aislamiento_a', $a[0]);
        $this->assertSame('ccs_aislamiento_b', $b[0]);
        $this->assertSame($raiz.'/'.self::A.'/storage', $a[1]);
        $this->assertSame($raiz.'/'.self::B.'/storage', $b[1]);
        $this->assertSame($raiz.'/'.self::A.'/arca/certificado.crt', $a[2]);
        $this->assertSame($raiz.'/'.self::A.'/arca/clave.key', $a[3]);
        $this->assertSame($raiz.'/'.self::B.'/arca/certificado.crt', $b[2]);
        $this->assertDirectoryExists($raiz.'/'.self::A.'/arca');
    }

    public function test_cada_cliente_tiene_su_plan(): void
    {
        $this->assertSame('pymes', $this->dentroDe(self::A, 'return app(App\Services\LicenciaService::class)->plan();'));
        $this->assertSame('emprendedor', $this->dentroDe(self::B, 'return app(App\Services\LicenciaService::class)->plan();'));
    }

    public function test_los_datos_de_uno_no_aparecen_en_el_otro(): void
    {
        $tokenA = $this->login(self::A);
        $tokenB = $this->login(self::B);

        $r = $this->pedir(self::A, 'POST', '/api/proveedores', ['nombre' => 'Molinos de A', 'condicionIva' => 'responsable_inscripto'], $tokenA);
        $this->assertSame(201, $r['status'], json_encode($r));

        $this->assertSame(1, $this->cuenta('a', 'proveedores'));
        $this->assertSame(0, $this->cuenta('b', 'proveedores'));

        $enA = $this->pedir(self::A, 'GET', '/api/proveedores', [], $tokenA);
        $enB = $this->pedir(self::B, 'GET', '/api/proveedores', [], $tokenB);
        $this->assertStringContainsString('Molinos de A', json_encode($enA['cuerpo']));
        $this->assertStringNotContainsString('Molinos de A', json_encode($enB['cuerpo']));
    }

    public function test_la_sesion_de_un_cliente_no_vale_en_el_otro(): void
    {
        $tokenA = $this->login(self::A);

        $this->assertSame(200, $this->pedir(self::A, 'GET', '/api/proveedores', [], $tokenA)['status']);
        $this->assertSame(401, $this->pedir(self::B, 'GET', '/api/proveedores', [], $tokenA)['status'], 'el token de A no abre la puerta de B');
    }

    public function test_la_cache_y_los_candados_no_se_cruzan(): void
    {
        // El candado fiscal es `venta-fiscal:{id}` y el id 1 existe en TODOS los clientes: si compartieran caché, una venta de uno frenaría la del otro.
        $this->assertTrue($this->dentroDe(self::A, 'return (bool) Illuminate\Support\Facades\Cache::lock("venta-fiscal:1", 60)->get();'));
        $this->assertFalse($this->dentroDe(self::A, 'return (bool) Illuminate\Support\Facades\Cache::lock("venta-fiscal:1", 60)->get();'), 'el candado de A sigue tomado');
        $this->assertTrue($this->dentroDe(self::B, 'return (bool) Illuminate\Support\Facades\Cache::lock("venta-fiscal:1", 60)->get();'), 'el de B es otro');

        $this->dentroDe(self::A, 'Illuminate\Support\Facades\Cache::put("clave-comun", "valor de A", 300); return 1;');
        $this->assertNull($this->dentroDe(self::B, 'return Illuminate\Support\Facades\Cache::get("clave-comun");'));
        $this->assertSame('valor de A', $this->dentroDe(self::A, 'return Illuminate\Support\Facades\Cache::get("clave-comun");'));
    }

    public function test_la_configuracion_cacheada_de_un_cliente_no_se_le_sirve_a_otro(): void
    {
        $this->artisan_(self::A, ['config:cache']);

        $this->assertFileExists(self::$raiz.'/clientes/'.self::A.'/cache/config.php', 'la caché de A queda en la carpeta de A');
        $this->assertFileDoesNotExist(base_path('bootstrap/cache/config.php'), 'y no en la del código, que sería de todos');
        $this->assertSame('ccs_aislamiento_a', $this->dentroDe(self::A, 'return config("database.connections.mysql.database");'));
        $this->assertSame('ccs_aislamiento_b', $this->dentroDe(self::B, 'return config("database.connections.mysql.database");'), 'B no recibe la configuración de A');

        $this->artisan_(self::A, ['config:clear']);
    }

    public function test_un_dominio_que_no_es_cliente_recibe_404(): void
    {
        foreach (['otro.ccs.test', 'cliente-a.ccs.test.evil.com', '..', 'cliente-a.ccs.test/../x'] as $host) {
            $r = $this->pedir($host, 'GET', '/api/proveedores');
            $this->assertSame(404, $r['status'], $host);
            $this->assertSame('Sitio no encontrado.', $r['cuerpo']['message'] ?? null, $host);
        }
    }

    public function test_un_comando_de_datos_sin_cliente_no_corre(): void
    {
        $p = $this->proceso([base_path('artisan'), 'migrate:status']);

        $this->assertNotSame(0, $p->getExitCode());
        $this->assertStringContainsString('CCS_CLIENTE', $p->getErrorOutput());
        $this->assertSame(0, $this->proceso([base_path('artisan'), 'list'])->getExitCode(), 'la ayuda sí corre sin cliente');
    }
}
