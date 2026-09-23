<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Tests\TestCase;

/**
 * GERENCIA › AUDITORÍA — la línea de tiempo que junta cuatro fuentes que ya
 * existían (cambios de la tabla `auditoria`, anulaciones, reversiones de
 * precios y diferencias de caja) sin reescribir ninguna.
 */
class GerenciaAuditoriaTest extends TestCase
{
    private string $admin;

    private string $cajero;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $this->cajero = $this->loguear($this->crearUsuario('Lucas', 'cajero'));
    }

    private function admin(): static
    {
        return $this->conToken($this->admin);
    }

    private function cajero(): static
    {
        return $this->conToken($this->cajero);
    }

    private function eventosDeTipo(array $r, string $tipo): array
    {
        return array_values(array_filter($r['eventos'], fn ($e) => $e['tipo'] === $tipo));
    }

    public function test_un_cambio_de_percepciones_aparece_como_cambio(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $this->admin()->putJson('/api/proveedores/'.$prov['id'].'/percepciones', ['percepciones' => [['nombre' => 'IIBB', 'alicuota' => 3, 'base' => 'neto']]])->assertOk();

        $r = $this->admin()->getJson('/api/gerencia/auditoria')->assertOk()->json();
        $cambios = $this->eventosDeTipo($r, 'cambio');
        $this->assertNotEmpty($cambios);
        $this->assertStringContainsString('Percepciones', $cambios[0]['resumen']);
        $this->assertSame('Administrador', $cambios[0]['usuario']);
    }

    public function test_una_venta_anulada_aparece_con_quien_la_anulo(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $listas = $this->admin()->getJson('/api/listas')->json('listas');
        $mostrador = collect($listas)->firstWhere('nombre', 'Mostrador');
        $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 10, 'sucursalId' => $this->central()->id])->assertOk();
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();

        $v = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $venta = $this->admin()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 726]]])->assertOk()->json();
        $this->admin()->postJson('/api/ventas/'.$venta['id'].'/anular', ['motivo' => 'Cliente se arrepintió'])->assertOk();

        $r = $this->admin()->getJson('/api/gerencia/auditoria')->assertOk()->json();
        $anulaciones = $this->eventosDeTipo($r, 'anulacion');
        $venta_ev = collect($anulaciones)->first(fn ($e) => str_contains($e['resumen'], 'Venta'));
        $this->assertNotNull($venta_ev);
        $this->assertSame('Administrador', $venta_ev['usuario']);
        $this->assertStringContainsString('Cliente se arrepintió', $venta_ev['resumen']);
        $this->assertEqualsWithDelta(726, $venta_ev['monto'], 0.01);
    }

    public function test_un_comprobante_anulado_muestra_quien_lo_anulo_no_quien_lo_cargo(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id']])->assertCreated()->json();
        $f = $this->admin()->postJson('/api/comprobantes', ['tipo' => 'factura', 'proveedorId' => $prov['id'], 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'costoUnitario' => 1000]]])->assertCreated()->json();

        // Otro usuario (distinto del que cargó la factura) es quien la anula.
        $otro = $this->loguear($this->crearUsuario('Ana', 'admin'));
        $this->conToken($otro)->postJson('/api/comprobantes/'.$f['id'].'/anular', ['motivo' => 'Factura duplicada'])->assertOk();

        $r = $this->admin()->getJson('/api/gerencia/auditoria')->assertOk()->json();
        $anulaciones = $this->eventosDeTipo($r, 'anulacion');
        $comp_ev = collect($anulaciones)->first(fn ($e) => str_contains($e['resumen'], 'Comprobante'));
        $this->assertNotNull($comp_ev);
        // El dato clave del fix: "Ana" anuló, no "Administrador" que cargó la factura.
        $this->assertSame('Ana', $comp_ev['usuario']);
        $this->assertStringContainsString('Factura duplicada', $comp_ev['resumen']);
    }

    public function test_revertir_un_lote_de_precios_aparece_agrupado_por_lote(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p1 = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $p2 = $this->admin()->postJson('/api/productos', ['nombre' => 'Yerba Mate', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 8000])->assertCreated()->json();

        $cambio = $this->admin()->postJson('/api/precios/costos', [
            'cambios' => [
                ['id' => $p1['formatosCompra'][0]['id'], 'costo' => 12000],
                ['id' => $p2['formatosCompra'][0]['id'], 'costo' => 9000],
            ],
            'motivo' => 'Ajuste de lista del proveedor',
        ])->assertOk()->json();
        $this->admin()->postJson('/api/precios/revertir/'.$cambio['lote'])->assertOk();

        $r = $this->admin()->getJson('/api/gerencia/auditoria')->assertOk()->json();
        $reversiones = $this->eventosDeTipo($r, 'reversion_precio');
        $this->assertCount(1, $reversiones); // UN evento para los 2 productos del lote, no dos sueltos.
        $this->assertStringContainsString('2 producto(s)', $reversiones[0]['resumen']);
        $this->assertStringContainsString($cambio['lote'], $reversiones[0]['resumen']);
    }

    public function test_una_diferencia_de_caja_aparece(): void
    {
        $t = $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 800])->assertCreated()->json();
        $this->admin()->postJson('/api/caja/'.$t['id'].'/control', ['contadoEfectivo' => 790])->assertCreated();

        $r = $this->admin()->getJson('/api/gerencia/auditoria')->assertOk()->json();
        $diferencias = $this->eventosDeTipo($r, 'diferencia_caja');
        $this->assertNotEmpty($diferencias);
        $this->assertEqualsWithDelta(-10, $diferencias[0]['monto'], 0.01);
        $this->assertStringContainsString('Central', $diferencias[0]['resumen']);
    }

    public function test_filtra_por_tipo(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $this->admin()->putJson('/api/proveedores/'.$prov['id'].'/percepciones', ['percepciones' => [['nombre' => 'IIBB', 'alicuota' => 3, 'base' => 'neto']]])->assertOk();
        $t = $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 800])->assertCreated()->json();
        $this->admin()->postJson('/api/caja/'.$t['id'].'/control', ['contadoEfectivo' => 790])->assertCreated();

        $r = $this->admin()->getJson('/api/gerencia/auditoria?tipo=diferencia_caja')->assertOk()->json();
        $this->assertNotEmpty($r['eventos']);
        $this->assertTrue(collect($r['eventos'])->every(fn ($e) => $e['tipo'] === 'diferencia_caja'));
    }

    public function test_gerencia_auditoria_requiere_su_permiso(): void
    {
        $this->cajero()->getJson('/api/gerencia/auditoria')->assertStatus(403);
    }
}
