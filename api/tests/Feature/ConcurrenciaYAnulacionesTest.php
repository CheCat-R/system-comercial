<?php

namespace Tests\Feature;

use App\Inventario\ConteosService;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stock, conteos, confirmación de tickets, anulaciones y cobranzas cuando dos
 * cosas pasan a la vez o se pisan. Las carreras se simulan con `DB::listen`: el
 * listener corre DESPUÉS de la consulta indicada y en la misma conexión, que es
 * lo mismo que si otra request se colara justo ahí.
 */
class ConcurrenciaYAnulacionesTest extends TestCase
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

    /** Harina granel: Mostrador neto 600 / final 726, 20 kg en Central. */
    private function armarHarina(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $mostrador = collect($this->admin()->getJson('/api/listas')->json('listas'))->firstWhere('nombre', 'Mostrador');
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk()->json();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 20, 'sucursalId' => $this->central()->id])->assertOk();

        return [$p, $mostrador];
    }

    private function abrirCaja(): array
    {
        return $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated()->json();
    }

    private function stockDisponible(int $productoId): float
    {
        return (float) DB::table('stock')->where('producto_id', $productoId)->whereNull('presentacion_id')->where('estado', 'disponible')->sum('cantidad');
    }

    public function test_dos_ventas_del_ultimo_stock_no_lo_dejan_negativo(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $central = $this->central()->id;

        $hecho = false;
        DB::listen(function (QueryExecuted $q) use (&$hecho, $p, $central) {
            if (! $hecho && str_starts_with($q->sql, 'select * from `stock`') && in_array('disponible', $q->bindings, true)) {
                $hecho = true;
                // Otra caja vende 15 kg entre la lectura del disponible y el descuento de esta venta.
                DB::table('stock')->where('producto_id', $p['id'])->where('sucursal_id', $central)->whereNull('presentacion_id')
                    ->where('estado', 'disponible')->update(['cantidad' => DB::raw('cantidad - 15')]);
            }
        });

        // Quedan 5 kg: la venta de 10 tiene que rechazarse, no dejar -5.
        $this->cajero()->postJson('/api/ventas', ['items' => [['productoId' => $p['id'], 'cantidad' => 10, 'listaId' => $mostrador['id'], 'precioUnitario' => 600]],
            'pagos' => [['medio' => 'efectivo', 'importe' => 7260]]])->assertStatus(400);

        // (La venta de la otra caja que simula el test se deshace con la transacción de esta, por eso no se mira el 5.)
        $this->assertGreaterThanOrEqual(0.0, $this->stockDisponible($p['id']), 'el stock no puede quedar negativo');
        $this->assertSame(0, DB::table('ventas')->where('estado', 'confirmada')->count());
    }

    public function test_confirmar_un_ticket_que_se_edito_en_el_medio_se_rechaza(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600]]])->assertCreated()->json();
        $id = $v['id'];

        $hecho = false;
        DB::listen(function (QueryExecuted $q) use (&$hecho, $id) {
            if (! $hecho && str_starts_with($q->sql, 'select * from `ventas` where `id` = ?') && str_contains($q->sql, 'for update')) {
                $hecho = true;
                // Lo que deja un PUT /ventas/{id} que entró mientras se cobraba: 5 kg, $3.630.
                DB::table('venta_items')->where('venta_id', $id)->update(['cantidad' => 5, 'subtotal' => 3000]);
                DB::table('ventas')->where('id', $id)->update(['subtotal_neto' => 3000, 'iva_total' => 630, 'total' => 3630]);
            }
        });

        $r = $this->cajero()->postJson('/api/ventas/'.$id.'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 1452]]])->assertStatus(400);
        $this->assertStringContainsString('cambió mientras se cobraba', $r->json('message'));

        // Nada quedó a medias: sigue siendo un borrador, sin pagos y con el stock intacto.
        $this->assertSame('borrador', DB::table('ventas')->find($id)->estado);
        $this->assertSame(0, DB::table('venta_pagos')->where('venta_id', $id)->count());
        $this->assertEquals(20.0, $this->stockDisponible($p['id']));
    }

    public function test_confirmar_un_ticket_sin_cambios_sigue_funcionando(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600]]])->assertCreated()->json();

        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['redondeo' => 8, 'pagos' => [['medio' => 'efectivo', 'importe' => 1460]]])->assertOk();

        $this->assertSame('confirmada', DB::table('ventas')->find($v['id'])->estado);
        $this->assertEquals(18.0, $this->stockDisponible($p['id']));
    }

    public function test_aplicar_un_conteo_dos_veces_a_la_vez_lo_aplica_una_sola(): void
    {
        [$p] = $this->armarHarina();
        $svc = app(ConteosService::class);
        $c = $svc->crear(['sucursalId' => $this->central()->id, 'tipo' => 'granel', 'usuarioId' => $this->superadmin()->id]);
        $item = DB::table('conteo_items')->where('conteo_id', $c['id'])->where('producto_id', $p['id'])->whereNull('presentacion_id')->first();
        $svc->contarItem($c['id'], $item->id, ['contado' => 18]); // el sistema dice 20, hay 18 → ajuste −2
        $svc->cerrar($c['id']);

        $segundo = null;
        $hecho = false;
        DB::listen(function (QueryExecuted $q) use (&$hecho, &$segundo, $svc, $c) {
            if (! $hecho && str_starts_with($q->sql, 'select * from `conteo_items` where `conteo_id` = ? and `contado` is not null')) {
                $hecho = true;
                try {
                    $svc->aplicar($c['id']);   // el otro clic llega justo ahora
                } catch (\Throwable $e) {
                    $segundo = $e->getMessage();
                }
            }
        });
        $svc->aplicar($c['id']);

        $this->assertStringContainsString('ya se aplicó', (string) $segundo);
        $this->assertEquals(18.0, $this->stockDisponible($p['id']), 'el ajuste se aplicó una sola vez');
        $this->assertSame(1, DB::table('movimientos')->where('ref_conteo_id', $c['id'])->count());
    }

    public function test_una_factura_con_nota_de_credito_no_se_anula(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Panadería Sur', 'tipoDoc' => 'cuit', 'numeroDoc' => '30712345678', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $this->abrirCaja();
        $v = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 4, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $f = $this->admin()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'factura', 'pagos' => [['medio' => 'efectivo', 'importe' => 2904]]])->assertOk()->json();
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/nota-credito', ['motivo' => 'Venía húmeda', 'items' => [['itemId' => $f['items'][0]['id'], 'cantidad' => 1]], 'devolverEfectivo' => true])->assertCreated();
        $this->assertEquals(17.0, $this->stockDisponible($p['id']));

        $r = $this->admin()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => 'Se cayó la venta'])->assertStatus(400);

        $this->assertStringContainsString('notas de crédito', $r->json('message'));
        $this->assertEquals(17.0, $this->stockDisponible($p['id']), 'el stock no se reingresa dos veces');
        $this->assertSame('confirmada', DB::table('ventas')->find($v['id'])->estado);
    }

    public function test_una_venta_sin_notas_de_credito_se_sigue_anulando(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $v = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 1452]]])->assertOk();

        $this->admin()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => 'Se equivocó el cajero'])->assertOk();

        $this->assertEquals(20.0, $this->stockDisponible($p['id']));
    }

    public function test_no_se_cobra_un_comprobante_que_se_pago_al_contado(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Almacén Norte', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222', 'ctaCteHabilitada' => true])->assertCreated()->json();
        $v = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]],
            'pagos' => [['medio' => 'efectivo', 'importe' => 726]]])->assertCreated()->json();

        $r = $this->admin()->postJson('/api/cobranzas', ['clienteId' => $cli['id'], 'pagos' => [['medio' => 'efectivo', 'importe' => 726]], 'imputaciones' => [['ventaId' => $v['id'], 'importe' => 726]]])->assertStatus(400);
        $this->assertStringContainsString('al contado', $r->json('message'));

        // En cuenta corriente sí se cobra.
        $cc = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'condicionPago' => 'cuenta_corriente', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->admin()->postJson('/api/cobranzas', ['clienteId' => $cli['id'], 'pagos' => [['medio' => 'efectivo', 'importe' => 726]], 'imputaciones' => [['ventaId' => $cc['id'], 'importe' => 726]]])->assertCreated();
    }

    public function test_los_movimientos_por_dia_cortan_en_hora_argentina(): void
    {
        [$p] = $this->armarHarina();
        // 5/10 a las 22:30 en Argentina = 6/10 01:30 en UTC.
        DB::table('movimientos')->insert(['fecha' => '2026-10-06 01:30:00', 'tipo' => 'merma', 'producto_id' => $p['id'], 'sucursal_id' => $this->central()->id, 'signo' => -1, 'cantidad' => 1, 'unidad' => 'kg', 'descripcion' => 'Merma de la noche del 5']);
        // 4/10 a las 22:00 en Argentina = 5/10 01:00 en UTC (NO es del día 5).
        DB::table('movimientos')->insert(['fecha' => '2026-10-05 01:00:00', 'tipo' => 'merma', 'producto_id' => $p['id'], 'sucursal_id' => $this->central()->id, 'signo' => -1, 'cantidad' => 1, 'unidad' => 'kg', 'descripcion' => 'Merma de la noche del 4']);

        $movs = collect($this->admin()->getJson('/api/movimientos?desde=2026-10-05&hasta=2026-10-05&limit=1000')->assertOk()->json());

        $this->assertTrue($movs->contains('descripcion', 'Merma de la noche del 5'), 'el movimiento del 5/10 22:30 tiene que aparecer en el día 5');
        $this->assertFalse($movs->contains('descripcion', 'Merma de la noche del 4'), 'el del 4/10 22:00 no es del día 5');
    }
}
