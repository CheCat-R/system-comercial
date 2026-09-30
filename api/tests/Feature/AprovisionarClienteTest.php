<?php

namespace Tests\Feature;

use App\Models\Sucursal;
use App\Models\Usuario;
use App\Services\LicenciaService;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * `cliente:aprovisionar` — el alta de una instalación nueva en un solo
 * comando. `TestCase::setUp()` ya siembra Central + Sucursal 1 sin plan
 * fijado (Corporativo por defecto, sin límite); acá se borran las sucursales
 * antes de cada test para simular una base de verdad recién creada, donde el
 * plan SÍ se fija antes de sembrar.
 */
class AprovisionarClienteTest extends TestCase
{
    public function test_emprendedor_no_recibe_la_sucursal_de_ejemplo(): void
    {
        Sucursal::query()->delete();

        Artisan::call('cliente:aprovisionar', ['--plan' => 'emprendedor']);

        $this->assertSame('emprendedor', app(LicenciaService::class)->plan());
        $this->assertSame(1, Sucursal::query()->count());
        $this->assertSame('Central', Sucursal::query()->first()->nombre);
    }

    public function test_pymes_si_recibe_la_sucursal_de_ejemplo(): void
    {
        Sucursal::query()->delete();

        Artisan::call('cliente:aprovisionar', ['--plan' => 'pymes']);

        $this->assertSame('pymes', app(LicenciaService::class)->plan());
        $this->assertSame(2, Sucursal::query()->count());
    }

    public function test_deja_el_superadmin_listo_para_entrar(): void
    {
        Sucursal::query()->delete();
        Usuario::query()->delete();

        $codigo = Artisan::call('cliente:aprovisionar', ['--plan' => 'corporativo']);

        $this->assertSame(0, $codigo);
        $admin = Usuario::query()->where('nombre', 'Administrador')->first();
        $this->assertNotNull($admin);
        $this->assertTrue($admin->activo);
    }

    public function test_plan_invalido_no_toca_nada(): void
    {
        Sucursal::query()->delete();

        $codigo = Artisan::call('cliente:aprovisionar', ['--plan' => 'premium']);

        $this->assertNotSame(0, $codigo);
        $this->assertSame(0, Sucursal::query()->count());
    }

    public function test_correrlo_dos_veces_es_seguro(): void
    {
        Sucursal::query()->delete();

        Artisan::call('cliente:aprovisionar', ['--plan' => 'emprendedor']);
        Artisan::call('cliente:aprovisionar', ['--plan' => 'emprendedor']);

        $this->assertSame(1, Sucursal::query()->count());
        $this->assertSame(1, Usuario::query()->where('nombre', 'Administrador')->count());
    }
}
