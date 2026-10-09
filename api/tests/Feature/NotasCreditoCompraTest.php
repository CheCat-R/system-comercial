<?php

namespace Tests\Feature;

/**
 * Notas de crédito de compra y numeración de comprobantes.
 *  · Una nota no acredita más que lo que queda por acreditar de la factura que ajusta.
 *  · Un borrador de nota se revalida al confirmarlo: la factura pudo anularse o agotarse mientras tanto.
 *  · Un comprobante anulado libera su número: es la única forma de corregir un papel mal cargado.
 */
class NotasCreditoCompraTest extends PruebaDeComprasBase
{
    private function factura(array $prov, array $prod, int $numero, float $cantidad = 10): array
    {
        return $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'C', 'numero' => $numero, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => $cantidad, 'costoUnitario' => 100, 'iva' => 0]],
        ])->assertCreated()->json();
    }

    private function nota(array $prov, array $prod, array $factura, int $numero, float $cantidad, string $estado = 'confirmado'): \Illuminate\Testing\TestResponse
    {
        return $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'nota_credito', 'letra' => 'C', 'numero' => $numero, 'proveedorId' => $prov['id'], 'refComprobanteId' => $factura['id'], 'estado' => $estado,
            'items' => [['productoId' => $prod['id'], 'cantidad' => $cantidad, 'costoUnitario' => 100, 'iva' => 0]],
        ]);
    }

    public function test_una_nota_de_credito_no_puede_superar_la_factura_que_ajusta(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $f = $this->factura($prov, $prod, 1);   // total $1.000

        $this->nota($prov, $prod, $f, 2, 15)->assertStatus(400)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'quedan $1000.00 por acreditar'));
        $this->assertEquals(1000.0, $this->admin()->getJson('/api/comprobantes/cuenta/'.$prov['id'])->json('saldo'), 'sin la nota, la cuenta sigue debiendo $1.000');
    }

    public function test_las_notas_se_acumulan_contra_el_total_de_la_factura(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $f = $this->factura($prov, $prod, 1);   // $1.000

        $this->nota($prov, $prod, $f, 2, 6)->assertCreated();                                  // $600
        $this->nota($prov, $prod, $f, 3, 5)->assertStatus(400);                                // $500 > $400 que quedan
        $this->nota($prov, $prod, $f, 4, 4)->assertCreated();                                  // justo $400
    }

    public function test_confirmar_una_nota_en_borrador_cuya_factura_se_anulo_se_rechaza(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $f = $this->factura($prov, $prod, 1);
        $nc = $this->nota($prov, $prod, $f, 2, 4, 'borrador')->assertCreated()->json();

        $this->admin()->postJson('/api/comprobantes/'.$f['id'].'/anular', ['motivo' => 'cargada por error'])->assertOk();

        $this->admin()->postJson('/api/comprobantes/'.$nc['id'].'/confirmar')->assertStatus(400)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'no se puede confirmar'));
        $this->assertEquals(0.0, $this->admin()->getJson('/api/comprobantes/cuenta/'.$prov['id'])->json('saldo'), 'el proveedor no quedó con deuda negativa');
    }

    public function test_confirmar_un_borrador_que_ya_no_entra_en_lo_que_queda_se_rechaza(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $f = $this->factura($prov, $prod, 1);   // $1.000
        $borrador = $this->nota($prov, $prod, $f, 2, 6, 'borrador')->assertCreated()->json();   // $600 en borrador
        $this->nota($prov, $prod, $f, 3, 6)->assertCreated();                                    // otra de $600 confirmada

        $this->admin()->postJson('/api/comprobantes/'.$borrador['id'].'/confirmar')->assertStatus(400);
    }

    public function test_una_factura_anulada_libera_su_numero_para_cargarla_bien(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $dto = fn (float $cant) => [
            'tipo' => 'factura', 'letra' => 'C', 'puntoVenta' => '3', 'numero' => 77, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => $cant, 'costoUnitario' => 100, 'iva' => 0]],
        ];
        $mal = $this->admin()->postJson('/api/comprobantes', $dto(12))->assertCreated()->json();   // cantidad equivocada
        $this->admin()->postJson('/api/comprobantes/'.$mal['id'].'/anular', ['motivo' => 'cantidad mal'])->assertOk()
            ->assertJsonPath('observaciones', fn ($o) => str_contains($o, 'era Factura C 00003-00000077'));

        $this->admin()->postJson('/api/comprobantes', $dto(10))->assertCreated();
        // Y el duplicado de verdad sigue frenado.
        $this->admin()->postJson('/api/comprobantes', $dto(10))->assertStatus(400)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'ya tiene cargada'));
    }
}
