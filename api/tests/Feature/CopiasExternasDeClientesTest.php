<?php

namespace Tests\Feature;

use App\CopiasExternas\Cifrado;
use Symfony\Component\Process\Process;
use Tests\Concerns\UsaClientesDePrueba;
use Tests\TestCase;

/**
 * LA COPIA EXTERNA DE PUNTA A PUNTA, con varios clientes: `ccs:cron` → `ccs:copias-subir` → un proceso por cliente que vuelca, cifra y
 * sube. Google es un servidor de mentira (un `php -S` con las rutas de Drive que se usan), así que se prueban los procesos de
 * verdad: de qué base sale cada copia, que se pueda descifrar con la clave, que no queden archivos y que un fallo no pare a los demás.
 */
class CopiasExternasDeClientesTest extends TestCase
{
    use UsaClientesDePrueba;

    private const A = 'kiosco-a.ccs.test';

    private const B = 'verduleria-b.ccs.test';

    private const BASES = 'ccs_copiaext_';

    private static ?Process $google = null;

    private static string $clave = '';

    protected function setUp(): void
    {
        parent::setUp();
        if (! self::$armado) {
            $this->iniciarEntorno(self::BASES, ['a', 'b']);
            $this->escribirEntorno(self::A, self::BASES.'a');
            $this->escribirEntorno(self::B, self::BASES.'b');
            $this->artisanOk(self::A, ['cliente:aprovisionar', '--plan=pymes']);        // tiene "Sucursal 1"
            $this->artisanOk(self::B, ['cliente:aprovisionar', '--plan=emprendedor']);  // no la tiene, y por plan NO hace copia diaria

            $this->arrancarGoogleDeMentira();
        }
    }

    public static function tearDownAfterClass(): void
    {
        self::$google?->stop();
        self::$google = null;
        self::derribarEntorno(self::BASES, ['a', 'b']);
        parent::tearDownAfterClass();
    }

    // ------------------------------------------------------------------ el Google de mentira

