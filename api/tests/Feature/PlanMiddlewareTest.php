<?php

namespace Tests\Feature;

use App\Models\Usuario;
use App\Services\LicenciaService;
use Tests\TestCase;

/**
 * EL PLAN SE HACE CUMPLIR DE VERDAD, no solo se esconde en el panel: un
 * superadmin (permiso comodín `*`) sigue bloqueado por `plan:` si el plan de
 * la instalación no incluye la sección — son dos ejes distintos (ver
 * ExigirPlan). También los límites por cantidad (sucursales/usuarios).
 */
class PlanMiddlewareTest extends TestCase
{
    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    private function fijarPlan(string $plan): void
    {
        app(LicenciaService::class)->fijar($plan);
    }

    public function test_seccion_de_pymes_bloqueada_en_emprendedor_y_habilitada_en_pymes(): void
    {
        $this->fijarPlan('emprendedor');
        $this->comoSuperadmin()->getJson('/api/transferencias')
            ->assertStatus(403)->assertJsonPath('message', 'Esta función no está incluida en el plan actual.');

        $this->fijarPlan('pymes');
        $this->comoSuperadmin()->getJson('/api/transferencias')->assertOk();
    }

    public function test_seccion_de_corporativo_bloqueada_en_pymes_y_habilitada_en_corporativo(): void
    {
        $this->fijarPlan('pymes');
        $this->comoSuperadmin()->getJson('/api/gerencia/valorizacion')->assertStatus(403);

        $this->fijarPlan('corporativo');
        $this->comoSuperadmin()->getJson('/api/gerencia/valorizacion')->assertOk();
    }

    public function test_seccion_de_emprendedor_nunca_se_bloquea_en_ningun_plan(): void
    {
        foreach (['emprendedor', 'pymes', 'corporativo'] as $plan) {
            $this->fijarPlan($plan);
            $this->comoSuperadmin()->getJson('/api/gastos/resumen')->assertOk();
        }
    }

    public function test_fraccionar_pide_el_plan_ademas_del_permiso_de_rol(): void
    {
        $this->fijarPlan('emprendedor');
        $this->comoSuperadmin()->postJson('/api/operaciones/fraccionar', [])
            ->assertStatus(403)->assertJsonPath('message', 'Esta función no está incluida en el plan actual.');
    }

    public function test_limite_de_sucursales_por_plan(): void
    {
        // La semilla ya trae "Central": Emprendedor (límite 1) no puede sumar otra.
        $this->fijarPlan('emprendedor');
        $this->comoSuperadmin()->postJson('/api/sucursales', ['nombre' => 'Sucursal 2'])
            ->assertStatus(422)
            ->assertJsonPath('errors.sucursal.0', 'El plan actual admite hasta 1 sucursal. Para sumar otra hay que subir de plan.');

        // Pymes (límite 3) sí puede.
        $this->fijarPlan('pymes');
        $this->comoSuperadmin()->postJson('/api/sucursales', ['nombre' => 'Sucursal 2'])->assertCreated();

        // Corporativo no tiene techo.
        $this->fijarPlan('corporativo');
        $this->comoSuperadmin()->postJson('/api/sucursales', ['nombre' => 'Sucursal 3'])->assertCreated();
    }

    public function test_limite_de_usuarios_por_plan(): void
    {
        // La semilla ya trae al superadmin activo. Emprendedor admite hasta 3.
        $this->fijarPlan('emprendedor');
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Lucas', 'rolId' => $this->rol('cajero')->id, 'password' => 'lucas1234',
        ])->assertCreated();
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Ana', 'rolId' => $this->rol('cajero')->id, 'password' => 'ana12345',
        ])->assertCreated();

        // El cuarto (superadmin + Lucas + Ana + este) ya no entra en el plan.
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Otro', 'rolId' => $this->rol('cajero')->id, 'password' => 'otro1234',
        ])->assertStatus(422)
            ->assertJsonPath('errors.rolId.0', 'El plan actual admite hasta 3 usuarios activos. Para sumar otro hay que subir de plan, o desactivar uno que ya no se use.');

        // Un usuario desactivado libera un cupo.
        $lucas = Usuario::query()->where('nombre', 'Lucas')->firstOrFail();
        $lucas->update(['activo' => false]);
        $this->comoSuperadmin()->postJson('/api/usuarios', [
            'nombre' => 'Otro', 'rolId' => $this->rol('cajero')->id, 'password' => 'otro1234',
        ])->assertCreated();
    }
}
