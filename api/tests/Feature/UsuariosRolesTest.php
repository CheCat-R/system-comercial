<?php

namespace Tests\Feature;

use App\Models\Rol;
use App\Models\Usuario;
use Tests\TestCase;

class UsuariosRolesTest extends TestCase
{
    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    private function comoAdmin(): static
    {
        $admin = Usuario::query()->where('nombre', 'Ana')->first() ?? $this->crearUsuario('Ana', 'admin');

        return $this->conToken($this->loguear($admin));
    }

    public function test_catalogo_de_permisos_y_lista_de_roles(): void
    {
        $this->comoSuperadmin()->getJson('/api/roles/permisos')->assertOk()
            ->assertJsonPath('0.grupo', 'General');
        $res = $this->comoSuperadmin()->getJson('/api/roles')->assertOk();
        $this->assertCount(4, $res->json('data'));
        $this->assertSame(1, collect($res->json('data'))->firstWhere('clave', 'superadmin')['usuarios']);
    }

    public function test_crear_usuario_y_entrar_con_el(): void
    {
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Lucas', 'rolId' => $this->rol('cajero')->id, 'password' => 'lucas1234',
        ])->assertCreated()->assertJsonPath('usuario.rolClave', 'cajero')->assertJsonPath('usuario.tienePassword', true);

        $lucas = Usuario::query()->where('nombre', 'Lucas')->firstOrFail();
        $this->loguear($lucas, 'lucas1234');
    }

    public function test_contrasena_corta_es_422(): void
    {
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Lucas', 'rolId' => $this->rol('cajero')->id, 'password' => '1234',
        ])->assertStatus(422)->assertJsonPath('message', 'La contraseña necesita al menos 8 caracteres.');
    }

    public function test_el_comodin_no_se_pide_y_el_superadmin_no_se_edita(): void
    {
        $this->comoSuperadmin()->postJson('/api/roles', ['nombre' => 'Dios', 'permisos' => ['*']])
            ->assertStatus(422)->assertJsonPath('message', 'El comodín de superadmin no se asigna desde acá.');

        $this->comoSuperadmin()->patchJson('/api/roles/'.$this->rol('superadmin')->id, ['nombre' => 'Otro'])
            ->assertStatus(422);
    }

    public function test_el_admin_no_otorga_lo_que_no_tiene(): void
    {
        // `cta_cte` es la llave del crédito: sólo el superadmin la tiene.
        $this->comoAdmin()->postJson('/api/roles', ['nombre' => 'Vendedor', 'permisos' => ['ventas.pos', 'cta_cte']])
            ->assertStatus(422)->assertJsonPath('message', 'No podés otorgar permisos que vos no tenés: cta_cte.');

        // Ni nombra a otro superadmin, ni edita al dueño.
        $this->comoAdmin()->postJson('/api/usuarios', [
            'nombre' => 'Falso', 'rolId' => $this->rol('superadmin')->id, 'password' => 'falso1234',
        ])->assertStatus(403);
        $this->comoAdmin()->patchJson('/api/usuarios/'.$this->superadmin()->id, ['password' => 'hackeada1'])
            ->assertStatus(403);
        // Pero sí puede armar un rol con lo que tiene.
        $this->comoAdmin()->postJson('/api/roles', ['nombre' => 'Vendedor', 'permisos' => ['ventas.pos', 'ventas']])
            ->assertCreated()->assertJsonPath('rol.clave', 'vendedor');
    }

    public function test_no_se_puede_dejar_el_sistema_sin_superadmin(): void
    {
        $id = $this->superadmin()->id;
        $this->comoSuperadmin()->patchJson('/api/usuarios/'.$id, ['activo' => false])
            ->assertStatus(422)->assertJsonPath('message', 'Es el último superadmin activo: primero nombrá otro.');
        $this->comoSuperadmin()->patchJson('/api/usuarios/'.$id, ['rolId' => $this->rol('admin')->id])
            ->assertStatus(422);
    }

    public function test_cambiar_contrasena_echa_al_usuario_de_sus_sesiones(): void
    {
        $lucas = $this->crearUsuario('Lucas', 'cajero');
        $tokenLucas = $this->loguear($lucas);
        $this->conToken($tokenLucas)->getJson('/api/auth/yo')->assertOk();

        $this->comoSuperadmin()->patchJson('/api/usuarios/'.$lucas->id, ['password' => 'nueva1234'])->assertOk();

        $this->conToken($tokenLucas)->getJson('/api/auth/yo')->assertStatus(401);
        $this->loguear($lucas, 'nueva1234');
    }

    public function test_roles_de_sistema_no_se_borran_ni_los_que_tienen_usuarios(): void
    {
        $this->comoSuperadmin()->deleteJson('/api/roles/'.$this->rol('cajero')->id)->assertStatus(422);

        $rol = Rol::query()->create(['clave' => 'temporal', 'nombre' => 'Temporal', 'permisos' => ['dashboard']]);
        $this->crearUsuario('Pepe', 'temporal');
        $this->comoSuperadmin()->deleteJson('/api/roles/'.$rol->id)
            ->assertStatus(422)->assertJsonPath('message', 'Hay usuarios con ese rol: reasignalos primero.');
    }

    public function test_relevo_de_caja_exige_pin(): void
    {
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Sofi', 'rolId' => $this->rol('cajero')->id, 'password' => 'sofi12345', 'relevoCaja' => true,
        ])->assertStatus(422)->assertJsonPath('message', 'Para habilitarlo como relevo de caja definile un PIN.');

        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Sofi', 'rolId' => $this->rol('cajero')->id, 'password' => 'sofi12345', 'relevoCaja' => true, 'pin' => '1234',
        ])->assertCreated()->assertJsonPath('usuario.relevoCaja', true)->assertJsonPath('usuario.tienePin', true);
    }
}
