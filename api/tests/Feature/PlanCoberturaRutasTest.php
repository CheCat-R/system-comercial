<?php

namespace Tests\Feature;

use App\Services\LicenciaService;
use Tests\TestCase;

/**
 * COBERTURA EXHAUSTIVA de las rutas que la Pieza 3 cableó con `plan:` —
 * `PlanMiddlewareTest` prueba el MECANISMO (3-4 rutas representativas);
 * esto prueba que CADA cableado real en `routes/api.php` quedó con la
 * clave correcta. Sin esto, un typo en una de las otras 12 rutas (ej.
 * `plan:almacen.conteo` en vez de `almacen.conteos`) no lo agarraba nada —
 * la ruta hubiera quedado SIEMPRE bloqueada (o siempre abierta) sin que
 * ningún test lo notara.
 */
class PlanCoberturaRutasTest extends TestCase
{
    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    private function fijarPlan(string $plan): void
    {
        app(LicenciaService::class)->fijar($plan);
    }

    /** [método, ruta, clave de plan] — exclusivas de Pymes (bloqueadas en Emprendedor). */
    private function rutasPymes(): array
    {
        return [
            ['GET', '/api/terminales', 'sistema.terminales'],
            ['GET', '/api/transferencias', 'almacen.transferencias'],
            ['GET', '/api/incidencias', 'almacen.incidencias'],
            ['GET', '/api/conteos', 'almacen.conteos'],
            ['POST', '/api/operaciones/fraccionar', 'almacen.fraccionamiento'],
            ['GET', '/api/cobranzas', 'ventas.cobranzas'],
            ['GET', '/api/presupuestos', 'ventas.presupuestos'],
            ['POST', '/api/ofertas', 'ventas.ofertas'],
            ['GET', '/api/compromisos', 'proveedores.ctasctes'],
            ['GET', '/api/echeqs', 'proveedores.echeqs'],
            ['GET', '/api/proveedores-edoc', 'proveedores.edoc'],
            ['GET', '/api/gerencia/rentabilidad', 'gerencia.rentabilidad'],
            ['GET', '/api/gerencia/reportes-ventas', 'gerencia.reportes'],
        ];
    }

    /** [método, ruta, clave de plan] — exclusivas de Corporativo (bloqueadas en Pymes). */
    private function rutasCorporativo(): array
    {
        return [
            ['GET', '/api/gerencia/valorizacion', 'gerencia.valorizacion'],
            ['GET', '/api/gerencia/auditoria', 'gerencia.auditoria'],
        ];
    }

    public function test_cada_ruta_pymes_esta_bloqueada_en_emprendedor_y_abierta_en_pymes(): void
    {
        $this->fijarPlan('emprendedor');
        $cliente = $this->comoSuperadmin();
        foreach ($this->rutasPymes() as [$metodo, $ruta, $clave]) {
            $res = $cliente->json($metodo, $ruta);
            $this->assertSame(
                403,
                $res->status(),
                "$metodo $ruta (plan:$clave) debería dar 403 en Emprendedor y dio {$res->status()}."
            );
        }

        $this->fijarPlan('pymes');
        $cliente = $this->comoSuperadmin();
        foreach ($this->rutasPymes() as [$metodo, $ruta, $clave]) {
            $res = $cliente->json($metodo, $ruta);
            $this->assertNotSame(
                403,
                $res->status(),
                "$metodo $ruta (plan:$clave) no debería dar 403 en Pymes."
            );
        }
    }

    public function test_cada_ruta_corporativo_esta_bloqueada_en_pymes_y_abierta_en_corporativo(): void
    {
        $this->fijarPlan('pymes');
        $cliente = $this->comoSuperadmin();
        foreach ($this->rutasCorporativo() as [$metodo, $ruta, $clave]) {
            $res = $cliente->json($metodo, $ruta);
            $this->assertSame(
                403,
                $res->status(),
                "$metodo $ruta (plan:$clave) debería dar 403 en Pymes y dio {$res->status()}."
            );
        }

        $this->fijarPlan('corporativo');
        $cliente = $this->comoSuperadmin();
        foreach ($this->rutasCorporativo() as [$metodo, $ruta, $clave]) {
            $res = $cliente->json($metodo, $ruta);
            $this->assertNotSame(
                403,
                $res->status(),
                "$metodo $ruta (plan:$clave) no debería dar 403 en Corporativo."
            );
        }
    }
}
