<?php

namespace Tests\Feature;

use App\Models\Terminal;
use Tests\TestCase;

class SucursalesTerminalesTest extends TestCase
{
    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    public function test_abm_de_sucursales_y_punto_de_venta_normalizado(): void
    {
        $res = $this->comoSuperadmin()->postJson('/api/sucursales', [
            'nombre' => 'Express Norte', 'puntoVenta' => '7', 'direccion' => 'Belgrano 728',
        ])->assertCreated();
        $this->assertSame('00007', $res->json('puntoVenta'));
        $this->assertSame('express', $res->json('tipo'));
        $id = $res->json('id');

        // Otro local con el mismo punto de venta rebota.
        $this->comoSuperadmin()->postJson('/api/sucursales', ['nombre' => 'Otra', 'puntoVenta' => '00007'])
            ->assertStatus(422);
        // El mismo local puede guardarse de nuevo con su propio punto de venta.
        $this->comoSuperadmin()->patchJson('/api/sucursales/'.$id, ['nombre' => 'Express Norte', 'puntoVenta' => '7'])
            ->assertOk();
        // Sólo una distribuidora.
        $this->comoSuperadmin()->postJson('/api/sucursales', ['nombre' => 'Dep 2', 'tipo' => 'distribuidora'])
            ->assertStatus(422);

        $this->comoSuperadmin()->deleteJson('/api/sucursales/'.$id)->assertOk();
        $this->comoSuperadmin()->getJson('/api/sucursales/'.$id)->assertStatus(404);
    }

    public function test_el_cajero_lee_sucursales_pero_no_las_edita(): void
    {
        $token = $this->loguear($this->crearUsuario('Lucas', 'cajero'));
        $this->conToken($token)->getJson('/api/sucursales')->assertOk();
        $this->conToken($token)->postJson('/api/sucursales', ['nombre' => 'X'])->assertStatus(403);
    }

    public function test_registrar_terminal_devuelve_el_token_una_sola_vez(): void
    {
        $res = $this->comoSuperadmin()->postJson('/api/terminales', [
            'nombre' => 'Caja 1', 'sucursalId' => $this->central()->id,
        ])->assertCreated();
        $token = $res->json('token');
        $this->assertNotEmpty($token);
        $this->assertArrayNotHasKey('token_hash', $res->json('terminal'));

        $lista = $this->comoSuperadmin()->getJson('/api/terminales')->assertOk();
        $this->assertArrayNotHasKey('token', $lista->json('data.0'));
        $this->assertSame('Caja 1', $lista->json('data.0.nombre'));

        // Dada de baja, el navegador vuelve a ser anónimo.
        $this->comoSuperadmin()->patchJson('/api/terminales/'.$res->json('terminal.id'), ['activa' => false])->assertOk();
        $this->postJson('/api/terminales/actual', ['token' => $token])->assertOk()->assertJsonPath('terminal', null);
        $this->assertSame(1, Terminal::query()->count());
    }
}
