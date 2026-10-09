<?php

namespace Tests\Feature;

use App\Services\LicenciaService;
use App\Services\VerificacionEntorno;
use App\Support\ProxiesConfiables;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Lo que hace falta para entregar una instalación sin sorpresas: la IP real detrás
 * de un proxy, un respaldo que no lleva credenciales vivas, la clave de ARCA fuera
 * de la carpeta pública y los slides del sitio que se guardan.
 */
class DespliegueSeguroTest extends TestCase
{
    protected function tearDown(): void
    {
        TrustProxies::flushState();   // `at()` es estático: no puede filtrarse a otros tests
        parent::tearDown();
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

    /** La IP que Laravel ve cuando el pedido llega desde `$proxy` diciendo que viene de `$cliente`. */
    private function ipVista(string $proxy, string $cliente): string
    {
        $request = Request::create('/api/health', 'GET', [], [], [], ['REMOTE_ADDR' => $proxy, 'HTTP_X_FORWARDED_FOR' => $cliente]);

        return (new TrustProxies)->handle($request, fn ($r) => response($r->ip()))->getContent();
    }

    /* ------------------------------ Detrás de un proxy ------------------------------ */

    public function test_sin_proxies_declarados_todos_los_pedidos_parecen_venir_del_proxy(): void
    {
        $this->assertSame('10.0.0.2', $this->ipVista('10.0.0.2', '200.1.2.3'));
    }

    public function test_con_el_proxy_declarado_se_lee_la_ip_real_del_cliente(): void
    {
        ProxiesConfiables::aplicar('10.0.0.2');
        $this->assertSame('200.1.2.3', $this->ipVista('10.0.0.2', '200.1.2.3'));
        // Un X-Forwarded-For que llega de una máquina que NO es el proxy declarado no se cree.
        $this->assertSame('66.6.6.6', $this->ipVista('66.6.6.6', '1.2.3.4'));
    }

    public function test_trusted_proxies_se_interpreta(): void
    {
        $this->assertNull(ProxiesConfiables::interpretar(null));
        $this->assertNull(ProxiesConfiables::interpretar('  '));
        $this->assertSame('*', ProxiesConfiables::interpretar('*'));
        $this->assertSame(['10.0.0.2', '172.16.0.0/12'], ProxiesConfiables::interpretar(' 10.0.0.2 , 172.16.0.0/12,, '));
    }

    public function test_el_verificador_avisa_de_los_proxies(): void
    {
        config(['checat.proxies_confiables' => '']);
        $this->assertSame('aviso', $this->control('TRUSTED_PROXIES vacío')['nivel']);
        config(['checat.proxies_confiables' => '*']);
        $this->assertSame('aviso', $this->control('confía en cualquiera')['nivel']);
        config(['checat.proxies_confiables' => '10.0.0.2']);
        $this->assertSame('ok', $this->control('Proxies confiables')['nivel']);
    }

    /* ------------------------------ ARCA fuera de la carpeta pública ------------------------------ */

    public function test_la_clave_de_arca_dentro_de_la_carpeta_publica_es_un_fallo(): void
    {
        app(LicenciaService::class)->fijar('emprendedor');
        $adentro = public_path('clave-de-prueba.key');
        $afuera = tempnam(sys_get_temp_dir(), 'key');
        file_put_contents($adentro, 'x');
        try {
            config(['arca.cuit' => '20123456786', 'arca.produccion' => true, 'arca.pto_vta' => 5, 'arca.cert_path' => $afuera, 'arca.key_path' => $adentro]);
            $c = $this->control('ARCA');
            $this->assertSame('fallo', $c['nivel']);
            $this->assertStringContainsString('carpeta pública', $c['titulo']);

            config(['arca.key_path' => $afuera]);
            $this->assertSame('ok', $this->control('ARCA')['nivel']);
        } finally {
            @unlink($adentro);
            @unlink($afuera);
        }
    }

    /* ------------------------------ El respaldo no lleva credenciales vivas ------------------------------ */

    public function test_el_respaldo_no_lleva_tickets_de_arca_ni_sesiones_abiertas(): void
    {
        DB::table('arca_tokens')->insert(['service' => 'wsfe', 'token' => 'TOKEN-SECRETO-DE-ARCA', 'sign' => 'FIRMA-SECRETA', 'expires_at' => now()->addHours(10), 'created_at' => now(), 'updated_at' => now()]);
        $token = $this->loguear($this->superadmin(), 'admin1234');
        $this->assertGreaterThan(0, DB::table('personal_access_tokens')->count());

        $sql = $this->conToken($token)->get('/api/sistema/respaldos/descargar')->assertOk()->streamedContent();

        $this->assertStringNotContainsString('TOKEN-SECRETO-DE-ARCA', $sql);
        $this->assertStringNotContainsString('FIRMA-SECRETA', $sql);
        $this->assertStringNotContainsString('arca_tokens', $sql);
        $this->assertStringNotContainsString('personal_access_tokens', $sql);
        // Lo del negocio sí va.
        $this->assertStringContainsString('INSERT INTO `usuarios`', $sql);
    }

    /* ------------------------------ Slides del sitio ------------------------------ */

    public function test_los_slides_de_la_portada_se_guardan_y_se_limpian(): void
    {
        $token = $this->conToken($this->loguear($this->superadmin(), 'admin1234'));

        $r = $token->putJson('/api/configuracion/web', ['slides' => [
            ['id' => 1, 'badge' => 'Ofertas', 'titulo' => 'Verano', 'texto' => 'Todo al 20%', 'cta' => 'Ver', 'ctaUrl' => '/tienda', 'posicion' => 'center'],
            ['id' => 2, 'titulo' => 'Sorteo', 'ctaUrl' => 'javascript:alert(1)', 'posicion' => 'abajo'],
            ['id' => 3, 'titulo' => 'Afuera', 'ctaUrl' => '//sitio-malo.com'],
            ['id' => 4, 'titulo' => 'Seguro', 'ctaUrl' => 'https://ejemplo.com/promo'],
            'esto no es un slide',
        ]])->assertOk()->json('slides');

        $this->assertCount(4, $r);
        $this->assertSame(['id' => 1, 'badge' => 'Ofertas', 'titulo' => 'Verano', 'texto' => 'Todo al 20%', 'cta' => 'Ver', 'ctaUrl' => '/tienda', 'posicion' => 'center'], $r[0]);
        $this->assertSame('', $r[1]['ctaUrl'], 'javascript: no pasa');
        $this->assertSame('left', $r[1]['posicion'], 'una posición inválida vuelve a la izquierda');
        $this->assertSame('', $r[2]['ctaUrl'], '//otro-sitio no pasa');
        $this->assertSame('https://ejemplo.com/promo', $r[3]['ctaUrl']);
        // Y se leen igual que se guardaron.
        $this->assertCount(4, $token->getJson('/api/configuracion/web')->assertOk()->json('slides'));

        // Vaciar la lista funciona (no vuelve una fila de ejemplo).
        $this->assertSame([], $token->putJson('/api/configuracion/web', ['slides' => []])->assertOk()->json('slides'));
    }

    public function test_no_hay_mas_de_veinte_slides(): void
    {
        $token = $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
        $muchos = array_map(fn ($i) => ['id' => $i, 'titulo' => 'S'.$i], range(1, 30));

        $this->assertCount(20, $token->putJson('/api/configuracion/web', ['slides' => $muchos])->assertOk()->json('slides'));
    }
}
