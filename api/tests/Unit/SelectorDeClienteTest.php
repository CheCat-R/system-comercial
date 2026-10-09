<?php

namespace Tests\Unit;

use App\Clientes\SelectorDeCliente;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Qué cliente atiende cada pedido o comando. Es la puerta de entrada de todo el aislamiento entre clientes: un error acá
 * entrega los datos de uno al otro, así que se prueba el criterio entero, incluidos los nombres que intentan salirse de la carpeta.
 */
class SelectorDeClienteTest extends TestCase
{
    private string $raiz;

    private string $base;

    protected function setUp(): void
    {
        parent::setUp();
        $this->raiz = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ccs-selector-'.bin2hex(random_bytes(4));
        $this->base = $this->raiz.DIRECTORY_SEPARATOR.'api';
        mkdir($this->base, 0777, true);
        putenv('CCS_CLIENTES');   // que el entorno de quien corre los tests no cambie la carpeta
    }

    protected function tearDown(): void
    {
        putenv('CCS_CLIENTES');
        $this->borrar($this->raiz);
        parent::tearDown();
    }

    private function borrar(string $dir): void
    {
        foreach (glob($dir.'/{,.}[!.,!..]*', GLOB_BRACE) ?: [] as $f) {
            is_dir($f) ? $this->borrar($f) : unlink($f);
        }
        @rmdir($dir);
    }

    private function cliente(string $nombre, bool $conEnv = true): void
    {
        mkdir($this->raiz.'/clientes/'.$nombre, 0777, true);
        if ($conEnv) {
            file_put_contents($this->raiz.'/clientes/'.$nombre.'/.env', "APP_NAME=x\n");
        }
    }

    public function test_sin_carpeta_de_clientes_todo_sigue_como_siempre(): void
    {
        $this->assertSame(['modo' => 'unico'], SelectorDeCliente::decidir($this->base, null, 'kiosco.ccs.com', null, 'production'));
        $this->assertSame(['modo' => 'unico'], SelectorDeCliente::decidir($this->base, null, null, 'migrate', 'production'));
    }

    public function test_en_los_tests_nunca_se_activa(): void
    {
        $this->cliente('kiosco.ccs.com');
        $this->assertSame(['modo' => 'unico'], SelectorDeCliente::decidir($this->base, null, 'kiosco.ccs.com', null, 'testing'));
    }

    public function test_el_dominio_del_pedido_elige_la_carpeta_del_cliente(): void
    {
        $this->cliente('kiosco.ccs.com');
        $this->cliente('verduleria.ccs.com');

        $d = SelectorDeCliente::decidir($this->base, null, 'Kiosco.CCS.com:443', null, 'production');
        $this->assertSame('cliente', $d['modo']);
        $this->assertSame('kiosco.ccs.com', $d['nombre']);
        $this->assertSame(str_replace('\\', '/', realpath($this->raiz.'/clientes')).'/kiosco.ccs.com', $d['carpeta']);

        $this->assertSame('verduleria.ccs.com', SelectorDeCliente::decidir($this->base, null, 'verduleria.ccs.com', null, 'production')['nombre']);
    }

    public function test_un_dominio_desconocido_se_rechaza_sin_decir_cuales_existen(): void
    {
        $this->cliente('kiosco.ccs.com');

        $d = SelectorDeCliente::decidir($this->base, null, 'otro.ccs.com', null, 'production');
        $this->assertSame('rechazado', $d['modo']);
        $this->assertSame(404, $d['http']);
        $this->assertStringNotContainsString('kiosco', $d['mensaje']);
    }

    #[DataProvider('nombresPeligrosos')]
    public function test_un_nombre_que_se_sale_de_la_carpeta_se_rechaza(string $host): void
    {
        $this->cliente('kiosco.ccs.com');
        mkdir($this->raiz.'/secreto', 0777, true);
        file_put_contents($this->raiz.'/secreto/.env', "APP_NAME=ajeno\n");   // un .env FUERA de clientes/, al que se intenta llegar

        $this->assertSame('rechazado', SelectorDeCliente::decidir($this->base, null, $host, null, 'production')['modo']);
        $this->assertSame('rechazado', SelectorDeCliente::decidir($this->base, $host, null, 'migrate', 'production')['modo']);
    }

    public static function nombresPeligrosos(): array
    {
        return [
            'subir un nivel' => ['..'],
            'subir y bajar' => ['../secreto'],
            'barra' => ['kiosco.ccs.com/../../secreto'],
            'barra invertida' => ['..\\secreto'],
            'puntos seguidos' => ['kiosco..ccs.com'],
            'espacio' => ['kiosco ccs.com'],
            'vacío tras el puerto' => [':443'],
            'corchetes' => ['[::1]'],
        ];
    }

    public function test_una_carpeta_sin_env_no_es_un_cliente(): void
    {
        $this->cliente('a-medias.ccs.com', false);

        $this->assertSame('rechazado', SelectorDeCliente::decidir($this->base, null, 'a-medias.ccs.com', null, 'production')['modo']);
    }

    public function test_por_consola_el_cliente_se_elige_con_la_variable_y_manda_sobre_el_dominio(): void
    {
        $this->cliente('kiosco.ccs.com');
        $this->cliente('verduleria.ccs.com');

        $d = SelectorDeCliente::decidir($this->base, 'verduleria.ccs.com', 'kiosco.ccs.com', null, 'production');
        $this->assertSame('verduleria.ccs.com', $d['nombre']);
    }

    public function test_un_comando_que_toca_datos_sin_cliente_se_rechaza(): void
    {
        $this->cliente('kiosco.ccs.com');

        foreach (['migrate', 'db:seed', 'cliente:aprovisionar', 'respaldos:automatico', 'config:cache', 'tinker'] as $comando) {
            $d = SelectorDeCliente::decidir($this->base, null, null, $comando, 'production');
            $this->assertSame('rechazado', $d['modo'], $comando);
            $this->assertStringContainsString('CCS_CLIENTE', $d['mensaje']);
        }
    }

    public function test_los_comandos_de_administracion_y_la_ayuda_corren_sin_cliente(): void
    {
        $this->cliente('kiosco.ccs.com');

        foreach (['list', 'help', '--version', 'ccs:clientes', null] as $comando) {
            $this->assertSame(['modo' => 'sin-cliente'], SelectorDeCliente::decidir($this->base, null, null, $comando, 'production'), (string) $comando);
        }
    }

    public function test_la_carpeta_de_clientes_se_puede_poner_en_otro_lado(): void
    {
        mkdir($this->raiz.'/otro-lado/kiosco.ccs.com', 0777, true);
        file_put_contents($this->raiz.'/otro-lado/kiosco.ccs.com/.env', "APP_NAME=x\n");
        putenv('CCS_CLIENTES='.$this->raiz.'/otro-lado');

        $this->assertSame('kiosco.ccs.com', SelectorDeCliente::decidir($this->base, null, 'kiosco.ccs.com', null, 'production')['nombre']);
    }
}
