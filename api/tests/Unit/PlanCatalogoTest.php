<?php

namespace Tests\Unit;

use App\Auth\PlanCatalogo;
use App\Auth\Permisos;
use PHPUnit\Framework\TestCase;

/**
 * PRUEBAS DE `PlanCatalogo` — puro (sin base), no depende de qué plan tenga
 * ninguna instalación real (eso es `LicenciaService`, que sí toca la base).
 */
class PlanCatalogoTest extends TestCase
{
    public function test_emprendedor_tiene_lo_basico_pero_no_lo_de_pymes_ni_corporativo(): void
    {
        $this->assertTrue(PlanCatalogo::incluye('emprendedor', 'ventas.pos'));
        $this->assertTrue(PlanCatalogo::incluye('emprendedor', 'compras.facturacion'));
        $this->assertTrue(PlanCatalogo::incluye('emprendedor', 'gastos.resumen'));

        $this->assertFalse(PlanCatalogo::incluye('emprendedor', 'ventas.presupuestos'));
        $this->assertFalse(PlanCatalogo::incluye('emprendedor', 'almacen.fraccionamiento'));
        $this->assertFalse(PlanCatalogo::incluye('emprendedor', 'gerencia.auditoria'));
        $this->assertFalse(PlanCatalogo::incluye('emprendedor', 'liquidaciones'));
        $this->assertFalse(PlanCatalogo::incluye('emprendedor', 'web.productos'));
    }

    public function test_pymes_suma_lo_de_emprendedor_pero_no_lo_exclusivo_de_corporativo(): void
    {
        // Todo lo de Emprendedor sigue estando.
        $this->assertTrue(PlanCatalogo::incluye('pymes', 'ventas.pos'));
        $this->assertTrue(PlanCatalogo::incluye('pymes', 'gastos.resumen'));

        // Lo que suma Pymes.
        $this->assertTrue(PlanCatalogo::incluye('pymes', 'ventas.presupuestos'));
        $this->assertTrue(PlanCatalogo::incluye('pymes', 'almacen.fraccionamiento'));
        $this->assertTrue(PlanCatalogo::incluye('pymes', 'proveedores.ctasctes'));
        $this->assertTrue(PlanCatalogo::incluye('pymes', 'gerencia.rentabilidad'));

        // Lo exclusivo de Corporativo sigue sin estar.
        $this->assertFalse(PlanCatalogo::incluye('pymes', 'gerencia.valorizacion'));
        $this->assertFalse(PlanCatalogo::incluye('pymes', 'gerencia.auditoria'));
        $this->assertFalse(PlanCatalogo::incluye('pymes', 'liquidaciones'));
        $this->assertFalse(PlanCatalogo::incluye('pymes', 'compras.lecturas'));
        $this->assertFalse(PlanCatalogo::incluye('pymes', 'gastos.fiscal_avanzado'));
    }

    public function test_corporativo_lo_tiene_todo_sin_lista_incluso_una_clave_que_no_existe_todavia(): void
    {
        $this->assertTrue(PlanCatalogo::incluye('corporativo', 'gerencia.auditoria'));
        $this->assertTrue(PlanCatalogo::incluye('corporativo', 'liquidaciones'));
        $this->assertTrue(PlanCatalogo::incluye('corporativo', 'web.productos'));
        // Falla abierta: una sección que se agregue mañana ya está disponible en Corporativo sin tocar el catálogo.
        $this->assertTrue(PlanCatalogo::incluye('corporativo', 'gerencia.modulo-que-no-existe-todavia'));
    }

    public function test_un_plan_desconocido_no_incluye_nada(): void
    {
        $this->assertFalse(PlanCatalogo::incluye('premium', 'ventas.pos'));
    }

    public function test_limites_por_plan(): void
    {
        $this->assertSame(1, PlanCatalogo::limite('emprendedor', 'sucursales'));
        $this->assertSame(3, PlanCatalogo::limite('emprendedor', 'usuarios'));
        $this->assertSame(3, PlanCatalogo::limite('pymes', 'sucursales'));
        $this->assertSame(10, PlanCatalogo::limite('pymes', 'usuarios'));
        $this->assertNull(PlanCatalogo::limite('corporativo', 'sucursales'));
        $this->assertNull(PlanCatalogo::limite('corporativo', 'usuarios'));
    }

    public function test_claves_de_emprendedor_y_pymes_son_permisos_reales_o_propias_del_catalogo(): void
    {
        $conocidas = PlanCatalogo::clavesConocidas();
        foreach ([...PlanCatalogo::claves('emprendedor'), ...PlanCatalogo::claves('pymes')] as $clave) {
            $this->assertContains(
                $clave,
                $conocidas,
                "\"$clave\" no es una clave real de Permisos::CATALOGO ni está en PlanCatalogo::CLAVES_PROPIAS — ¿typo?"
            );
        }
    }

    public function test_pymes_no_repite_ninguna_clave_de_emprendedor(): void
    {
        $emprendedor = PlanCatalogo::claves('emprendedor');
        $pymesSuma = array_diff(PlanCatalogo::claves('pymes'), $emprendedor);
        $this->assertCount(
            count(PlanCatalogo::claves('pymes')) - count($emprendedor),
            $pymesSuma,
            'Hay una clave duplicada entre lo que trae Emprendedor y lo que "suma" Pymes.'
        );
    }
}
