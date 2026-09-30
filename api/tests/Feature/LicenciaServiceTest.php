<?php

namespace Tests\Feature;

use App\Services\LicenciaService;
use InvalidArgumentException;
use Tests\TestCase;

/**
 * EL PLAN COMERCIAL de la instalación — dónde vive y quién lo puede cambiar.
 * A propósito NO hay tests de HTTP acá: todavía no existe una ruta que exponga
 * esto (ver LicenciaService), justamente para que el cliente no se lo pueda
 * subir solo con un PUT como las demás áreas de ConfiguracionService.
 */
class LicenciaServiceTest extends TestCase
{
    public function test_una_instalacion_sin_plan_fijado_se_comporta_como_corporativo(): void
    {
        $svc = app(LicenciaService::class);

        $this->assertSame('corporativo', $svc->plan());
    }

    public function test_fijar_un_plan_valido_lo_persiste(): void
    {
        $svc = app(LicenciaService::class);

        $svc->fijar('pymes');

        $this->assertSame('pymes', $svc->plan());
        // Otra instancia del servicio (sin la caché en memoria de la primera) lee lo mismo de la base.
        $this->assertSame('pymes', app(LicenciaService::class)->plan());
    }

    public function test_fijar_un_plan_invalido_no_cambia_nada(): void
    {
        $svc = app(LicenciaService::class);
        $svc->fijar('emprendedor');

        $this->expectException(InvalidArgumentException::class);
        try {
            $svc->fijar('premium');
        } finally {
            $this->assertSame('emprendedor', app(LicenciaService::class)->plan());
        }
    }

    public function test_no_existe_ninguna_ruta_http_para_leer_o_escribir_el_plan(): void
    {
        $token = $this->loguear($this->superadmin(), 'admin1234');

        $this->conToken($token)->getJson('/api/configuracion/licencia')->assertStatus(404);
    }
}
