<?php

namespace Tests\Feature;

/**
 * Borrar y dar de baja un proveedor.
 *  · Borrar es solo para uno cargado de más: sin historia (facturas, pagos…) y sin productos. Antes, con historia daba
 *    500, y sin historia el cascade se llevaba el costo de los productos que solo él vendía (precio $0).
 *  · Dar de baja lo saca de las compras nuevas pero conserva su historia. Si es el proveedor ACTIVO (el que fija el
 *    precio) de un producto que tiene otro, primero hay que activar el otro. Los productos que solo él vendía se
 *    pueden dar de baja con él.
 */
class ProveedorBajaTest extends PruebaDeComprasBase
{
    private function conOtroProveedor(array $prod, array $viejo, bool $elNuevoEsElActivo = false): array
    {
        $nuevo = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Mayorista Sur', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $actual = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('formatosCompra.0');
        $this->admin()->putJson('/api/productos/'.$prod['id'].'/formatos-compra', ['items' => [
            ['id' => $actual['id'], 'proveedorId' => $viejo['id'], 'cantidad' => 12, 'costo' => 12000, 'usarParaPrecio' => ! $elNuevoEsElActivo],
            ['proveedorId' => $nuevo['id'], 'cantidad' => 12, 'costo' => 13000, 'usarParaPrecio' => $elNuevoEsElActivo],
        ]])->assertOk();

        return $nuevo;
    }

    public function test_borrar_un_proveedor_con_facturas_se_rechaza_con_el_motivo(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'A', 'numero' => 10, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 1000]],
        ])->assertCreated();

        $this->admin()->deleteJson('/api/proveedores/'.$prov['id'])->assertStatus(400)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'tiene historia') && str_contains($m, 'Dalo de baja'));
    }

    public function test_borrar_el_unico_proveedor_de_un_producto_no_le_borra_el_costo(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        $lista = $this->admin()->getJson('/api/listas')->assertOk()->json('listas.0');
        $this->admin()->putJson('/api/productos/'.$prod['id'].'/listas', ['items' => [['listaId' => $lista['id'], 'modoPrecio' => 'markup', 'markup' => 50, 'unidades' => 1]]])->assertOk();
        $antes = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('precio');
        $this->assertGreaterThan(0, $antes);

        $this->admin()->deleteJson('/api/proveedores/'.$prov['id'])->assertStatus(400);

        $this->assertEquals($antes, $this->admin()->getJson('/api/productos/'.$prod['id'])->json('precio'), 'el precio del producto no cambió');
    }

    public function test_un_proveedor_cargado_de_mas_se_borra(): void
    {
        $p = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Duplicado SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();

        $this->admin()->deleteJson('/api/proveedores/'.$p['id'])->assertOk();
        $this->admin()->getJson('/api/proveedores/'.$p['id'])->assertNotFound();
    }

    public function test_la_previa_cuenta_la_historia_y_parte_los_productos(): void
    {
        [$viejo, $prod] = $this->armarProveedorConProducto();
        $this->conOtroProveedor($prod, $viejo);   // el viejo sigue siendo el activo

        $previa = $this->admin()->getJson('/api/proveedores/'.$viejo['id'].'/previa-de-baja')->assertOk()->json();
        $this->assertFalse($previa['puedeBorrarse']);
        $this->assertCount(1, $previa['productos']['conAlternativa']);
        $this->assertSame([], $previa['productos']['soloEste']);
    }

    public function test_no_se_da_de_baja_al_proveedor_activo_de_un_producto_que_tiene_otro(): void
    {
        [$viejo, $prod] = $this->armarProveedorConProducto();
        $this->conOtroProveedor($prod, $viejo);

        $this->admin()->postJson('/api/proveedores/'.$viejo['id'].'/baja', [])->assertStatus(400)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'activá otro proveedor') && str_contains($m, 'Aceite 900ml'));
        $this->assertTrue($this->admin()->getJson('/api/proveedores/'.$viejo['id'])->json('activo'));
    }

    public function test_se_da_de_baja_si_otro_proveedor_ya_es_el_activo(): void
    {
        [$viejo, $prod] = $this->armarProveedorConProducto();
        $this->conOtroProveedor($prod, $viejo, true);

        $r = $this->admin()->postJson('/api/proveedores/'.$viejo['id'].'/baja', ['motivo' => 'Cerró'])->assertOk()->json();
        $this->assertFalse($r['activo']);
        $this->assertSame('Cerró', $r['motivoBaja']);
        $this->assertSame('activo', $this->admin()->getJson('/api/productos/'.$prod['id'])->json('estado'), 'el producto sigue activo: lo vende el otro proveedor');
    }

    public function test_los_productos_que_solo_vendia_se_pueden_dar_de_baja_con_el_o_dejarse(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        $this->admin()->postJson('/api/proveedores/'.$prov['id'].'/baja', [])->assertOk();
        $this->assertSame('activo', $this->admin()->getJson('/api/productos/'.$prod['id'])->json('estado'), 'sin pedirlo, el producto queda como estaba');

        $this->admin()->postJson('/api/proveedores/'.$prov['id'].'/reactivar')->assertOk()->assertJsonPath('activo', true);
        $this->admin()->postJson('/api/proveedores/'.$prov['id'].'/baja', ['discontinuarProductos' => true])->assertOk();
        $this->assertSame('discontinuado', $this->admin()->getJson('/api/productos/'.$prod['id'])->json('estado'));
    }

    public function test_un_proveedor_dado_de_baja_conserva_su_historia(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        $f = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'A', 'numero' => 11, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 1000]],
        ])->assertCreated()->json();
        $this->admin()->postJson('/api/proveedores/'.$prov['id'].'/baja', [])->assertOk();

        $this->admin()->getJson('/api/comprobantes/'.$f['id'])->assertOk();
        $this->admin()->getJson('/api/proveedores/'.$prov['id'])->assertOk()->assertJsonPath('activo', false);
        $this->admin()->postJson('/api/proveedores/'.$prov['id'].'/baja', [])->assertStatus(400);   // ya estaba dado de baja
    }
}
