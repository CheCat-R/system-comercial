<?php

namespace Tests\Feature;


use Illuminate\Support\Facades\DB;

/**
 * "Deshacer" el lote de costos de una factura deja el costo unitario mal.
 * La factura puede actualizar el costo Y el tamaño del bulto (`actualizarCostos[].cantidad`, ComprobantesService::aplicarCostos
 * líneas 399-401, que escribe `producto_proveedores.cantidad` por fuera del historial). `revertirLote()` solo restaura
 * costo/descuento/flete: el bulto queda en el valor nuevo con el costo viejo, y el costo neto unitario (costo ÷ cantidad)
 * pasa a ser cualquier cosa.
 */
class RevertirLoteTest extends PruebaDeComprasBase
{
    public function test_revertir_el_lote_de_una_factura_devuelve_el_costo_unitario_original(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $this->assertEqualsWithDelta(1000.0, $prod['costoNeto'], 0.0001, 'precondición: caja x12 a 12.000 = 1.000 la unidad');

        // Llega una caja nueva de 24 a $26.000 (1.083,33 la unidad) y el usuario acepta actualizar costo y bulto.
        $f = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'C', 'numero' => 501, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => 24, 'costoUnitario' => 1083.3333, 'iva' => 0]],
            'actualizarCostos' => [['productoId' => $prod['id'], 'costo' => 26000, 'cantidad' => 24]],
        ])->assertCreated()->json();
        $lote = DB::table('producto_proveedor_costos')->where('comprobante_id', $f['id'])->value('lote');
        $this->assertNotEmpty($lote);
        $nuevo = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('costoNeto');
        $this->assertEqualsWithDelta(26000 / 24, $nuevo, 0.01);

        // Se arrepiente: deshace el lote.
        $this->admin()->postJson('/api/precios/revertir/'.$lote)->assertOk()->assertJsonPath('revertidos', 1);

        $costoUnitario = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('costoNeto');
        $this->assertEqualsWithDelta(1000.0, $costoUnitario, 0.01,
            'Tras deshacer el lote el costo debería volver a $1.000 la unidad (12.000 ÷ 12); quedó en '.$costoUnitario.' porque la cantidad del bulto sigue en 24.');
    }
}
