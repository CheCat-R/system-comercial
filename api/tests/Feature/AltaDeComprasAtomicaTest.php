<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;

/**
 * "Cargar y pagar en el mismo acto" es todo o nada, y reenviar el mismo formulario no duplica.
 * Antes el pago se intentaba DESPUÉS de confirmar el comprobante: si fallaba, la respuesta era un error pero la factura
 * ya existía y la mercadería ya había entrado al stock; el reintento (o el doble clic) la cargaba otra vez.
 */
class AltaDeComprasAtomicaTest extends PruebaDeComprasBase
{
    public function test_si_el_pago_de_la_factura_falla_no_queda_cargada_ni_con_stock(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);

        $res = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'C', 'proveedorId' => $prov['id'], 'sucursalId' => $this->central()->id, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 24, 'costoUnitario' => 1000, 'iva' => 0]],
            'pagoContado' => ['importe' => 24000, 'medio' => 'efectivo', 'cajaSesionId' => 99999],   // turno inexistente
        ]);

        $this->assertGreaterThanOrEqual(400, $res->status());
        $this->assertSame(0, DB::table('comprobantes')->count(), 'la factura no quedó cargada');
        $this->assertEquals(0.0, $this->stockDisponible($prod['id']), 'la mercadería no entró al stock');
    }

    public function test_si_el_pago_inmediato_del_gasto_falla_el_gasto_no_queda_cargado(): void
    {
        $cat = $this->admin()->getJson('/api/gastos/categorias')->assertOk()->json('0');
        $res = $this->admin()->postJson('/api/gastos', [
            'categoriaId' => $cat['id'], 'tipoDoc' => 'ticket', 'descripcion' => 'Librería', 'neto' => 1000,
            'pagoInmediato' => ['importe' => 5000, 'medio' => 'transferencia'],   // paga 5.000 un gasto de 1.000
        ]);

        $this->assertGreaterThanOrEqual(400, $res->status());
        $this->assertSame(0, DB::table('gastos')->count(), 'el gasto no quedó cargado');
    }

    public function test_reenviar_el_mismo_formulario_no_duplica_el_comprobante_ni_el_stock(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $dto = [
            'claveIdempotencia' => 'form-abc-123',
            'tipo' => 'remito', 'letra' => 'X', 'proveedorId' => $prov['id'], 'sucursalId' => $this->central()->id, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 24, 'costoUnitario' => 1000, 'iva' => 0]],
        ];

        $primero = $this->admin()->postJson('/api/comprobantes', $dto)->assertCreated()->json();
        $segundo = $this->admin()->postJson('/api/comprobantes', $dto)->assertSuccessful()->json();

        $this->assertSame($primero['id'], $segundo['id'], 'el segundo envío devuelve el mismo comprobante');
        $this->assertSame(1, DB::table('comprobantes')->count());
        $this->assertEquals(24.0, $this->stockDisponible($prod['id']), 'la mercadería entró una sola vez');
    }

    public function test_dos_remitos_iguales_sin_clave_siguen_siendo_dos_entregas(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $dto = [
            'tipo' => 'remito', 'letra' => 'X', 'proveedorId' => $prov['id'], 'sucursalId' => $this->central()->id, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 24, 'costoUnitario' => 1000, 'iva' => 0]],
        ];

        $this->admin()->postJson('/api/comprobantes', $dto)->assertCreated();
        $this->admin()->postJson('/api/comprobantes', $dto)->assertCreated();

        $this->assertEquals(48.0, $this->stockDisponible($prod['id']), 'sin clave no se adivina: puede ser otra entrega legítima');
    }

    public function test_reenviar_el_mismo_gasto_no_lo_duplica(): void
    {
        $cat = $this->admin()->getJson('/api/gastos/categorias')->assertOk()->json('0');
        $dto = ['claveIdempotencia' => 'gasto-xyz', 'categoriaId' => $cat['id'], 'tipoDoc' => 'ticket', 'descripcion' => 'Librería', 'neto' => 1000];

        $a = $this->admin()->postJson('/api/gastos', $dto)->assertCreated()->json();
        $b = $this->admin()->postJson('/api/gastos', $dto)->assertSuccessful()->json();

        $this->assertSame($a['id'], $b['id']);
        $this->assertSame(1, DB::table('gastos')->count());
    }
}