    private function arrancarGoogleDeMentira(): void
    {
        mkdir(self::$raiz.'/google', 0777, true);
        file_put_contents(self::$raiz.'/router.php', <<<'PHP'
<?php
// Un Drive de mentira con lo que usa CCS. Estado en archivos (un pedido por proceso).
$dir = getenv('MOCK_DIR');
$m = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
parse_str((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), $q);
$f = $dir.'/db.json';
$db = is_file($f) ? json_decode(file_get_contents($f), true) : ['n' => 0, 'f' => ['raiz' => ['name' => 'CCS Respaldos', 'parent' => null, 'folder' => true, 'creado' => 0]]];
$cuerpo = file_get_contents('php://input');
function responder($d, $c = 200) { http_response_code($c); header('Content-Type: application/json'); echo json_encode($d); }
register_shutdown_function(function () use ($dir, &$db) { file_put_contents($dir.'/db.json', json_encode($db)); });

if ($path === '/token') { return responder(['access_token' => 'tok', 'expires_in' => 3600]); }
if ($path === '/upload/drive/v3/files' && $m === 'POST') {
    $d = json_decode($cuerpo, true); $id = 'a'.(++$db['n']);
    $db['f'][$id] = ['name' => $d['name'], 'parent' => $d['parents'][0], 'folder' => false, 'creado' => $db['n']];
    file_put_contents($dir.'/blob-'.$id, '');
    header('Location: http://'.$_SERVER['HTTP_HOST'].'/session/'.$id, true, 200);   // (PHP pone 302 solo si no se le dice)
    return;
}
if (preg_match('#^/session/(.+)$#', $path, $s) && $m === 'PUT') {
    $id = $s[1];
    file_put_contents($dir.'/blob-'.$id, $cuerpo, FILE_APPEND);
    preg_match('#bytes (\d+)-(\d+)/(\d+)#', $_SERVER['HTTP_CONTENT_RANGE'], $r);
    if ((int) $r[2] + 1 < (int) $r[3]) { http_response_code(308); header('Range: bytes=0-'.$r[2]); return; }
    return responder(['id' => $id, 'name' => $db['f'][$id]['name'], 'size' => (string) filesize($dir.'/blob-'.$id)]);
}
if (preg_match('#^/drive/v3/files/(.+)$#', $path, $s)) {
    if ($m === 'DELETE') { unset($db['f'][$s[1]]); @unlink($dir.'/blob-'.$s[1]); http_response_code(204); return; }
    if (($q['alt'] ?? '') === 'media') { header('Content-Type: application/octet-stream'); readfile($dir.'/blob-'.$s[1]); return; }
}
if ($path === '/drive/v3/files' && $m === 'POST') {
    $d = json_decode($cuerpo, true); $id = 'c'.(++$db['n']);
    $db['f'][$id] = ['name' => $d['name'], 'parent' => $d['parents'][0], 'folder' => true, 'creado' => $db['n']];
    return responder(['id' => $id]);
}
if ($path === '/drive/v3/files' && $m === 'GET') {
    preg_match("/'([^']+)' in parents/", $q['q'], $p); $padre = ($p[1] ?? 'root') === 'root' ? null : $p[1];
    $carpetas = str_contains($q['q'], "mimeType='application/vnd.google-apps.folder'");
    $hijos = array_filter($db['f'], fn ($x) => $x['parent'] === $padre && $x['folder'] === $carpetas);
    if (preg_match("/name='([^']+)'/", $q['q'], $n)) { $hijos = array_filter($hijos, fn ($x) => $x['name'] === $n[1]); }
    uasort($hijos, fn ($a, $b) => $b['creado'] <=> $a['creado']);
    return responder(['files' => array_map(fn ($k, $x) => ['id' => $k, 'name' => $x['name'], 'size' => (string) @filesize($dir.'/blob-'.$k), 'createdTime' => '2026-10-09T12:'.str_pad((string) $x['creado'], 2, '0', STR_PAD_LEFT).':00Z'], array_keys($hijos), $hijos)]);
}
http_response_code(404);
PHP);

        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $puerto = (int) explode(':', stream_socket_get_name($socket, false))[1];
        fclose($socket);
        self::$google = new Process([PHP_BINARY, '-S', '127.0.0.1:'.$puerto, self::$raiz.'/router.php'], self::$raiz, ['MOCK_DIR' => self::$raiz.'/google'], null, null);
        self::$google->start();
        for ($i = 0; $i < 50 && ! @fsockopen('127.0.0.1', $puerto); $i++) {
            usleep(100000);
        }

        self::$clave = Cifrado::nuevaClave();
        file_put_contents(self::$raiz.'/clientes/_copias.json', json_encode([
            'clientId' => 'id', 'clientSecret' => 'secreto', 'refreshToken' => 'refresco', 'claveCifrado' => self::$clave,
            'carpetaRaiz' => 'raiz', 'retencion' => 2, 'apiUrl' => 'http://127.0.0.1:'.$puerto, 'oauthUrl' => 'http://127.0.0.1:'.$puerto,
        ]));
    }

    /** @return array<string, array{name:string, parent:?string, folder:bool, creado:int}> */
    private function drive(): array
    {
        return json_decode((string) file_get_contents(self::$raiz.'/google/db.json'), true)['f'];
    }

    /** @return list<string> ids de los archivos (no carpetas) de la carpeta de ese cliente, del más nuevo al más viejo */
    private function archivosDe(string $cliente): array
    {
        $carpeta = collect($this->drive())->filter(fn ($f) => $f['folder'] && $f['name'] === $cliente)->keys()->first();
        $hijos = collect($this->drive())->filter(fn ($f) => ! $f['folder'] && $f['parent'] === $carpeta)->sortByDesc('creado');

        return $hijos->keys()->all();
    }

