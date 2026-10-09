<?php

namespace Tests\Feature;

/**
 * Un gasto cargado como "Nota de crédito" sumaba en vez de restar: se guardaba con importe positivo y todos los totales
 * (resumen, cuentas a pagar, estado de cuenta del proveedor) lo trataban como un gasto más. Hasta que reste de verdad,
 * no se carga de esa forma (ni se cambia un gasto existente a ese tipo).
 */
class GastoNotaCreditoTest extends PruebaDeComprasBase
{
    public function test_una_nota_de_credito_no_se_carga_como_gasto_y_no_altera_los_totales(): void
    {
        $cat = $this->admin()->getJson('/api/gastos/categorias')->assertOk()->json('0');
        $luz = $this->admin()->postJson('/api/gastos', ['categoriaId' => $cat['id'], 'tipoDoc' => 'factura', 'letra' => 'B', 'descripcion' => 'Luz', 'neto' => 10000, 'condicionPago' => 'cuenta_corriente'])->assertCreated()->json();

        $this->admin()->postJson('/api/gastos', ['categoriaId' => $cat['id'], 'tipoDoc' => 'nota_credito', 'letra' => 'B', 'descripcion' => 'NC luz', 'neto' => 1000, 'condicionPago' => 'cuenta_corriente'])
            ->assertStatus(400)->assertJsonPath('message', fn ($m) => str_contains($m, 'Una nota de crédito no se carga como gasto'));
        $this->admin()->patchJson('/api/gastos/'.$luz['id'], ['tipoDoc' => 'nota_credito'])->assertStatus(400);

        $this->assertEquals(10000.0, (float) $this->admin()->getJson('/api/gastos/resumen')->assertOk()->json('total'), 'lo gastado sigue siendo el de la factura');
    }
}
