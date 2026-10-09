<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\Concerns\UsaClientesDePrueba;
use Tests\TestCase;

/**
 * EL EJECUTOR DE CLIENTES: alta, lista, actualización de todos, copia diaria, suspensión y baja. Con los comandos de verdad
 * (`ccs:*`), contra bases MySQL reales y cada uno en su proceso. Dos clientes viven toda la clase (A Pymes, B Emprendedor);
 * el que se suspende y se elimina es un tercero, creado en su propio test.
 *
 * Las pruebas se ejecutan EN ORDEN y algunas dependen del estado que dejó la anterior (así se usa el ejecutor de verdad).
 */
class EjecutorDeClientesTest extends TestCase
{
    use UsaClientesDePrueba;

    private const A = 'kiosco-a.ccs.test';

    private const B = 'verduleria-b.ccs.test';

    private const C = 'libreria-c.ccs.test';

    private const BASES = 'ccs_ejecutor_';

    /** @var array<string,string> clave inicial que mostró cada alta */
    private static array $claves = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (! self::$armado) {
            $this->iniciarEntorno(self::BASES, ['a', 'b', 'c']);
            self::$claves[self::A] = $this->alta(self::A, 'a', 'pymes');
            self::$claves[self::B] = $this->alta(self::B, 'b', 'emprendedor');
        }
    }

    public static function tearDownAfterClass(): void
    {
        self::derribarEntorno(self::BASES, ['a', 'b', 'c']);
        self::$claves = [];
        parent::tearDownAfterClass();
    }

    // ------------------------------------------------------------------ ayudas

    private function argsAlta(string $dominio, string $base, string $plan, array $extra = []): array
    {
        return [base_path('artisan'), 'ccs:alta', $dominio, '--plan='.$plan, '--nombre=Negocio '.$dominio, '--db='.$base, '--usuario-db='.self::$conexion['username'],
            '--clave-db='.self::$conexion['password'], '--host-db='.self::$conexion['host'], '--puerto-db='.self::$conexion['port'], '--no-interaction', ...$extra];
    }

    /** Da de alta con el comando real y devuelve la clave inicial que mostró. */
    private function alta(string $dominio, string $sufijo, string $plan): string
    {
        $p = $this->proceso($this->argsAlta($dominio, self::BASES.$sufijo, $plan));
        $this->assertSame(0, $p->getExitCode(), "ccs:alta {$dominio}:\n".$p->getOutput().$p->getErrorOutput());
        $this->assertSame(1, preg_match('/Clave inicial\s*\|\s*(\S+)/', $p->getOutput(), $m), $p->getOutput());

        return $m[1];
    }

    private function carpeta(string $dominio): string
    {
        return self::$raiz.'/clientes/'.$dominio;
    }

    private function salida(Process $p): string
    {
        return $p->getOutput().$p->getErrorOutput();
    }

    private function estado(string $dominio): array
    {
        $p = $this->artisanOk($dominio, ['ccs:estado', '--json']);

        return json_decode($p->getOutput(), true);
    }

    // ------------------------------------------------------------------ alta

    public function test_el_alta_deja_al_cliente_andando_con_su_plan_y_una_clave_temporal(): void
    {
        $env = (string) file_get_contents($this->carpeta(self::A).'/.env');
        $this->assertStringContainsString('APP_ENV=production', $env);
        $this->assertStringContainsString('APP_DEBUG=false', $env);
        $this->assertMatchesRegularExpression('/^APP_KEY=base64:.{40,}$/m', $env);
        $this->assertStringContainsString('APP_URL=https://'.self::A, $env);
        $this->assertStringNotContainsString('SUPERADMIN_PASSWORD', $env, 'la clave inicial no queda escrita en el .env');
        $this->assertDirectoryExists($this->carpeta(self::A).'/arca');

        $ficha = json_decode((string) file_get_contents($this->carpeta(self::A).'/cliente.json'), true);
        $this->assertEquals(['plan' => 'pymes', 'base' => 'ccs_ejecutor_a', 'dominio' => self::A], array_intersect_key($ficha, array_flip(['plan', 'base', 'dominio'])));

        $this->assertSame('pymes', $this->estado(self::A)['plan']);
        $this->assertSame('emprendedor', $this->estado(self::B)['plan']);

        // Entra con la clave que mostró el alta, y el sistema lo obliga a cambiarla.
        $r = $this->pedir(self::A, 'POST', '/api/auth/login', ['usuario' => 'Administrador', 'password' => self::$claves[self::A]]);
        $this->assertSame(200, $r['status'], json_encode($r));
        $this->assertSame(1, (int) self::pdo('ccs_ejecutor_a')->query('SELECT debe_cambiar_password FROM usuarios LIMIT 1')->fetchColumn());
        $this->assertNotSame(self::$claves[self::A], self::$claves[self::B], 'cada cliente, su propia clave');
    }

    public function test_el_alta_rechaza_lo_que_no_corresponde_y_no_deja_basura(): void
    {
        $casos = [
            'un plan que no existe' => [$this->argsAlta('otro.ccs.test', 'x', 'platino'), 'plan', 'otro.ccs.test'],
            'un dominio sin punto' => [$this->argsAlta('otro', 'x', 'pymes'), 'no es válido', 'otro'],
            'una base que ya tiene datos de otro cliente' => [$this->argsAlta('otro.ccs.test', self::BASES.'a', 'pymes'), 'ya tiene', 'otro.ccs.test'],
            'una base que no existe' => [$this->argsAlta('otro.ccs.test', 'no_existe_nunca', 'pymes'), 'No me pude conectar', 'otro.ccs.test'],
            'un cliente que ya existe' => [$this->argsAlta(self::A, self::BASES.'c', 'pymes'), 'Ya existe la carpeta', self::A],
        ];
        foreach ($casos as $que => [$args, $mensaje, $dominio]) {
            $p = $this->proceso($args);
            $this->assertNotSame(0, $p->getExitCode(), $que);
            $this->assertStringContainsString($mensaje, $this->salida($p), $que);
            if ($dominio !== self::A) {
                $this->assertDirectoryDoesNotExist($this->carpeta($dominio), $que.': no queda carpeta');
            }
        }
        $this->assertFileExists($this->carpeta(self::A).'/.env', 'y el cliente que ya existía sigue intacto');
    }

    public function test_sin_carpeta_de_clientes_el_alta_pide_confirmacion_antes_de_activar_el_modo(): void
    {
        $p = $this->proceso($this->argsAlta('nuevo.ccs.test', self::BASES.'c', 'pymes'), null, ['CCS_CLIENTES' => self::$raiz.'/todavia-no-existe']);

        $this->assertNotSame(0, $p->getExitCode());
        $this->assertStringContainsString('--iniciar', $this->salida($p));
        $this->assertDirectoryDoesNotExist(self::$raiz.'/todavia-no-existe');
    }

    // ------------------------------------------------------------------ lista

    public function test_la_lista_muestra_a_los_clientes_con_su_plan_y_su_estado(): void
    {
        $filas = json_decode($this->artisanOk(null, ['ccs:lista', '--json'])->getOutput(), true);
        $por = array_column($filas, null, 'dominio');

        $this->assertSame([self::A, self::B], array_keys($por));
        $this->assertSame('pymes', $por[self::A]['plan']);
        $this->assertSame('emprendedor', $por[self::B]['plan']);
        $this->assertSame('activo', $por[self::A]['estado']);
        $this->assertSame('ccs_ejecutor_b', $por[self::B]['base']);

        $det = json_decode($this->artisanOk(null, ['ccs:lista', '--json', '--detalle'])->getOutput(), true);
        $this->assertSame(0, $det[0]['detalle']['migracionesPendientes']);
        $this->assertSame('pymes', $det[0]['detalle']['plan']);
    }

    // ------------------------------------------------------------------ actualizar

    public function test_actualizar_migra_a_todos_con_copia_previa_y_los_deja_en_linea(): void
    {
        // B "quedó atrasado": le falta la última migración (se simula quitándola).
        $pdo = self::pdo('ccs_ejecutor_b');
        $pdo->exec('ALTER TABLE gastos DROP COLUMN periodo_recurrente');
        $pdo->exec("DELETE FROM migrations WHERE migration = '2026_10_09_140000_add_periodo_a_gastos_recurrentes'");
        $this->assertSame(1, $this->estado(self::B)['migracionesPendientes']);

        $p = $this->artisanOk(null, ['ccs:actualizar', '--canario='.self::B]);

        $this->assertSame(0, $this->estado(self::B)['migracionesPendientes']);
        $this->assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'ccs_ejecutor_b' AND table_name = 'gastos' AND column_name = 'periodo_recurrente'")->fetchColumn());
        foreach ([self::A, self::B] as $c) {
            $this->assertFileDoesNotExist($this->carpeta($c).'/storage/framework/down', $c.' vuelve a estar en línea');
            $this->assertFileExists($this->carpeta($c).'/cache/config.php', $c.' queda con su configuración cacheada');
            $this->assertNotEmpty(glob($this->carpeta($c).'/storage/app/respaldos/respaldo-auto-*.sql.gz'), $c.': copia previa, aunque su plan no tenga copia diaria');
        }
        $this->assertSame(2, substr_count($p->getOutput(), '| ok '), $p->getOutput());
        $this->assertSame(200, $this->pedir(self::B, 'POST', '/api/auth/login', ['usuario' => 'Administrador', 'password' => self::$claves[self::B]])['status']);
    }

    public function test_si_un_cliente_falla_los_demas_se_actualizan_y_el_que_falla_vuelve_a_linea(): void
    {
        $envB = $this->carpeta(self::B).'/.env';
        $original = (string) file_get_contents($envB);
        // B pierde el acceso a su base. Se borra su configuración cacheada para que el cambio se note.
        @unlink($this->carpeta(self::B).'/cache/config.php');
        file_put_contents($envB, preg_replace('/^DB_PASSWORD=.*$/m', 'DB_PASSWORD="clave-equivocada"', $original));
        try {
            $p = $this->artisanDe(null, ['ccs:actualizar']);

            $this->assertNotSame(0, $p->getExitCode(), 'el resumen termina en error');
            $this->assertMatchesRegularExpression('/\|\s*'.preg_quote(self::A, '/').'\s*\|\s*ok\s*\|/', $p->getOutput(), 'A se actualizó igual');
            $this->assertMatchesRegularExpression('/\|\s*'.preg_quote(self::B, '/').'\s*\|\s*FALLÓ\s*\|/u', $p->getOutput());
            $this->assertFileDoesNotExist($this->carpeta(self::B).'/storage/framework/down', 'el que falló antes de migrar no se queda en mantenimiento');

            // Con B de canario, B falla y NO se toca a A.
            $p = $this->artisanDe(null, ['ccs:actualizar', '--canario='.self::B]);
            $this->assertNotSame(0, $p->getExitCode());
            $this->assertStringContainsString('Falló el canario', $this->salida($p));
            $this->assertMatchesRegularExpression('/\|\s*'.preg_quote(self::A, '/').'\s*\|\s*sin procesar\s*\|/', $p->getOutput());
        } finally {
            file_put_contents($envB, $original);
        }
        $this->assertSame(0, $this->estado(self::B)['migracionesPendientes'], 'con la clave bien, B vuelve a responder');
    }

    // ------------------------------------------------------------------ tarea programada

    public function test_el_cron_hace_la_copia_de_cada_cliente_segun_su_plan(): void
    {
        $p = $this->artisanOk(null, ['ccs:cron']);

        $this->assertMatchesRegularExpression('/'.preg_quote(self::A, '/').': Copia generada/', $p->getOutput());
        $this->assertMatchesRegularExpression('/'.preg_quote(self::B, '/').': .*no incluye la copia automática/', $p->getOutput());
    }

    // ------------------------------------------------------------------ suspender y eliminar

    public function test_suspender_corta_el_servicio_sin_borrar_nada_y_reactivar_lo_devuelve(): void
    {
        self::$claves[self::C] = $this->alta(self::C, 'c', 'pymes');
        $p = $this->artisanOk(null, ['ccs:suspender', self::C, '--motivo=Falta de pago']);

        $this->assertStringContainsString('Copia generada', $p->getOutput(), 'antes de cortar, una copia final');
        $r = $this->pedir(self::C, 'POST', '/api/auth/login', ['usuario' => 'Administrador', 'password' => self::$claves[self::C]]);
        $this->assertSame(503, $r['status']);
        $this->assertStringContainsString('suspendido', $r['cuerpo']['message']);
        $this->assertGreaterThan(0, $this->cuenta('ccs_ejecutor_c', 'usuarios'), 'los datos siguen ahí');
        $this->assertSame('pymes', $this->estado(self::C)['plan'], 'y por consola se lo puede seguir operando');

        $lista = array_column(json_decode($this->artisanOk(null, ['ccs:lista', '--json'])->getOutput(), true), 'estado', 'dominio');
        $this->assertSame('suspendido', $lista[self::C]);
        $this->assertStringContainsString(self::C.': suspendido, se omite', $this->artisanOk(null, ['ccs:cron'])->getOutput());
        $this->assertMatchesRegularExpression('/\|\s*'.preg_quote(self::C, '/').'\s*\|\s*omitido\s*\|/', $this->artisanOk(null, ['ccs:actualizar', '--solo='.self::C])->getOutput());

        $this->artisanOk(null, ['ccs:reactivar', self::C]);
        $this->assertSame(200, $this->pedir(self::C, 'POST', '/api/auth/login', ['usuario' => 'Administrador', 'password' => self::$claves[self::C]])['status']);
    }

    public function test_eliminar_tiene_todas_las_trabas_y_no_toca_la_base(): void
    {
        $guardados = self::$raiz.'/guardados';
        $this->artisanOk(null, ['ccs:suspender', self::C, '--sin-copia']);

        $casos = [
            'no está suspendido hace 90 días' => [['--confirmar='.self::C, '--guardar-en='.$guardados], 'días suspendido'],
            'sin confirmar el dominio' => [['--dias=0', '--guardar-en='.$guardados], '--confirmar='],
            'confirmando otro dominio' => [['--dias=0', '--confirmar='.self::A, '--guardar-en='.$guardados], '--confirmar='],
            'sin decir dónde va la última copia' => [['--dias=0', '--confirmar='.self::C], '--guardar-en'],
        ];
        foreach ($casos as $que => [$opciones, $mensaje]) {
            $p = $this->artisanDe(null, ['ccs:eliminar', self::C, ...$opciones]);
            $this->assertNotSame(0, $p->getExitCode(), $que);
            $this->assertStringContainsString($mensaje, $this->salida($p), $que);
            $this->assertFileExists($this->carpeta(self::C).'/.env', $que.': no se borró');
        }

        $this->assertNotSame(0, $this->artisanDe(null, ['ccs:eliminar', self::A, '--dias=0', '--confirmar='.self::A, '--sin-copia'])->getExitCode(), 'un cliente activo no se elimina');
        $this->assertFileExists($this->carpeta(self::A).'/.env');

        $p = $this->artisanOk(null, ['ccs:eliminar', self::C, '--dias=0', '--confirmar='.self::C, '--guardar-en='.$guardados]);

        $this->assertDirectoryDoesNotExist($this->carpeta(self::C));
        $this->assertCount(1, glob($guardados.'/'.self::C.'-respaldo-auto-*.sql.gz'), 'la última copia quedó afuera');
        $this->assertStringContainsString('ccs_ejecutor_c', $p->getOutput(), 'avisa qué base borrar a mano');
        $this->assertGreaterThan(0, $this->cuenta('ccs_ejecutor_c', 'usuarios'), 'la base no se tocó');
        $this->assertSame([self::A, self::B], array_column(json_decode($this->artisanOk(null, ['ccs:lista', '--json'])->getOutput(), true), 'dominio'));
    }
}