    private function sqlDe(string $idArchivo): string
    {
        Cifrado::descifrar(self::$raiz.'/google/blob-'.$idArchivo, self::$raiz.'/descifrado.sql.gz', self::$clave);
        $sql = gzdecode((string) file_get_contents(self::$raiz.'/descifrado.sql.gz'));
        unlink(self::$raiz.'/descifrado.sql.gz');

        return $sql;
    }

    // ------------------------------------------------------------------ pruebas

    public function test_cada_cliente_sube_su_propia_copia_cifrada_aunque_su_plan_no_tenga_copia_diaria(): void
    {
        $p = $this->artisanOk(null, ['ccs:copias-subir']);

        $this->assertStringContainsString(self::A.': Copia en Drive', $p->getOutput());
        $this->assertStringContainsString(self::B.': Copia en Drive', $p->getOutput());

        $deA = $this->archivosDe(self::A);
        $deB = $this->archivosDe(self::B);
        $this->assertCount(1, $deA);
        $this->assertCount(1, $deB);

        $sqlA = $this->sqlDe($deA[0]);
        $sqlB = $this->sqlDe($deB[0]);
        $this->assertStringContainsString("'Sucursal 1'", $sqlA, 'la copia de A es de la base de A (Pymes tiene Sucursal 1)');
        $this->assertStringNotContainsString("'Sucursal 1'", $sqlB, 'la de B es de la base de B: nada de A se mezcla');
        $this->assertStringContainsString('INSERT INTO `usuarios`', $sqlB);

        foreach ([self::A, self::B] as $c) {
            $this->assertSame([], glob(self::$raiz.'/clientes/'.$c.'/storage/app/copia-externa/*') ?: [], $c.': no queda nada en el servidor');
        }
        $this->assertSame([], glob(self::$raiz.'/clientes/'.self::B.'/storage/app/respaldos/respaldo-auto-*') ?: [], 'y la externa no inventa una copia diaria para el Emprendedor');
    }

    public function test_el_cron_diario_hace_las_copias_del_servidor_y_despues_las_de_afuera_y_poda(): void
    {
        $p = $this->artisanOk(null, ['ccs:cron']);

        $this->assertMatchesRegularExpression('/'.preg_quote(self::A, '/').': Copia generada/', $p->getOutput(), 'primero la copia diaria del servidor');
        $this->assertStringContainsString('Copias externas', $p->getOutput());
        $this->assertCount(2, $this->archivosDe(self::A));

        $this->artisanOk(null, ['ccs:cron']);
        $this->assertCount(2, $this->archivosDe(self::A), 'retención 2: la más vieja se borró de Drive');
        $this->assertCount(4, glob(self::$raiz.'/google/blob-*'), 'y también su contenido (2 de cada cliente)');
    }

    public function test_un_cliente_suspendido_se_omite_y_un_fallo_de_google_no_para_a_los_demas(): void
    {
        $this->artisanOk(null, ['ccs:suspender', self::B, '--sin-copia']);
        $p = $this->artisanOk(null, ['ccs:copias-subir']);
        $this->assertStringContainsString(self::B.': suspendido, se omite', $p->getOutput());
        $this->artisanOk(null, ['ccs:reactivar', self::B]);

        // Google se cae: cada cliente informa su falla y el comando termina en error (el cron lo muestra).
        self::$google->stop();
        $p = $this->artisanDe(null, ['ccs:copias-subir']);
        $this->assertNotSame(0, $p->getExitCode());
        $salida = $p->getOutput().$p->getErrorOutput();
        $this->assertStringContainsString(self::A.': SIN COPIA EXTERNA', $salida);
        $this->assertStringContainsString(self::B.': SIN COPIA EXTERNA', $salida, 'cada uno se intentó por separado');
        $this->assertSame([], glob(self::$raiz.'/clientes/'.self::A.'/storage/app/copia-externa/*') ?: [], 'y el fallo tampoco deja copias sueltas');
    }
}
