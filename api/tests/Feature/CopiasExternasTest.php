<?php

namespace Tests\Feature;

use App\CopiasExternas\Cifrado;
use App\CopiasExternas\CopiaExterna;
use App\CopiasExternas\GoogleDrive;
use App\Services\RespaldosService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Console\Output\BufferedOutput;
use Tests\TestCase;

/**
 * La copia que sale a Google Drive: que se suba entera y cifrada, que se pode lo viejo sin tocar lo ajeno, y que un fallo se vea.
 * Google se reemplaza por un Drive de mentira en memoria (`Http::fake`) que respeta el protocolo de subida por trozos.
 */
class CopiasExternasTest extends TestCase
{
    private string $config;

    /** @var array<string, array{name:string, parent:?string, folder:bool, bytes:string, creado:int}> */
    private array $drive = [];

    private int $reloj = 0;

    /** @var array<string, string> sesión de subida → id del archivo */
    private array $sesiones = [];

    /** Cuántas veces responder 503 al próximo trozo (para probar los reintentos). */
    private int $fallar = 0;

    /** Bytes que "guarda" Google de menos (para probar la verificación de tamaño). */
    private int $recortar = 0;

    /** Qué contesta el servidor de autorización de Google (se cambia en las pruebas que lo necesitan). */
    private ?\Closure $respuestaToken = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->config = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ccs-copias-'.bin2hex(random_bytes(4)).'.json';
        config(['checat.copias_archivo' => $this->config]);
        $this->drive = [];
        $this->armarDriveDeMentira();
    }

    protected function tearDown(): void
    {
        @unlink($this->config);
        parent::tearDown();
    }

    private function configurar(int $retencion = 30): array
    {
        $cfg = ['clientId' => 'id', 'clientSecret' => 'secreto', 'refreshToken' => 'refresco', 'claveCifrado' => Cifrado::nuevaClave(), 'carpetaRaiz' => 'raiz', 'retencion' => $retencion];
        CopiaExterna::guardar($cfg);

        return $cfg;
    }

    // ------------------------------------------------------------------ el Drive de mentira

    private function armarDriveDeMentira(): void
    {
        $this->drive['raiz'] = ['name' => 'CCS Respaldos', 'parent' => null, 'folder' => true, 'bytes' => '', 'creado' => 0];
        Http::preventStrayRequests();
        Http::fake([
            'oauth2.googleapis.com/token' => fn (Request $r) => ($this->respuestaToken ?? fn () => Http::response(['access_token' => 'token-de-prueba', 'expires_in' => 3600]))($r),
            'upload.test/*' => fn (Request $r) => $this->recibirTrozo($r),
            'www.googleapis.com/upload/drive/v3/files*' => function (Request $r) {
                $id = 'a'.(++$this->reloj);
                $this->drive[$id] = ['name' => $r->data()['name'], 'parent' => $r->data()['parents'][0], 'folder' => false, 'bytes' => '', 'creado' => $this->reloj];
                $this->sesiones['s'.$id] = $id;

                return Http::response('', 200, ['Location' => 'https://upload.test/s'.$id]);
            },
            'www.googleapis.com/drive/v3/files*' => fn (Request $r) => $this->archivos($r),
        ]);
    }

    private function recibirTrozo(Request $r)
    {
        if ($this->fallar > 0) {
            $this->fallar--;

            return Http::response('', 503);
        }
        $id = $this->sesiones[basename($r->url())];
        preg_match('#bytes (\d+)-(\d+)/(\d+)#', $r->header('Content-Range')[0], $m);
        $this->assertSame(strlen($this->drive[$id]['bytes']), (int) $m[1], 'los trozos llegan en orden y sin huecos');
        $this->drive[$id]['bytes'] .= $r->body();
        if ((int) $m[2] + 1 < (int) $m[3]) {
            return Http::response('', 308, ['Range' => 'bytes=0-'.$m[2]]);
        }
        $guardado = strlen($this->drive[$id]['bytes']) - $this->recortar;

        return Http::response(['id' => $id, 'name' => $this->drive[$id]['name'], 'size' => (string) $guardado]);
    }

    private function archivos(Request $r)
    {
        parse_str((string) parse_url($r->url(), PHP_URL_QUERY), $q);
        $id = basename(parse_url($r->url(), PHP_URL_PATH));

        if ($r->method() === 'DELETE') {
            unset($this->drive[$id]);

            return Http::response('', 204);
        }
        if ($r->method() === 'POST') {
            $nuevo = 'c'.(++$this->reloj);
            $this->drive[$nuevo] = ['name' => $r->data()['name'], 'parent' => $r->data()['parents'][0], 'folder' => true, 'bytes' => '', 'creado' => $this->reloj];

            return Http::response(['id' => $nuevo]);
        }
        if (($q['alt'] ?? '') === 'media') {
            return Http::response($this->drive[$id]['bytes']);
        }

        preg_match("/'([^']+)' in parents/", $q['q'], $padre);
        $padre = ($padre[1] ?? 'root') === 'root' ? null : $padre[1];
        $quiereCarpetas = str_contains($q['q'], "mimeType='application/vnd.google-apps.folder'");
        $hijos = array_filter($this->drive, fn ($f) => $f['parent'] === $padre && $f['folder'] === $quiereCarpetas);
        if (preg_match("/name='([^']+)'/", $q['q'], $nombre)) {
            $hijos = array_filter($hijos, fn ($f) => $f['name'] === $nombre[1]);
        }
        uasort($hijos, fn ($a, $b) => $b['creado'] <=> $a['creado']);

        return Http::response(['files' => array_map(fn ($k, $f) => ['id' => $k, 'name' => $f['name'], 'size' => (string) strlen($f['bytes']), 'createdTime' => '2026-10-09T12:'.str_pad((string) $f['creado'], 2, '0', STR_PAD_LEFT).':00Z'], array_keys($hijos), $hijos)]);
    }

    private function archivosEnDrive(string $carpeta): array
    {
        return array_values(array_map(fn ($f) => $f['name'], array_filter($this->drive, fn ($f) => $f['parent'] === $carpeta && ! $f['folder'])));
    }

    private function carpetaDe(string $nombre): ?string
    {
        foreach ($this->drive as $id => $f) {
            if ($f['folder'] && $f['name'] === $nombre && $f['parent'] === 'raiz') {
                return $id;
            }
        }

        return null;
    }

    // ------------------------------------------------------------------ GoogleDrive

    public function test_sube_en_trozos_en_orden_y_google_guarda_lo_mismo_que_se_envio(): void
    {
        $cfg = $this->configurar();
        $ruta = tempnam(sys_get_temp_dir(), 'ccs');
        file_put_contents($ruta, random_bytes(256 * 1024 * 2 + 1000));   // 3 trozos de 256 KiB
        try {
            $r = (new GoogleDrive($cfg, 256 * 1024))->subir($ruta, 'copia.sql.gz.enc', 'raiz');
        } finally {
            @unlink($ruta);
        }

        $subido = $this->drive[$r['id']];
        $this->assertSame(256 * 1024 * 2 + 1000, strlen($subido['bytes']));
        $puts = Http::recorded(fn (Request $q) => $q->method() === 'PUT')->values();
        $this->assertCount(3, $puts);
        $this->assertSame('bytes 0-262143/525288', $puts[0][0]->header('Content-Range')[0]);
        $this->assertSame('bytes 524288-525287/525288', $puts[2][0]->header('Content-Range')[0]);
    }

    public function test_un_corte_pasajero_se_reintenta_y_uno_permanente_se_informa(): void
    {
        $cfg = $this->configurar();
        $ruta = tempnam(sys_get_temp_dir(), 'ccs');
        file_put_contents($ruta, random_bytes(1000));
        try {
            $this->fallar = 2;
            $r = (new GoogleDrive($cfg))->subir($ruta, 'a.enc', 'raiz');
            $this->assertSame(1000, strlen($this->drive[$r['id']]['bytes']), 'a los dos fallos le siguió un intento bueno');

            $this->fallar = 5;
            $this->expectExceptionMessage('Se cortó la subida después de 3 intentos');
            (new GoogleDrive($cfg))->subir($ruta, 'b.enc', 'raiz');
        } finally {
            @unlink($ruta);
        }
    }

    public function test_si_google_guarda_menos_bytes_de_los_enviados_la_copia_se_borra_y_se_avisa(): void
    {
        $cfg = $this->configurar();
        $ruta = tempnam(sys_get_temp_dir(), 'ccs');
        file_put_contents($ruta, random_bytes(1000));
        $this->recortar = 10;
        try {
            (new GoogleDrive($cfg))->subir($ruta, 'a.enc', 'raiz');
            $this->fail('tendría que haber fallado');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('guardó 990 bytes', $e->getMessage());
            $this->assertSame([], $this->archivosEnDrive('raiz'), 'la copia incompleta no queda como si fuera buena');
        } finally {
            @unlink($ruta);
        }
    }

    public function test_la_carpeta_se_reusa_si_existe_y_se_crea_si_no(): void
    {
        $drive = new GoogleDrive($this->configurar());

        $this->assertNull($drive->carpeta('kiosco.ccs.com', 'raiz', crear: false));
        $a = $drive->carpeta('kiosco.ccs.com', 'raiz');
        $this->assertSame($a, $drive->carpeta('kiosco.ccs.com', 'raiz'), 'la segunda vez no crea otra');
        $this->assertNotSame($a, $drive->carpeta('verduleria.ccs.com', 'raiz'));
    }

    public function test_si_google_revoca_el_permiso_el_mensaje_dice_que_hacer(): void
    {
        $this->respuestaToken = fn () => Http::response(['error' => 'invalid_grant', 'error_description' => 'Token has been expired or revoked.'], 400);

        $this->expectExceptionMessage('ccs:copias-configurar');
        (new GoogleDrive($this->configurar()))->carpeta('x', 'raiz');
    }

    public function test_la_autorizacion_espera_a_que_el_usuario_apruebe(): void
    {
        Http::fake(['oauth2.googleapis.com/device/code' => Http::response(['device_code' => 'dc', 'user_code' => 'ABCD-EFGH', 'verification_url' => 'https://www.google.com/device', 'expires_in' => 1800, 'interval' => 5])]);
        $respuestas = [
            Http::response(['error' => 'authorization_pending'], 428),
            Http::response(['error' => 'slow_down'], 400),
            Http::response(['access_token' => 'x', 'refresh_token' => 'el-refresh', 'expires_in' => 3600]),
        ];
        $this->respuestaToken = function () use (&$respuestas) {
            return array_shift($respuestas);
        };

        $d = GoogleDrive::iniciarAutorizacion('id');
        $this->assertSame('ABCD-EFGH', $d['user_code']);
        $esperas = [];
        $refresh = GoogleDrive::esperarAutorizacion($d, 'id', 'secreto', function (int $s) use (&$esperas) {
            $esperas[] = $s;
        });

        $this->assertSame('el-refresh', $refresh);
        $this->assertSame([5, 5, 10], $esperas, 'ante "slow_down" espera más');
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/device/code') && $r['scope'] === 'https://www.googleapis.com/auth/drive.file');
    }

    public function test_si_se_rechaza_el_permiso_se_dice(): void
    {
        $this->respuestaToken = fn () => Http::response(['error' => 'access_denied'], 403);

        $this->expectExceptionMessage('Se rechazó el permiso');
        GoogleDrive::esperarAutorizacion(['device_code' => 'dc', 'interval' => 1, 'expires_in' => 100], 'id', 'secreto', fn () => null);
    }

    // ------------------------------------------------------------------ la copia completa

    public function test_la_copia_sube_cifrada_se_puede_recuperar_y_no_deja_nada_en_el_disco(): void
    {
        $cfg = $this->configurar();

        $r = (new CopiaExterna)->subir('kiosco.ccs.com', app(RespaldosService::class));

        $this->assertMatchesRegularExpression('/^kiosco\.ccs\.com-\d{4}-\d{2}-\d{2}-\d{4}\.sql\.gz\.enc$/', $r['archivo']);
        $carpeta = $this->carpetaDe('kiosco.ccs.com');
        $this->assertNotNull($carpeta);
        $this->assertSame([$r['archivo']], $this->archivosEnDrive($carpeta));
        $this->assertSame([], glob(storage_path('app/copia-externa/*')) ?: [], 'ni la copia sin cifrar ni la cifrada quedan en el servidor');

        // Lo que quedó en Drive no se lee sin la clave…
        $enDrive = collect($this->drive)->first(fn ($f) => $f['parent'] === $carpeta)['bytes'];
        $this->assertStringNotContainsString('INSERT INTO', $enDrive);
        file_put_contents($tmp = tempnam(sys_get_temp_dir(), 'ccs'), $enDrive);
        try {
            // …y con la clave vuelve a ser la base completa.
            Cifrado::descifrar($tmp, $tmp.'.gz', $cfg['claveCifrado']);
            $sql = gzdecode((string) file_get_contents($tmp.'.gz'));
            $this->assertStringContainsString('INSERT INTO `usuarios`', $sql);
            $this->assertStringContainsString('Administrador', $sql);
        } finally {
            @unlink($tmp);
            @unlink($tmp.'.gz');
        }
    }

    public function test_se_conservan_las_ultimas_n_y_no_se_toca_lo_de_otro_cliente(): void
    {
        $this->configurar(retencion: 2);
        $servicio = new CopiaExterna;
        $respaldos = app(RespaldosService::class);

        $this->travelTo(now()->setTime(10, 0));
        $servicio->subir('verduleria.ccs.com', $respaldos);
        $nombres = [];
        foreach ([1, 2, 3, 4] as $i) {
            $this->travelTo(now()->setTime(10, $i));
            $nombres[] = $servicio->subir('kiosco.ccs.com', $respaldos)['archivo'];
        }

        $kiosco = $this->archivosEnDrive($this->carpetaDe('kiosco.ccs.com'));
        sort($kiosco);
        $this->assertSame([$nombres[2], $nombres[3]], $kiosco, 'quedan las 2 últimas');
        $this->assertCount(1, $this->archivosEnDrive($this->carpetaDe('verduleria.ccs.com')), 'la copia del otro cliente sigue');
        $this->assertSame([$nombres[3], $nombres[2]], array_column($servicio->copiasDe('kiosco.ccs.com'), 'name'), 'la lista viene de la más nueva a la más vieja');
        $this->assertSame([], $servicio->copiasDe('nunca-subio.ccs.com'));
    }

    public function test_sin_configurar_la_copia_externa_avisa_como_arreglarlo(): void
    {
        $this->assertFalse(CopiaExterna::activa());

        $this->expectExceptionMessage('ccs:copias-configurar');
        (new CopiaExterna)->subir('x.ccs.com', app(RespaldosService::class));
    }

    public function test_si_falla_la_subida_tampoco_queda_nada_en_el_disco(): void
    {
        $this->configurar();
        $this->fallar = 99;

        try {
            (new CopiaExterna)->subir('kiosco.ccs.com', app(RespaldosService::class));
            $this->fail('tendría que haber fallado');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Se cortó la subida', $e->getMessage());
        }
        $this->assertSame([], glob(storage_path('app/copia-externa/*')) ?: []);
    }

    // ------------------------------------------------------------------ los comandos

    public function test_configurar_guarda_las_credenciales_y_muestra_la_clave_una_sola_vez(): void
    {
        Http::fake(['oauth2.googleapis.com/device/code' => Http::response(['device_code' => 'dc', 'user_code' => 'ABCD-EFGH', 'verification_url' => 'https://www.google.com/device', 'expires_in' => 1800, 'interval' => 1])]);
        $this->respuestaToken = fn () => Http::response(['access_token' => 'x', 'refresh_token' => 'el-refresh', 'expires_in' => 3600]);

        $out = new BufferedOutput;
        $codigo = Artisan::call('ccs:copias-configurar', ['--client-id' => 'mi-id', '--client-secret' => 'mi-secreto', '--retencion' => 10], $out);
        $salida = $out->fetch();
        $this->assertSame(0, $codigo, $salida);
        $this->assertStringContainsString('ABCD-EFGH', $salida);
        $this->assertStringContainsString('CLAVE DE CIFRADO', $salida);

        $c = CopiaExterna::configuracion();
        $this->assertSame(['mi-id', 'mi-secreto', 'el-refresh', 10], [$c['clientId'], $c['clientSecret'], $c['refreshToken'], $c['retencion']]);
        $this->assertTrue(Cifrado::claveValida($c['claveCifrado']));
        $this->assertNotEmpty($c['carpetaRaiz']);

        // Reconfigurar conserva la clave: cambiarla dejaría ilegibles las copias que ya están en Drive.
        $out = new BufferedOutput;
        $this->assertSame(0, Artisan::call('ccs:copias-configurar', ['--client-id' => 'mi-id', '--client-secret' => 'mi-secreto'], $out));
        $this->assertStringNotContainsString('CLAVE DE CIFRADO', $out->fetch());
        $this->assertSame($c['claveCifrado'], CopiaExterna::configuracion()['claveCifrado']);
    }

    public function test_bajar_una_copia_la_deja_lista_para_restaurar(): void
    {
        $this->configurar();
        $r = (new CopiaExterna)->subir('kiosco.ccs.com', app(RespaldosService::class));
        $salida = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ccs-bajada-'.bin2hex(random_bytes(3));

        try {
            $this->artisan('ccs:copias-descargar', ['dominio' => 'kiosco.ccs.com', '--salida' => $salida])->assertSuccessful();

            $sql = gzdecode((string) file_get_contents($salida.'/'.substr($r['archivo'], 0, -4)));
            $this->assertStringContainsString('INSERT INTO `usuarios`', $sql);
            $this->assertSame([substr($r['archivo'], 0, -4)], array_map('basename', glob($salida.'/*')), 'queda el descifrado, no el .enc');

            $this->artisan('ccs:copias-descargar', ['dominio' => 'otro.ccs.com', '--salida' => $salida])->assertFailed();
        } finally {
            array_map('unlink', glob($salida.'/*') ?: []);
            @rmdir($salida);
        }
    }
}
