<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Tests\TestCase;

/**
 * GERENCIA › REPORTES DE VENTAS — cómo viene el mostrador: resumen del
 * período con comparativa contra el anterior, serie diaria, y el desglose
 * por sucursal, vendedor, medio de pago y producto.
 */
class GerenciaReportesVentasTest extends TestCase
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

    /** Harina granel a $400/kg de costo, Mostrador +50% (neto 600 / final 726/kg), 30 kg en Central. */
    private function armarHarinaConStock(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $listas = $this->admin()->getJson('/api/listas')->json('listas');
        $mostrador = collect($listas)->firstWhere('nombre', 'Mostrador');
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk()->json();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 30, 'sucursalId' => $this->central()->id])->assertOk();

        return [$p, $mostrador];
    }

    private function abrirCaja(): void
    {
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();
    }

    private function hoyIso(): string
    {
        return now()->setTimezone('America/Argentina/Buenos_Aires')->format('Y-m-d');
    }

    public function test_reportes_ventas_trae_resumen_por_dia_sucursal_vendedor_medio_y_top_productos(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $this->abrirCaja();

        // Ticket de contado, 1 kg = $726, en efectivo.
        $v1 = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->admin()->postJson('/api/ventas/'.$v1['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 726]]])->assertOk();

        // Factura, 2 kg = $1452, también en efectivo.
        $v2 = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->admin()->postJson('/api/ventas/'.$v2['id'].'/confirmar', ['tipo' => 'factura', 'pagos' => [['medio' => 'efectivo', 'importe' => 1452]]])->assertOk();

        $hoy = $this->hoyIso();
        $r = $this->admin()->getJson('/api/gerencia/reportes-ventas?desde='.$hoy.'&hasta='.$hoy)->assertOk()->json();

        $this->assertEqualsWithDelta(2178, $r['resumen']['ventaBruta'], 0.01);
        $this->assertEqualsWithDelta(2178, $r['resumen']['ventaNeta'], 0.01);
        $this->assertSame(2, $r['resumen']['tickets']);
        $this->assertEqualsWithDelta(1089, $r['resumen']['ticketPromedio'], 0.01);
        $this->assertSame(0, $r['resumen']['devoluciones']);

        // Sin datos el "período anterior" (mismo largo, un día, pegado antes): la variación no se puede calcular.
        $this->assertEqualsWithDelta(0, $r['anterior']['ventaNeta'], 0.01);
        $this->assertNull($r['variacionVentaPct']);

        $this->assertCount(1, $r['porDia']);
        $this->assertSame($hoy, $r['porDia'][0]['fecha']);
        $this->assertEqualsWithDelta(2178, $r['porDia'][0]['ventaNeta'], 0.01);

        $central = collect($r['porSucursal'])->firstWhere('sucursalId', $this->central()->id);
        $this->assertNotNull($central);
        $this->assertEqualsWithDelta(2178, $central['ventaNeta'], 0.01);
        $this->assertSame(2, $central['tickets']);

        $vendedor = collect($r['porVendedor'])->first();
        $this->assertSame('Administrador', $vendedor['usuario']);
        $this->assertEqualsWithDelta(2178, $vendedor['ventaNeta'], 0.01);

        $efectivo = collect($r['porMedioPago'])->firstWhere('medio', 'efectivo');
        $this->assertNotNull($efectivo);
        $this->assertEqualsWithDelta(2178, $efectivo['importe'], 0.01);
        $this->assertEqualsWithDelta(100, $efectivo['participacionPct'], 0.01);

        $top = collect($r['topProductos'])->firstWhere('productoId', $p['id']);
        $this->assertNotNull($top);
        $this->assertEqualsWithDelta(3, $top['unidades'], 0.01);
        $this->assertEqualsWithDelta(1800, $top['ventaNeta'], 0.01); // neto sin IVA: 500 + 1000
    }

    public function test_una_nota_de_credito_resta_del_resumen_pero_no_borra_el_ticket(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $this->abrirCaja();

        $v = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 4, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $f = $this->admin()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'factura', 'pagos' => [['medio' => 'efectivo', 'importe' => 2904]]])->assertOk()->json();
        $this->admin()->postJson('/api/ventas/'.$f['id'].'/nota-credito', ['motivo' => 'Venía húmeda', 'items' => [['itemId' => $f['items'][0]['id'], 'cantidad' => 1]], 'devolverEfectivo' => true])->assertCreated();

        $hoy = $this->hoyIso();
        $r = $this->admin()->getJson('/api/gerencia/reportes-ventas?desde='.$hoy.'&hasta='.$hoy)->assertOk()->json();

        // La factura entera sigue contando como bruto; la nota de crédito la resta al neto.
        $this->assertEqualsWithDelta(2904, $r['resumen']['ventaBruta'], 0.01);
        $this->assertEqualsWithDelta(726, $r['resumen']['devuelto'], 0.01);
        $this->assertEqualsWithDelta(2904 - 726, $r['resumen']['ventaNeta'], 0.01);
        // El ticket original cuenta 1 vez; la nota de crédito no es "otro ticket".
        $this->assertSame(1, $r['resumen']['tickets']);
        $this->assertSame(1, $r['resumen']['devoluciones']);

        $top = collect($r['topProductos'])->firstWhere('productoId', $p['id']);
        $this->assertEqualsWithDelta(3, $top['unidades'], 0.01);
    }

    public function test_cuenta_corriente_aparece_como_su_propio_medio_de_pago(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Almacén Norte', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222', 'ctaCteHabilitada' => true, 'limiteCredito' => 5000, 'diasPlazo' => 15])->assertCreated()->json();
        $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'condicionPago' => 'cuenta_corriente', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id']]]])->assertCreated();

        $hoy = $this->hoyIso();
        $r = $this->admin()->getJson('/api/gerencia/reportes-ventas?desde='.$hoy.'&hasta='.$hoy)->assertOk()->json();

        $this->assertSame(1, $r['resumen']['tickets']);
        $ctaCte = collect($r['porMedioPago'])->firstWhere('medio', 'cuenta_corriente');
        $this->assertNotNull($ctaCte);
        $this->assertEqualsWithDelta(1452, $ctaCte['importe'], 0.01);
    }

    public function test_gerencia_reportes_ventas_requiere_su_permiso(): void
    {
        $this->cajero()->getJson('/api/gerencia/reportes-ventas')->assertStatus(403);
    }
}
