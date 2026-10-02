<?php

namespace Tests\Feature;

use App\Licencias\Firma;
use App\Licencias\Licencia;
use App\Licencias\LicenciaInvalida;
use App\Services\LicenciaService;
use App\Services\VerificacionEntorno;
use Carbon\Carbon;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * LA LICENCIA FIRMADA: la clave de activación que emite CCS, cómo se verifica,
 * qué estados tiene según los días, y qué bloquea el sistema cuando no hay una
 * vigente (solo lectura — los datos y los respaldos nunca se esconden).
 */
class LicenciaFirmadaTest extends TestCase
{
    /** @var array{privada:string, publica:string}|null */
    private static ?array $par = null;

    private function par(): array
    {
        return self::$par ??= Firma::generarPar();
    }

    /** Prende la exigencia de licencia, con la clave pública del par de pruebas. */
    private function exigir(): LicenciaService
    {
        config(['licencia.exigida' => true, 'licencia.clave_publica' => $this->par()['publica']]);

        return app(LicenciaService::class);
    }

    /** Emite una clave para ESTA instalación que vence dentro de `$dias` días (negativo = ya venció). */
    private function clave(int $dias, string $plan = 'pymes', ?string $instalacion = null): string
    {
        $hoy = Carbon::now(config('licencia.zona'))->startOfDay();

        return Licencia::emitir([
            'instalacion' => $instalacion ?? app(LicenciaService::class)->instalacionId(),
            'cliente' => 'Almacén Don Pepe', 'plan' => $plan, 'modalidad' => 'mensual',
            'emitida' => $hoy->copy()->subDays(40)->toDateString(),
            'vence' => $hoy->copy()->addDays($dias)->toDateString(),
        ], $this->par()['privada']);
    }

    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    // ------------------------------------------------------------------
    // El formato firmado
    // ------------------------------------------------------------------

    public function test_una_clave_emitida_se_lee_con_la_publica_y_conserva_sus_datos(): void
    {
        $clave = Licencia::emitir(['instalacion' => 'abc', 'cliente' => 'Don Pepe ñandú', 'plan' => 'emprendedor', 'vence' => '2027-01-31', 'modalidad' => 'anual', 'emitida' => '2026-01-31'], $this->par()['privada']);
        $this->assertStringStartsWith('CCS1.', $clave);

        $lic = Licencia::leer($clave, $this->par()['publica']);
        $this->assertSame(['abc', 'Don Pepe ñandú', 'emprendedor', '2027-01-31', 'anual'], [$lic->instalacion, $lic->cliente, $lic->plan, $lic->vence, $lic->modalidad]);
    }

    public function test_pegar_la_clave_con_saltos_de_linea_y_espacios_funciona(): void
    {
        $clave = $this->clave(30);
        $partida = wordwrap($clave, 40, "\r\n  ", true);

        $this->assertSame('Almacén Don Pepe', Licencia::leer($partida, $this->par()['publica'])->cliente);
    }

    public function test_una_clave_alterada_o_de_otra_firma_no_sirve(): void
    {
        $clave = $this->clave(30);
        [$pref, $datos, $firma] = explode('.', $clave);

        // Cambiarle el plan o el vencimiento a mano rompe la firma.
        $falso = Firma::b64(json_encode(['instalacion' => 'x', 'cliente' => 'Y', 'plan' => 'corporativo', 'emitida' => '2026-01-01', 'vence' => '2099-01-01', 'modalidad' => 'anual']));
        foreach ([$pref.'.'.$falso.'.'.$firma, $clave.'A', 'CCS1.'.$datos, 'basura', ''] as $mala) {
            try {
                Licencia::leer($mala, $this->par()['publica']);
                $this->fail('Una clave alterada se aceptó: '.$mala);
            } catch (LicenciaInvalida) {
                $this->addToAssertionCount(1);
            }
        }

        // Una clave firmada con OTRA clave privada tampoco.
        $otra = Firma::generarPar();
        $ajena = Licencia::emitir(['instalacion' => 'a', 'cliente' => 'b', 'plan' => 'pymes', 'vence' => '2099-01-01'], $otra['privada']);
        $this->expectException(LicenciaInvalida::class);
        Licencia::leer($ajena, $this->par()['publica']);
    }

