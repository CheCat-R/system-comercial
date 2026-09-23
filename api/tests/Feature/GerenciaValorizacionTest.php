<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GERENCIA › VALORIZACIÓN DE STOCK — cuánta plata hay parada en mercadería,
 * al costo de HOY (no al congelado de una venta pasada), por sucursal y por
 * estado — incluido lo trabado en vencido/defectuoso, que sigue siendo plata.
 */
class GerenciaValorizacionTest extends TestCase
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

    public function test_valorizacion_suma_stock_por_sucursal_y_estado_al_costo_de_hoy(): void
    {
        // Harina a $400/kg de costo (25 kg por $10.000), 30 kg en Central vía devolución.
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 30, 'sucursalId' => $this->central()->id])->assertOk();

        // Otros 5 kg quedaron vencidos: plata trabada, no vendible, pero plata al fin.
        DB::table('stock')->insert([
            'producto_id' => $p['id'], 'sucursal_id' => $this->central()->id, 'presentacion_id' => null,
            'estado' => 'vencido', 'cantidad' => 5,
        ]);

        $r = $this->admin()->getJson('/api/gerencia/valorizacion')->assertOk()->json();

        $this->assertEqualsWithDelta(400 * 35, $r['total']['valor'], 0.01);
        $this->assertSame(1, $r['total']['productos']);

        $central = collect($r['porSucursal'])->firstWhere('sucursalId', $this->central()->id);
        $this->assertEqualsWithDelta(400 * 35, $central['valor'], 0.01);

        $disponible = collect($r['porEstado'])->firstWhere('estado', 'disponible');
        $vencido = collect($r['porEstado'])->firstWhere('estado', 'vencido');
        $this->assertEqualsWithDelta(400 * 30, $disponible['valor'], 0.01);
        $this->assertEqualsWithDelta(400 * 5, $vencido['valor'], 0.01);

        $fila = collect($r['porProducto'])->firstWhere('productoId', $p['id']);
        $this->assertEqualsWithDelta(35, $fila['unidades'], 0.01);
        $this->assertEqualsWithDelta(400, $fila['costoUnitario'], 0.01);
        $this->assertFalse($fila['sinCosto']);
        $this->assertSame('Molinos SA', $fila['proveedor']);
    }

    public function test_producto_con_stock_pero_sin_costo_activo_se_marca_sin_romper_el_total(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Sin Formato SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        // Producto creado SIN costoInicial: nace sin formato de compra activo.
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Sal Fina', 'esGranel' => false, 'iva' => 21, 'proveedorId' => $prov['id']])->assertCreated()->json();
        DB::table('stock')->insert([
            'producto_id' => $p['id'], 'sucursal_id' => $this->central()->id, 'presentacion_id' => null,
            'estado' => 'disponible', 'cantidad' => 10,
        ]);

        $r = $this->admin()->getJson('/api/gerencia/valorizacion')->assertOk()->json();

        $this->assertSame(1, $r['sinCosto']['productos']);
        $fila = collect($r['porProducto'])->firstWhere('productoId', $p['id']);
        $this->assertTrue($fila['sinCosto']);
        $this->assertEqualsWithDelta(0, $fila['valor'], 0.01);
    }

    public function test_filtra_por_sucursal_cuando_se_pide(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 10, 'sucursalId' => $this->central()->id])->assertOk();

        $otra = DB::table('sucursales')->where('id', '!=', $this->central()->id)->first();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 20, 'sucursalId' => $otra->id])->assertOk();

        $r = $this->admin()->getJson('/api/gerencia/valorizacion?sucursalId='.$this->central()->id)->assertOk()->json();

        $this->assertEqualsWithDelta(400 * 10, $r['total']['valor'], 0.01);
        $this->assertCount(1, $r['porSucursal']);
    }

    public function test_gerencia_valorizacion_requiere_su_permiso(): void
    {
        $this->cajero()->getJson('/api/gerencia/valorizacion')->assertStatus(403);
    }
}
