<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Tests\TestCase;

/**
 * F4 · GERENCIA — Rentabilidad: el margen real contra el aparente, con la
 * diferencia (el IVA absorbido) explicada, y el control de lo declarado
 * sin factura contra lo real comprado en el período.
 */
class GerenciaF4Test extends TestCase
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

    /** Harina granel a $400/kg de costo, Mostrador +50% (neto 600 / final 726), 30 kg en Central. */
    private function armarHarinaConStock(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $listas = $this->admin()->getJson('/api/listas')->json('listas');
        $mostrador = collect($listas)->firstWhere('nombre', 'Mostrador');
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk()->json();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 30, 'sucursalId' => $this->central()->id])->assertOk();

        return [$p, $mostrador, $prov];
    }

    private function abrirCaja(): void
    {
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();
    }

    public function test_rentabilidad_calcula_margen_real_y_aparente_desde_el_costo_congelado(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $this->abrirCaja();

        // Cliente responsable inscripto: la factura genera débito fiscal; el ticket no.
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Panadería El Sol', 'tipoDoc' => 'cuit', 'numeroDoc' => '30-71234567-8', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();

        $vTicket = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $ticket = $this->admin()->postJson('/api/ventas/'.$vTicket['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 726]]])->assertOk()->json();

        $vFactura = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $factura = $this->admin()->postJson('/api/ventas/'.$vFactura['id'].'/confirmar', ['tipo' => 'factura', 'pagos' => [['medio' => 'efectivo', 'importe' => 1452]]])->assertOk()->json();
        $this->assertSame('factura_a', $factura['tipo']);

        $hoy = now()->setTimezone('America/Argentina/Buenos_Aires')->format('Y-m-d');
        $r = $this->admin()->getJson('/api/gerencia/rentabilidad?desde='.$hoy.'&hasta='.$hoy)->assertOk()->json();

        // 3 kg vendidos en total, todos con costo congelado a $400/kg.
        $this->assertSame(2, $r['cobertura']['renglones']);
        $this->assertSame(2, $r['cobertura']['conCosto']);
        $ventaNeta = round(600 * 1 + 600 * 2, 2);
        $this->assertEqualsWithDelta($ventaNeta, $r['totales']['ventaNeta'], 0.01);
        $this->assertEqualsWithDelta(400 * 3, $r['totales']['costoReal'], 0.01);
        $this->assertEqualsWithDelta($ventaNeta - 400 * 3, $r['totales']['margenReal'], 0.01);
        // Sin mercadería sin factura: margen real y aparente coinciden, IVA absorbido en 0.
        $this->assertEqualsWithDelta($r['totales']['margenReal'], $r['totales']['margenAparente'], 0.01);
        $this->assertEqualsWithDelta(0, $r['totales']['ivaAbsorbido'], 0.01);

        // Solo la factura genera débito fiscal — el ticket no discrimina IVA.
        $this->assertSame(1, $r['fiscal']['ventasFacturadas']);
        $this->assertEqualsWithDelta($factura['ivaTotal'], $r['fiscal']['debitoVentas'], 0.01);

        $fila = collect($r['porProducto'])->firstWhere('productoId', $p['id']);
        $this->assertNotNull($fila);
        $this->assertEqualsWithDelta(3, $fila['unidades'], 0.01);
        $this->assertFalse($fila['sinFactura']);
    }

    public function test_una_devolucion_resta_del_margen_del_periodo(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $this->abrirCaja();

        $v = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 4, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $f = $this->admin()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'factura', 'pagos' => [['medio' => 'efectivo', 'importe' => 2904]]])->assertOk()->json();
        $this->admin()->postJson('/api/ventas/'.$f['id'].'/nota-credito', ['motivo' => 'Venía húmeda', 'items' => [['itemId' => $f['items'][0]['id'], 'cantidad' => 1]], 'devolverEfectivo' => true])->assertCreated();

        $hoy = now()->setTimezone('America/Argentina/Buenos_Aires')->format('Y-m-d');
        $r = $this->admin()->getJson('/api/gerencia/rentabilidad?desde='.$hoy.'&hasta='.$hoy)->assertOk()->json();

        // 4 vendidos − 1 devuelto = 3 kg netos; ni la venta ni el costo cuentan doble.
        $fila = collect($r['porProducto'])->firstWhere('productoId', $p['id']);
        $this->assertEqualsWithDelta(3, $fila['unidades'], 0.01);
        $this->assertEqualsWithDelta(400 * 3, $fila['costo'], 0.01);
    }

    public function test_gerencia_rentabilidad_requiere_su_permiso(): void
    {
        $this->cajero()->getJson('/api/gerencia/rentabilidad')->assertStatus(403);
    }
}
