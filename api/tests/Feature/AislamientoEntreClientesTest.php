<?php

namespace Tests\Feature;

use Tests\Concerns\UsaClientesDePrueba;
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
    use UsaClientesDePrueba;

    private const A = 'cliente-a.ccs.test';

    private const B = 'cliente-b.ccs.test';

    private const BASES = 'ccs_aislamiento_';

    protected function setUp(): void
    {
        parent::setUp();
        if (! self::$armado) {
            $this->iniciarEntorno(self::BASES, ['a', 'b']);
            $this->escribirEntorno(self::A, self::BASES.'a');
            $this->escribirEntorno(self::B, self::BASES.'b');
            // Cada uno con SU plan: si algo se cruzara, se vería.
            $this->artisanOk(self::A, ['cliente:aprovisionar', '--plan=pymes']);
            $this->artisanOk(self::B, ['cliente:aprovisionar', '--plan=emprendedor']);
        }
    }

    public static function tearDownAfterClass(): void
    {
        self::derribarEntorno(self::BASES, ['a', 'b']);
        parent::tearDownAfterClass();
    }

    public function test_cada_cliente_usa_su_base_su_carpeta_y_su_certificado(): void
    {
        $dato = 'return [config("database.connections.mysql.database"), str_replace("\\\\", "/", storage_path()), str_replace("\\\\", "/", config("arca.cert_path")), str_replace("\\\\", "/", config("arca.key_path"))];';
        $a = $this->dentroDe(self::A, $dato);
        $b = $this->dentroDe(self::B, $dato);
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

        $this->assertSame(1, $this->cuenta('ccs_aislamiento_a', 'proveedores'));
        $this->assertSame(0, $this->cuenta('ccs_aislamiento_b', 'proveedores'));

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
        $tomar = 'return (bool) Illuminate\Support\Facades\Cache::lock("venta-fiscal:1", 60)->get();';
        $this->assertTrue($this->dentroDe(self::A, $tomar));
        $this->assertFalse($this->dentroDe(self::A, $tomar), 'el candado de A sigue tomado');
        $this->assertTrue($this->dentroDe(self::B, $tomar), 'el de B es otro');

        $this->dentroDe(self::A, 'Illuminate\Support\Facades\Cache::put("clave-comun", "valor de A", 300); return 1;');
        $this->assertNull($this->dentroDe(self::B, 'return Illuminate\Support\Facades\Cache::get("clave-comun");'));
        $this->assertSame('valor de A', $this->dentroDe(self::A, 'return Illuminate\Support\Facades\Cache::get("clave-comun");'));
    }

    public function test_la_configuracion_cacheada_de_un_cliente_no_se_le_sirve_a_otro(): void
    {
        $this->artisanOk(self::A, ['config:cache']);

        $this->assertFileExists(self::$raiz.'/clientes/'.self::A.'/cache/config.php', 'la caché de A queda en la carpeta de A');
        $this->assertFileDoesNotExist(base_path('bootstrap/cache/config.php'), 'y no en la del código, que sería de todos');
        $this->assertSame('ccs_aislamiento_a', $this->dentroDe(self::A, 'return config("database.connections.mysql.database");'));
        $this->assertSame('ccs_aislamiento_b', $this->dentroDe(self::B, 'return config("database.connections.mysql.database");'), 'B no recibe la configuración de A');

        $this->artisanOk(self::A, ['config:clear']);
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
        $p = $this->artisanDe(null, ['migrate:status']);

        $this->assertNotSame(0, $p->getExitCode());
        $this->assertStringContainsString('CCS_CLIENTE', $p->getErrorOutput());
        $this->assertSame(0, $this->artisanDe(null, ['list'])->getExitCode(), 'la ayuda sí corre sin cliente');
    }
}