    public function test_no_se_puede_emitir_una_licencia_con_datos_invalidos(): void
    {
        foreach ([
            ['instalacion' => '', 'cliente' => 'A', 'plan' => 'pymes', 'vence' => '2027-01-01'],
            ['instalacion' => 'a', 'cliente' => '', 'plan' => 'pymes', 'vence' => '2027-01-01'],
            ['instalacion' => 'a', 'cliente' => 'A', 'plan' => 'premium', 'vence' => '2027-01-01'],
            ['instalacion' => 'a', 'cliente' => 'A', 'plan' => 'pymes', 'vence' => 'mañana'],
            ['instalacion' => 'a', 'cliente' => 'A', 'plan' => 'pymes', 'vence' => '2020-01-01', 'emitida' => '2026-01-01'],
        ] as $datos) {
            try {
                Licencia::emitir($datos, $this->par()['privada']);
                $this->fail('Se emitió una licencia inválida');
            } catch (LicenciaInvalida) {
                $this->addToAssertionCount(1);
            }
        }
    }

    // ------------------------------------------------------------------
    // Estados según los días
    // ------------------------------------------------------------------

    public function test_sin_exigir_licencia_no_hay_nada_que_vencer_y_el_plan_es_el_de_siempre(): void
    {
        $svc = app(LicenciaService::class);
        $this->assertFalse($svc->exigida(), 'en los tests (no producción) no se exige');
        $this->assertSame('no_exigida', $svc->estado()['estado']);
        $this->assertFalse($svc->restringido());
        $this->assertSame('corporativo', $svc->plan());
    }

    public function test_exigida_y_sin_clave_queda_en_solo_lectura_con_el_plan_minimo(): void
    {
        $svc = $this->exigir();
        $e = $svc->estado();
        $this->assertSame('sin_licencia', $e['estado']);
        $this->assertTrue($e['restringido']);
        $this->assertSame('emprendedor', $svc->plan());
    }

    public function test_los_estados_cambian_con_los_dias_y_el_plan_sale_de_la_licencia(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(40, 'pymes'));
        $this->assertSame('pymes', $svc->plan(), 'el plan sale de la licencia firmada');

