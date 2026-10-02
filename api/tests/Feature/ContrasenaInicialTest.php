<?php

namespace Tests\Feature;

use App\Models\Usuario;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * La contraseña que puso OTRO (instalador, administrador, consola) no sirve
 * para trabajar: la persona tiene que elegir la suya antes de usar nada. Y la
 * salida de emergencia —restablecerla desde la consola— para el dueño que la
 * olvidó.
 */
class ContrasenaInicialTest extends TestCase
{
    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    private function entrar(string $usuario, string $password)
    {
        return $this->postJson('/api/auth/login', ['usuario' => $usuario, 'password' => $password, 'sucursalId' => $this->central()->id]);
    }

    public function test_un_usuario_dado_de_alta_por_otro_debe_elegir_su_contrasena_antes_de_usar_el_sistema(): void
    {
        $rol = $this->rol('cajero');
        $this->comoSuperadmin()->postJson('/api/usuarios', ['nombre' => 'Marta', 'rolId' => $rol->id, 'password' => 'inicial123'])->assertCreated();
        $this->assertTrue((bool) Usuario::query()->where('nombre', 'Marta')->value('debe_cambiar_password'));

        $login = $this->entrar('Marta', 'inicial123')->assertOk()->assertJsonPath('usuario.debeCambiarPassword', true);
        $marta = $this->conToken($login->json('token'));

        // Con la contraseña inicial NO se puede usar nada...
        $marta->getJson('/api/sucursales')->assertStatus(403)->assertJsonPath('codigo', 'cambiar_password');
        $marta->getJson('/api/ventas/listado')->assertStatus(403)->assertJsonPath('codigo', 'cambiar_password');
        // ...salvo preguntar quién es, cambiarla y salir.
        $marta->getJson('/api/auth/yo')->assertOk()->assertJsonPath('usuario.debeCambiarPassword', true);

        // La misma contraseña no cuenta como "cambiarla".
        $marta->patchJson('/api/auth/password', ['passwordActual' => 'inicial123', 'password' => 'inicial123'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $marta->patchJson('/api/auth/password', ['passwordActual' => 'inicial123', 'password' => 'la-mia-propia-9'])->assertOk();

        // Cambiarla cierra las sesiones y apaga la marca: entra con la nueva y ya trabaja con normalidad.
        $marta->getJson('/api/auth/yo')->assertStatus(401);
        $nueva = $this->entrar('Marta', 'la-mia-propia-9')->assertOk()->assertJsonPath('usuario.debeCambiarPassword', false);
        $this->conToken($nueva->json('token'))->getJson('/api/sucursales')->assertOk();
    }

    public function test_el_bloqueo_se_exige_en_la_api_y_no_solo_en_la_pantalla(): void
    {
        $this->comoSuperadmin()->postJson('/api/usuarios', ['nombre' => 'Marta', 'rolId' => $this->rol('cajero')->id, 'password' => 'inicial123'])->assertCreated();
        $token = $this->entrar('Marta', 'inicial123')->json('token');

        // Cambiar de sucursal u operar con el token a mano tampoco está permitido.
        $this->conToken($token)->postJson('/api/auth/sucursal', ['sucursalId' => $this->central()->id])->assertStatus(403);
        $this->conToken($token)->postJson('/api/auth/salir')->assertOk();
    }

    public function test_restablecer_la_de_otro_lo_obliga_a_elegir_una_nueva_pero_la_propia_no(): void
    {
        $otro = $this->crearUsuario('Lucas', 'cajero');
        $super = $this->superadmin();
        $admin = $this->comoSuperadmin();

        $admin->patchJson('/api/usuarios/'.$otro->id, ['password' => 'temporal-123'])->assertOk();
        $this->assertTrue((bool) $otro->fresh()->debe_cambiar_password);

        // Cambiarse la suya desde la misma pantalla de usuarios no es "restablecer": no obliga a nada.
        $admin->patchJson('/api/usuarios/'.$super->id, ['password' => 'mi-nueva-clave-1'])->assertOk();
        $this->assertFalse((bool) $super->fresh()->debe_cambiar_password);
    }

    public function test_el_instalador_deja_al_superadmin_con_la_clave_de_fabrica_obligado_a_cambiarla(): void
    {
        $this->assertFalse((bool) $this->superadmin()->debe_cambiar_password, 'la semilla sola no fuerza nada (los tests la usan)');
        $this->artisan('cliente:aprovisionar', ['--plan' => 'pymes'])->assertSuccessful();
        $this->assertTrue((bool) $this->superadmin()->fresh()->debe_cambiar_password);
    }

    public function test_restablecer_clave_por_consola_genera_una_temporal_cierra_sesiones_y_obliga_a_cambiarla(): void
    {
        RateLimiter::clear('login:ip:127.0.0.1');
        $super = $this->superadmin();
        $token = $this->loguear($super, 'admin1234');

        // Escrito distinto (mayúsculas), igual lo encuentra.
        $this->artisan('usuario:restablecer-clave', ['usuario' => 'ADMINISTRADOR'])
            ->expectsOutputToContain('Contraseña temporal')->assertSuccessful();

        $this->assertTrue((bool) $super->fresh()->debe_cambiar_password);
        $this->conToken($token)->getJson('/api/auth/yo')->assertStatus(401);
        $this->assertSame(0, PersonalAccessToken::query()->where('tokenable_id', $super->id)->count());
        // La vieja ya no entra.
        $this->entrar('Administrador', 'admin1234')->assertStatus(401);
    }

    public function test_restablecer_clave_con_una_temporal_elegida_y_entra_obligado_a_cambiarla(): void
    {
        $this->artisan('usuario:restablecer-clave', ['usuario' => 'Administrador', '--clave' => 'temporal-xyz-1'])->assertSuccessful();
        $this->entrar('Administrador', 'temporal-xyz-1')->assertOk()->assertJsonPath('usuario.debeCambiarPassword', true);
        $this->assertDatabaseHas('auditoria', ['ambito' => 'Seguridad', 'campo' => 'Contraseña restablecida por consola']);
    }

    public function test_restablecer_clave_rechaza_un_nombre_inexistente_y_una_temporal_corta(): void
    {
        $this->artisan('usuario:restablecer-clave', ['usuario' => 'Nadie'])
            ->expectsOutputToContain('Administrador')->assertFailed();
        $this->artisan('usuario:restablecer-clave', ['usuario' => 'Administrador', '--clave' => 'corta'])->assertFailed();
        // Nada cambió: sigue entrando con la de siempre.
        $this->entrar('Administrador', 'admin1234')->assertOk();
    }
}
