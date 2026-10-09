<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Detalles de Compras que cerraban mal:
 *  · un compromiso o un echeq no se paga dos veces si llegan dos pedidos juntos (comparten un candado);
 *  · la fecha de recepción de un pedido al proveedor no se pisa ni queda de más al volver atrás;
 *  · un costo masivo no acepta descuentos mayores a 100 %.
 */
class ComprasDetallesTest extends PruebaDeComprasBase
{
    public function test_un_compromiso_no_se_paga_si_ya_hay_otro_pago_en_curso(): void
    {
        config(['checat.candado_espera' => 1]);   // en el test no se espera 30 s a que se libere
        [$prov, $prod] = $this->armarProveedorConProducto(['condicionIva' => 'monotributo'], 0);
        $f = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'C', 'numero' => 1, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => 10, 'costoUnitario' => 100, 'iva' => 0]],
            'compromisos' => [['importe' => 1000, 'fechaVenc' => now()->addDays(10)->toDateString()]],
        ])->assertCreated()->json();
        $k = DB::table('proveedor_compromisos')->where('comprobante_id', $f['id'])->first();
        $this->assertNotNull($k, 'precondición: la factura generó su compromiso');

        $otro = Cache::lock('compromiso:'.$k->id, 30);
        $this->assertTrue($otro->get());
        try {
            $this->admin()->postJson('/api/compromisos/'.$k->id.'/pagar', ['medio' => 'transferencia'])->assertStatus(400)
                ->assertJsonPath('message', fn ($m) => str_contains($m, 'otra operación en curso'));
        } finally {
            $otro->release();
        }

        $this->admin()->postJson('/api/compromisos/'.$k->id.'/pagar', ['medio' => 'transferencia'])->assertSuccessful();
        $this->admin()->postJson('/api/compromisos/'.$k->id.'/pagar', ['medio' => 'transferencia'])->assertStatus(400);   // ya pagado
        $this->assertSame(1, DB::table('proveedor_pagos')->where('proveedor_id', $prov['id'])->count(), 'se pagó una sola vez');
    }

    public function test_la_fecha_de_recepcion_de_un_pedido_no_se_pisa_y_se_limpia_al_volver_atras(): void
    {
        [$prov] = $this->armarProveedorConProducto();
        $id = $this->admin()->postJson('/api/pedidos-proveedor/directo', ['proveedorId' => $prov['id']])->assertSuccessful()->json('id');

        $this->admin()->patchJson('/api/pedidos-proveedor/'.$id.'/estado', ['estado' => 'recibido'])->assertOk();
        $recibido = DB::table('pedidos_proveedor')->where('id', $id)->value('fecha_recepcion');
        $this->assertNotNull($recibido);

        $this->admin()->patchJson('/api/pedidos-proveedor/'.$id.'/estado', ['estado' => 'retomar'])->assertOk();
        $this->assertNull(DB::table('pedidos_proveedor')->where('id', $id)->value('fecha_recepcion'), 'al volver atrás ya no figura como recibido');
    }

    public function test_un_costo_masivo_no_acepta_un_descuento_mayor_a_100(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        $fid = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('formatosCompra.0.id');

        $this->admin()->postJson('/api/precios/costos', ['cambios' => [['id' => $fid, 'costo' => 12000, 'descuento' => 150]], 'origen' => 'manual', 'motivo' => 'prueba'])->assertOk();

        $this->assertLessThanOrEqual(100.0, (float) DB::table('producto_proveedores')->where('id', $fid)->value('descuento'));
        $this->assertGreaterThanOrEqual(0.0, (float) $this->admin()->getJson('/api/productos/'.$prod['id'])->json('costoNeto'));
    }
}
