<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * PERFIL PROPIO — cualquier usuario cambia su propia contraseña sin permiso
 * de gerencia.usuarios (es su cuenta, no la de otro). Distinto del PATCH de
 * gerencia sobre /usuarios/{id}: acá la autoridad es "sé la contraseña
 * actual", no un permiso de rol.
 */
class PerfilTest extends TestCase
{
    public function test_un_cajero_cambia_su_propia_password_sin_permiso_de_gerencia(): void
    {
        $lucas = $this->crearUsuario('Lucas', 'cajero');
        $token = $this->loguear($lucas);

        $this->conToken($token)->patchJson('/api/auth/password', [
            'passwordActual' => 'clave1234',
            'password' => 'nueva1234',
        ])->assertOk();

        // Lo echó de TODAS sus sesiones, esta incluida.
        $this->conToken($token)->getJson('/api/auth/yo')->assertStatus(401);
        // La vieja ya no sirve; la nueva sí.
        $this->postJson('/api/auth/login', ['usuario' => $lucas->nombre, 'password' => 'clave1234'])->assertStatus(401);
        $this->loguear($lucas, 'nueva1234');
    }

    public function test_password_actual_incorrecta_no_cambia_nada_y_no_echa_la_sesion(): void
    {
        $lucas = $this->crearUsuario('Lucas', 'cajero');
        $token = $this->loguear($lucas);

        $this->conToken($token)->patchJson('/api/auth/password', [
            'passwordActual' => 'noEsEsta',
            'password' => 'nueva1234',
        ])->assertStatus(422)->assertJsonPath('errors.passwordActual.0', 'La contraseña actual no coincide.');

        // La sesión sigue viva: no se tocó nada.
        $this->conToken($token)->getJson('/api/auth/yo')->assertOk();
        $this->loguear($lucas, 'clave1234');
    }

    public function test_password_nueva_corta_es_422(): void
    {
        $lucas = $this->crearUsuario('Lucas', 'cajero');
        $token = $this->loguear($lucas);

        $this->conToken($token)->patchJson('/api/auth/password', [
            'passwordActual' => 'clave1234',
            'password' => '1234',
        ])->assertStatus(422);

        $this->loguear($lucas, 'clave1234');
    }
}
