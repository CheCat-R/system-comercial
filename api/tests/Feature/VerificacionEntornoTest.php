<?php

namespace Tests\Feature;

use App\Services\LicenciaService;
use App\Services\RespaldosService;
use App\Services\VerificacionEntorno;
use Tests\TestCase;

/**
 * `produccion:verificar`: cada control que, si se olvida, no avisa. Los tests
 * arman un entorno "de producción" válido y rompen UNA cosa por vez.
 */
class VerificacionEntornoTest extends TestCase
{
    /** Un entorno de producción en regla (todo lo que el control mira, bien). */
    private function entornoDeProduccion(): void
    {
        $this->app['env'] = 'production';
        config([
            'app.debug' => false,
            'app.url' => 'https://cliente.example.com',
            'cors.allowed_origins' => [],
            'logging.channels.single.level' => 'warning',
        ]);
        app(LicenciaService::class)->fijar('emprendedor');
        $this->superadmin()->update(['password' => 'una-clave-propia-1']);
    }

    private function control(string $fragmentoDelTitulo): array
    {
        foreach (app(VerificacionEntorno::class)->verificar() as $c) {
            if (str_contains($c['titulo'], $fragmentoDelTitulo)) {
                return $c;
            }
        }
        $this->fail('No hay un control con "'.$fragmentoDelTitulo.'"');
    }

    private function fallos(): array
    {
        return array_values(array_filter(app(VerificacionEntorno::class)->verificar(), fn ($c) => $c['nivel'] === 'fallo'));
    }

    public function test_un_entorno_de_produccion_en_regla_no_tiene_fallos(): void
    {
        $this->entornoDeProduccion();
        $this->assertSame([], $this->fallos());
        $this->artisan('produccion:verificar')->assertSuccessful();
    }

    public function test_el_entorno_de_desarrollo_falla_y_el_comando_sale_con_error(): void
    {
        $this->assertNotEmpty($this->fallos());
        $this->artisan('produccion:verificar')->expectsOutputToContain('No entregues esta instalación así')->assertFailed();
    }

    public function test_depuracion_prendida_es_un_fallo(): void
    {
        $this->entornoDeProduccion();
        config(['app.debug' => true]);
        $this->assertSame('fallo', $this->control('APP_DEBUG')['nivel']);
    }

    public function test_url_sin_https_o_con_localhost_es_un_fallo(): void
    {
        $this->entornoDeProduccion();
        config(['app.url' => 'http://cliente.example.com']);
        $this->assertSame('fallo', $this->control('APP_URL')['nivel']);
        config(['app.url' => 'https://localhost']);
        $this->assertSame('fallo', $this->control('APP_URL')['nivel']);
    }

    public function test_cors_con_localhost_o_comodin_es_un_fallo(): void
    {
        $this->entornoDeProduccion();
        config(['cors.allowed_origins' => ['https://cliente.example.com', 'http://localhost:3000']]);
        $this->assertSame('fallo', $this->control('CORS')['nivel']);
        config(['cors.allowed_origins' => ['*']]);
        $this->assertSame('fallo', $this->control('CORS')['nivel']);
        config(['cors.allowed_origins' => ['https://cliente.example.com']]);
        $this->assertSame('ok', $this->control('CORS')['nivel']);
    }

    public function test_la_contrasena_de_fabrica_es_fallo_salvo_que_ya_este_obligada_a_cambiarse(): void
    {
        $this->entornoDeProduccion();
        $this->superadmin()->update(['password' => 'admin1234', 'debe_cambiar_password' => false]);
        $this->assertSame('fallo', $this->control('contraseña de fábrica')['nivel']);

        // Obligada a cambiarla en el primer ingreso: es un aviso (hay que entrar antes de entregar), no un fallo.
        $this->superadmin()->update(['debe_cambiar_password' => true]);
        $this->assertSame('aviso', $this->control('contraseña de fábrica')['nivel']);
    }

    public function test_sin_plan_fijado_es_un_fallo_porque_se_comporta_como_corporativo(): void
    {
        $this->entornoDeProduccion();
        \App\Models\Configuracion::query()->where('clave', 'licencia')->delete();
        $c = $this->control('plan fijado');
        $this->assertSame('fallo', $c['nivel']);
        $this->assertStringContainsString('licencia:plan', $c['detalle']);
    }

    public function test_arca_en_produccion_exige_certificado_legible_y_punto_de_venta(): void
    {
        $this->entornoDeProduccion();
        config(['arca.cuit' => '20123456786', 'arca.produccion' => false]);
        $this->assertSame('aviso', $this->control('ARCA')['nivel'], 'homologación: aviso');

        config(['arca.produccion' => true, 'arca.cert_path' => '/no/existe.crt', 'arca.key_path' => '/no/existe.key', 'arca.pto_vta' => 5]);
        $this->assertSame('fallo', $this->control('ARCA')['nivel'], 'producción sin certificado legible: fallo');

        $cert = tempnam(sys_get_temp_dir(), 'crt');
        $key = tempnam(sys_get_temp_dir(), 'key');
        try {
            config(['arca.cert_path' => $cert, 'arca.key_path' => $key, 'arca.pto_vta' => 0]);
            $this->assertSame('fallo', $this->control('ARCA')['nivel'], 'sin punto de venta: fallo');
            config(['arca.pto_vta' => 5]);
            $this->assertSame('ok', $this->control('ARCA')['nivel']);
        } finally {
            @unlink($cert);
            @unlink($key);
        }
    }

    public function test_un_control_que_revienta_se_informa_como_fallo_y_no_tumba_a_los_demas(): void
    {
        $this->entornoDeProduccion();
        // Se rompe SOLO el control de las copias automáticas...
        $this->app->bind(VerificacionEntorno::class, fn () => new VerificacionEntorno(
            \Mockery::mock(RespaldosService::class, fn ($m) => $m->shouldReceive('automaticoIncluido')->andThrow(new \RuntimeException('boom')))
        ));
        $todos = app(VerificacionEntorno::class)->verificar();

        // ...y se informa como fallo con su motivo, mientras el resto sigue corriendo.
        $roto = array_values(array_filter($todos, fn ($c) => str_contains($c['detalle'], 'boom')));
        $this->assertCount(1, $roto);
        $this->assertSame('fallo', $roto[0]['nivel']);
        $this->assertGreaterThan(10, count($todos));
    }
}
