<?php

namespace Tests\Feature;

/**
 * Un producto DISCONTINUADO (se dejó de comprar, se vende hasta agotar) no entra por una factura de compra, pero SÍ admite
 * una nota de crédito: devolverle al proveedor lo que quedó es justo el caso típico de la baja.
 */
class ComprobantesReglasTest extends PruebaDeComprasBase
{
    private function discontinuadoConCompra(): array
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $suc = $this->central()->id;
        $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'C', 'numero' => 1, 'proveedorId' => $prov['id'], 'sucursalId' => $suc, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 10, 'costoUnitario' => 100, 'iva' => 0]],
        ])->assertCreated();
        $this->admin()->postJson('/api/productos/'.$prod['id'].'/estado', ['estado' => 'discontinuado', 'motivo' => 'baja'])->assertOk();

        return [$prov, $prod, $suc];
    }

    public function test_una_nota_de_credito_por_un_producto_discontinuado_se_puede_cargar(): void
    {
        [$prov, $prod, $suc] = $this->discontinuadoConCompra();

        $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'nota_credito', 'letra' => 'C', 'numero' => 2, 'proveedorId' => $prov['id'], 'sucursalId' => $suc, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 4, 'costoUnitario' => 100, 'iva' => 0]],
        ])->assertCreated();
        $this->assertEquals(6.0, $this->stockDisponible($prod['id']), 'la devolución sacó 4 de las 10 unidades');
    }

    public function test_una_factura_de_un_producto_discontinuado_sigue_rechazada(): void
    {
        [$prov, $prod, $suc] = $this->discontinuadoConCompra();

        $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'C', 'numero' => 3, 'proveedorId' => $prov['id'], 'sucursalId' => $suc, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 4, 'costoUnitario' => 100, 'iva' => 0]],
        ])->assertStatus(400)->assertJsonPath('message', fn ($m) => str_contains($m, 'ya no se compran'));
    }
}
