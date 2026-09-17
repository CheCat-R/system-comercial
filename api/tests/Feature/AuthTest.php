<?php

namespace Tests\Feature;

use App\Models\Sucursal;
use App\Models\Terminal;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_health_y_opciones_son_publicos(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJson(['ok' => true]);

        $res = $this->getJson('/api/auth/opciones')->assertOk();
        $this->assertNotEmpty($res->json('usuarios'));
        $this->assertNotEmpty($res->json('sucursales'));
        // Público: ni permisos ni si tiene contraseña.
        $this->assertArrayNotHasKey('permisos', $res->json('usuarios.0'));
        $this->assertArrayNotHasKey('tienePassword', $res->json('usuarios.0'));
    }

    public function test_todo_lo_demas_esta_cerrado_sin_token(): void
    {
        $this->getJson('/api/auth/yo')->assertStatus(401)->assertJson(['message' => 'Tu sesión venció. Volvé a entrar.']);
        $this->getJson('/api/usuarios')->assertStatus(401);
        $this->getJson('/api/sucursales')->assertStatus(401);
    }

    public function test_login_devuelve_token_y_yo_lo_reconoce(): void
    {
        $admin = $this->superadmin();
        $res = $this->postJson('/api/auth/login', [
            'usuarioId' => $admin->id, 'password' => 'admin1234', 'sucursalId' => $this->central()->id,
        ])->assertOk()->assertJsonStructure(['ok', 'token', 'usuario' => ['id', 'nombre', 'rolClave', 'rolNombre', 'permisos'], 'sucursal', 'terminal']);

        $this->assertSame(['*'], $res->json('usuario.permisos'));
        $this->assertNull($res->json('terminal'));

        $yo = $this->conToken($res->json('token'))->getJson('/api/auth/yo')->assertOk();
        $this->assertSame($admin->id, $yo->json('usuario.id'));
        $this->assertSame($this->central()->id, $yo->json('sucursal.id'));
        // Los mismos campos que el login: el panel reemplaza el usuario con esta respuesta.
        $this->assertSame('Superadmin', $yo->json('usuario.rolNombre'));

        // El token queda hasheado en la base, con la sucursal del turno.
        $fila = PersonalAccessToken::query()->first();
        $this->assertNotSame($res->json('token'), $fila->token);
        $this->assertSame($this->central()->id, $fila->sucursal_id);
        $this->assertNotNull($fila->expires_at);
    }

    public function test_contrasena_incorrecta_es_401_con_mensaje(): void
    {
        $admin = $this->superadmin();
        $this->postJson('/api/auth/login', ['usuarioId' => $admin->id, 'password' => 'nope', 'sucursalId' => $this->central()->id])
            ->assertStatus(401)->assertJson(['message' => 'Contraseña incorrecta.']);
    }

    public function test_el_cajero_necesita_sucursal_y_el_superadmin_no(): void
    {
        $cajero = $this->crearUsuario('Lucas', 'cajero');
        $this->postJson('/api/auth/login', ['usuarioId' => $cajero->id, 'password' => 'clave1234'])
            ->assertStatus(401)->assertJson(['message' => 'Elegí la sucursal con la que vas a operar.']);

        $res = $this->postJson('/api/auth/login', ['usuarioId' => $this->superadmin()->id, 'password' => 'admin1234'])
            ->assertOk();
        $this->assertSame($this->central()->id, $res->json('sucursal.id'));
    }

    public function test_la_terminal_registrada_fija_la_sucursal_e_ignora_el_body(): void
    {
        $express = Sucursal::query()->where('tipo', 'express')->firstOrFail();
        [$token, $hash] = Terminal::nuevoToken();
        Terminal::query()->create(['nombre' => 'Caja 1', 'sucursal_id' => $express->id, 'token_hash' => $hash]);

        // "¿Quién soy?" antes del login.
        $this->postJson('/api/terminales/actual', ['token' => $token])->assertOk()
            ->assertJsonPath('terminal.nombre', 'Caja 1')->assertJsonPath('terminal.sucursal.id', $express->id);

        $cajero = $this->crearUsuario('Lucas', 'cajero');
        $res = $this->postJson('/api/auth/login', [
            'usuarioId' => $cajero->id, 'password' => 'clave1234',
            'sucursalId' => $this->central()->id, // se ignora
            'terminalToken' => $token,
        ])->assertOk();
        $this->assertSame($express->id, $res->json('sucursal.id'));
        $this->assertSame('Caja 1', $res->json('terminal.nombre'));
        $this->assertNotNull(Terminal::query()->first()->ultimo_uso);
    }

    public function test_el_permiso_se_exige_en_la_api_no_solo_en_el_menu(): void
    {
        $cajero = $this->crearUsuario('Lucas', 'cajero');
        $token = $this->loguear($cajero);

        // 403 y no 401: la sesión está bien, lo que falta es el permiso.
        $this->conToken($token)->getJson('/api/usuarios')->assertStatus(403)
            ->assertJson(['message' => 'Tu rol no tiene permiso para esto.']);
        // Lo que sí puede: leer sucursales.
        $this->conToken($token)->getJson('/api/sucursales')->assertOk();
        // El cajero no cambia de sucursal.
        $this->conToken($token)->postJson('/api/auth/sucursal', ['sucursalId' => $this->central()->id + 1])->assertStatus(403);
    }

    public function test_salir_cierra_solo_esa_sesion(): void
    {
        $admin = $this->superadmin();
        $t1 = $this->loguear($admin, 'admin1234');
        $t2 = $this->loguear($admin, 'admin1234');

        $this->conToken($t1)->postJson('/api/auth/salir')->assertOk();
        $this->conToken($t1)->getJson('/api/auth/yo')->assertStatus(401);
        $this->conToken($t2)->getJson('/api/auth/yo')->assertOk();
    }

    public function test_desactivar_al_usuario_mata_sus_sesiones_ya(): void
    {
        $cajero = $this->crearUsuario('Lucas', 'cajero');
        $token = $this->loguear($cajero);
        $this->conToken($token)->getJson('/api/auth/yo')->assertOk();

        $cajero->update(['activo' => false]);

        $this->conToken($token)->getJson('/api/auth/yo')->assertStatus(401);
        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    public function test_la_sesion_vence_por_inactividad_y_se_estira_con_el_uso(): void
    {
        $admin = $this->superadmin();
        $token = $this->loguear($admin, 'admin1234');
        $fila = PersonalAccessToken::query()->firstOrFail();
        $venceOriginal = $fila->expires_at;

        // A las 7 h de las 12 queda menos de la mitad: usarla la estira.
        $this->travel(7)->hours();
        $this->conToken($token)->getJson('/api/auth/yo')->assertOk();
        $this->assertTrue($fila->refresh()->expires_at->gt($venceOriginal));

        // 13 h sin uso: vencida y borrada.
        $this->travel(13)->hours();
        $this->conToken($token)->getJson('/api/auth/yo')->assertStatus(401);
        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    public function test_el_freno_corta_tras_cinco_fallos_y_el_exito_lo_limpia(): void
    {
        RateLimiter::clear('login:ip:127.0.0.1');
        $admin = $this->superadmin();
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['usuarioId' => $admin->id, 'password' => 'mal', 'sucursalId' => $this->central()->id])->assertStatus(401);
        }
        $this->postJson('/api/auth/login', ['usuarioId' => $admin->id, 'password' => 'admin1234', 'sucursalId' => $this->central()->id])
            ->assertStatus(429);

        // Otro usuario desde la misma IP no está frenado (el cupo es por usuario+IP).
        $cajero = $this->crearUsuario('Lucas', 'cajero');
        $this->postJson('/api/auth/login', ['usuarioId' => $cajero->id, 'password' => 'clave1234', 'sucursalId' => $this->central()->id])->assertOk();

        // Pasada la espera, entra y queda limpio.
        $this->travel(6)->minutes();
        $this->postJson('/api/auth/login', ['usuarioId' => $admin->id, 'password' => 'admin1234', 'sucursalId' => $this->central()->id])->assertOk();
    }
}