        // [días que faltan, estado, ¿solo lectura?]
        foreach ([[40, 'activa', false], [16, 'activa', false], [15, 'por_vencer', false], [0, 'por_vencer', false], [-1, 'en_gracia', false], [-10, 'en_gracia', false], [-11, 'vencida', true]] as [$faltan, $estado, $restringido]) {
            $this->travelTo(Carbon::now(config('licencia.zona'))->startOfDay()->addDays(40 - $faltan)->addHours(12));
            $e = $this->exigir()->estado();
            $this->assertSame($estado, $e['estado'], "con $faltan días");
            $this->assertSame($faltan, $e['diasRestantes']);
            $this->assertSame($restringido, $e['restringido'], "solo lectura con $faltan días");
            $this->travelBack();
        }
    }

    public function test_no_se_activa_una_clave_de_otra_instalacion_ni_una_ya_vencida(): void
    {
        $svc = $this->exigir();

        try {
            $svc->activar($this->clave(30, 'pymes', 'otra-instalacion'));
            $this->fail('aceptó la clave de otra instalación');
        } catch (LicenciaInvalida $e) {
            $this->assertStringContainsString('otra instalación', $e->getMessage());
            $this->assertStringContainsString($svc->instalacionId(), $e->getMessage(), 'le dice cuál es SU ID');
        }
        try {
            $svc->activar($this->clave(-3));
            $this->fail('aceptó una clave ya vencida');
        } catch (LicenciaInvalida $e) {
            $this->assertStringContainsString('ya venció', $e->getMessage());
        }
        $this->assertSame('sin_licencia', $svc->estado()['estado'], 'ninguna de las dos quedó guardada');
    }

    public function test_atrasar_el_reloj_del_servidor_no_estira_la_licencia(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(5));

        // El sistema "ve" un día 20 días adelante (entra alguien: se anota la fecha más alta)...
        $this->travelTo(Carbon::now(config('licencia.zona'))->addDays(20));
        $svc->registrarReloj();
        $this->assertSame('vencida', $svc->estado()['estado']);

        // ...y volver el reloj para atrás no la revive.
        $this->travelBack();
        $this->assertSame('vencida', $this->exigir()->estado()['estado']);
    }

    public function test_el_id_de_instalacion_se_genera_una_vez_y_se_conserva(): void
    {
        $svc = app(LicenciaService::class);
        $id = $svc->instalacionId();
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $id);
        $this->assertSame($id, app(LicenciaService::class)->instalacionId());
    }

    // ------------------------------------------------------------------
    // Qué bloquea (solo lectura) y qué no
    // ------------------------------------------------------------------

    public function test_vencida_el_sistema_no_acepta_cambios_pero_se_puede_ver_bajar_respaldos_y_cargar_la_clave(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(40, 'corporativo'));
        $this->travelTo(Carbon::now(config('licencia.zona'))->addDays(60)); // 20 días vencida: pasó la gracia
        $api = $this->comoSuperadmin();

        // Cambios: bloqueados, con un mensaje que explica qué hacer.
        $api->postJson('/api/clientes', ['nombre' => 'Nuevo', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222'])
            ->assertStatus(403)->assertJsonPath('codigo', 'licencia_vencida')
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'solo lectura') && str_contains($m, 'Licencia'));

        // Mirar, bajar el respaldo, saber quién soy y cargar la clave nueva: sigue andando.
        $api->getJson('/api/clientes')->assertOk();
        $api->getJson('/api/auth/yo')->assertOk()->assertJsonPath('plan.licencia.estado', 'vencida');
        $api->get('/api/sistema/respaldos/descargar')->assertOk();
        $api->getJson('/api/licencia')->assertOk()->assertJsonPath('estado', 'vencida');

        // Y la clave nueva lo destraba.
        $api->postJson('/api/licencia/activar', ['clave' => $this->clave(30, 'corporativo')])->assertOk()->assertJsonPath('estado', 'activa');
        $api->postJson('/api/clientes', ['nombre' => 'Nuevo', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222'])->assertCreated();
    }

    public function test_en_gracia_todavia_funciona_todo(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(40, 'corporativo'));
        $this->travelTo(Carbon::now(config('licencia.zona'))->addDays(45)); // venció hace 5 días: gracia

        $this->comoSuperadmin()->postJson('/api/clientes', ['nombre' => 'Nuevo', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222'])->assertCreated();
    }

    public function test_sin_licencia_tampoco_se_acepta_ningun_cambio(): void
    {
        $this->exigir();
        $this->comoSuperadmin()->postJson('/api/clientes', ['nombre' => 'Nuevo', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222'])
            ->assertStatus(403)->assertJsonPath('codigo', 'sin_licencia');
    }

    public function test_el_panel_recibe_el_estado_al_entrar_y_nunca_el_id_de_instalacion(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(10, 'pymes'));

        $login = $this->postJson('/api/auth/login', ['usuario' => 'Administrador', 'password' => 'admin1234', 'sucursalId' => $this->central()->id])->assertOk();
        $this->assertSame('por_vencer', $login->json('plan.licencia.estado'));
        $this->assertSame(10, $login->json('plan.licencia.diasRestantes'));
        $this->assertSame('pymes', $login->json('plan.id'));
        $this->assertStringNotContainsString($svc->instalacionId(), $login->getContent());
    }

    public function test_los_avisos_traen_por_donde_pedir_la_clave_si_se_configuro(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(10));
        $entrar = fn () => $this->postJson('/api/auth/login', ['usuario' => 'Administrador', 'password' => 'admin1234', 'sucursalId' => $this->central()->id])->assertOk();

        $this->assertNull($entrar()->json('plan.licencia.contacto'), 'sin configurar, no se inventa un contacto');

        config(['licencia.contacto' => 'WhatsApp +54 9 11 1234-5678']);
        $this->assertSame('WhatsApp +54 9 11 1234-5678', $entrar()->json('plan.licencia.contacto'));
        $this->assertSame('WhatsApp +54 9 11 1234-5678', $this->comoSuperadmin()->getJson('/api/licencia')->json('contacto'));
    }

    public function test_solo_el_superadmin_ve_y_carga_la_licencia(): void
    {
        $admin = $this->crearUsuario('Gerente', 'admin');
        $this->assertNotContains('sistema.licencia', $this->rol('admin')->permisos, 'el rol Administrador no la trae');
        $this->assertSame(['*'], $this->rol('superadmin')->permisos);

        $svc = $this->exigir();
        $comoAdmin = $this->conToken($this->loguear($admin, 'clave1234'));
        $comoAdmin->getJson('/api/licencia')->assertForbidden();
        $comoAdmin->postJson('/api/licencia/activar', ['clave' => $this->clave(30)])->assertForbidden();

        $api = $this->comoSuperadmin();
        $api->getJson('/api/licencia')->assertOk()->assertJsonPath('instalacionId', $svc->instalacionId());
        $api->postJson('/api/licencia/activar', ['clave' => 'cualquier cosa'])->assertStatus(422)->assertJsonValidationErrors('clave');
    }

    public function test_el_plan_no_se_puede_cambiar_por_http_ni_con_una_clave_alterada(): void
    {
        $svc = $this->exigir();
        $svc->activar($this->clave(30, 'emprendedor'));
        $api = $this->comoSuperadmin();
        // Ninguna ruta acepta "ponete el plan X"...
        $api->putJson('/api/configuracion/licencia', ['plan' => 'corporativo'])->assertStatus(404);
        // ...y una clave a la que se le tocó algo no se acepta.
        $api->postJson('/api/licencia/activar', ['clave' => $this->clave(30, 'corporativo').'x'])->assertStatus(422);
        $this->assertSame('emprendedor', app(LicenciaService::class)->plan());
    }

    // ------------------------------------------------------------------
    // Los comandos
    // ------------------------------------------------------------------

    private function carpetaTemporal(): string
    {
        $d = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ccs-licencias-'.uniqid();
        mkdir($d);

        return $d;
    }

    public function test_generar_claves_escribe_las_dos_y_no_pisa_ni_deja_la_privada_dentro_del_proyecto(): void
    {
        $d = $this->carpetaTemporal();
        config(['licencia.clave_publica_archivo' => $d.'/licencia.pub']);
        try {
            $this->artisan('licencia:generar-claves', ['--privada' => $d.'/privada.pem'])->assertSuccessful();
            $this->assertStringContainsString('BEGIN PRIVATE KEY', (string) file_get_contents($d.'/privada.pem'));
            $this->assertStringContainsString('BEGIN PUBLIC KEY', (string) file_get_contents($d.'/licencia.pub'));
            // El par sirve: lo que se firma con la privada lo verifica la pública.
            $lic = Licencia::emitir(['instalacion' => 'a', 'cliente' => 'b', 'plan' => 'pymes', 'vence' => '2099-01-01'], (string) file_get_contents($d.'/privada.pem'));
            $this->assertSame('b', Licencia::leer($lic, (string) file_get_contents($d.'/licencia.pub'))->cliente);

            // Una segunda vez no pisa nada: cambiar la pública dejaría sin validar a todos los clientes.
            $this->artisan('licencia:generar-claves', ['--privada' => $d.'/otra.pem'])->assertFailed();
            $this->assertFileDoesNotExist($d.'/otra.pem');
        } finally {
            array_map('unlink', glob($d.'/*') ?: []);
            @rmdir($d);
        }

        // La privada dentro del proyecto terminaría en el repositorio: se rechaza.
        $this->artisan('licencia:generar-claves', ['--privada' => base_path('privada.pem'), '--forzar' => true])->assertFailed();
        $this->assertFileDoesNotExist(base_path('privada.pem'));
    }

    public function test_emitir_activar_y_estado_funcionan_de_punta_a_punta_por_consola(): void
    {
        $d = $this->carpetaTemporal();
        file_put_contents($d.'/privada.pem', $this->par()['privada']);
        $svc = $this->exigir();
        $id = $svc->instalacionId();

        // Faltan datos / no hay clave privada: error claro.
        $this->artisan('licencia:emitir', ['--cliente' => 'X'])->assertFailed();
        $this->artisan('licencia:emitir', ['--cliente' => 'X', '--plan' => 'pymes', '--instalacion' => $id, '--privada' => $d.'/no-existe.pem'])->assertFailed();

        // La clave que SALE de `emitir` es exactamente la que `activar` acepta.
        $this->assertSame(0, Artisan::call('licencia:emitir', ['--cliente' => 'Almacén Don Pepe', '--plan' => 'pymes', '--instalacion' => $id, '--anual' => true, '--privada' => $d.'/privada.pem']));
        preg_match('/CCS1\.\S+/', Artisan::output(), $m);
        $clave = $m[0];
        $this->artisan('licencia:activar', ['clave' => $clave])->expectsOutputToContain('Licencia activada')->assertSuccessful();
        $this->artisan('licencia:estado')->expectsOutputToContain($id)->assertSuccessful();
        $this->assertSame('activa', $svc->estado()['estado']);

        $this->artisan('licencia:activar', ['clave' => 'basura'])->assertFailed();
        array_map('unlink', glob($d.'/*') ?: []);
        @rmdir($d);
    }

    public function test_emitir_calcula_el_vencimiento_segun_meses_anual_o_fecha_exacta(): void
    {
        $d = $this->carpetaTemporal();
        file_put_contents($d.'/privada.pem', $this->par()['privada']);
        $capturar = function (array $opciones) use ($d) {
            Artisan::call('licencia:emitir', ['--cliente' => 'X', '--plan' => 'pymes', '--instalacion' => 'inst-1', '--privada' => $d.'/privada.pem', ...$opciones]);

            return Artisan::output();
        };
        $leer = function (string $salida) {
            preg_match('/CCS1\.\S+/', $salida, $m);

            return Licencia::leer($m[0], $this->par()['publica']);
        };
        $hoy = Carbon::now(config('licencia.zona'))->startOfDay();

        $this->assertSame($hoy->copy()->addMonthsNoOverflow(1)->toDateString(), $leer($capturar([]))->vence, 'por defecto, un mes');
        $this->assertSame($hoy->copy()->addMonthsNoOverflow(3)->toDateString(), $leer($capturar(['--meses' => 3]))->vence);
        $anual = $leer($capturar(['--anual' => true]));
        $this->assertSame([$hoy->copy()->addYear()->toDateString(), 'anual'], [$anual->vence, $anual->modalidad]);
        $this->assertSame('2030-05-17', $leer($capturar(['--vence' => '2030-05-17']))->vence);

        array_map('unlink', glob($d.'/*') ?: []);
        @rmdir($d);
    }

    // ------------------------------------------------------------------
    // La verificación de producción
    // ------------------------------------------------------------------

    private function control(string $fragmento): array
    {
        foreach (app(VerificacionEntorno::class)->verificar() as $c) {
            if (str_contains($c['titulo'], $fragmento)) {
                return $c;
            }
        }
        $this->fail('No hay un control con "'.$fragmento.'"');
    }

    public function test_produccion_verificar_falla_sin_licencia_y_avisa_cuando_esta_por_vencer(): void
    {
        $svc = $this->exigir();
        $this->assertSame('fallo', $this->control('Sin licencia vigente')['nivel']);
        $this->assertStringContainsString($svc->instalacionId(), $this->control('Sin licencia vigente')['detalle']);

        $svc->activar($this->clave(40));
        $this->assertSame('ok', $this->control('Licencia vigente')['nivel']);

        $this->travelTo(Carbon::now(config('licencia.zona'))->addDays(30));
        $this->assertSame('aviso', $this->control('La licencia vence')['nivel']);
        $this->travelTo(Carbon::now(config('licencia.zona'))->addDays(15));
        $this->assertSame('aviso', $this->control('VENCIÓ')['nivel']);
        $this->travelTo(Carbon::now(config('licencia.zona'))->addDays(30));
        $this->assertSame('fallo', $this->control('Sin licencia vigente')['nivel']);
    }

    public function test_produccion_verificar_exige_la_clave_publica_cuando_se_exige_licencia(): void
    {
        config(['licencia.exigida' => true, 'licencia.clave_publica' => '', 'licencia.clave_publica_archivo' => sys_get_temp_dir().'/no-existe.pub']);
        $this->assertSame('fallo', $this->control('clave pública de licencias')['nivel']);
    }
}
