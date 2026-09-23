<?php

namespace Tests\Feature;

use App\Exceptions\ErrorDeNegocio;
use App\Inventario\ConteosService;
use App\Inventario\IncidenciasService;
use App\Inventario\OperacionesService;
use App\Inventario\TransferenciasService;
use App\Models\Presentacion;
use App\Models\Producto;
use App\Models\ProductoProveedor;
use App\Models\Proveedor;
use App\Models\Sucursal;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * El motor de inventario contra la base real: cada operación deja el stock y
 * el kardex como el CRM. Se prueba el flujo entero, no métodos sueltos.
 */
class InventarioTest extends TestCase
{
    private OperacionesService $ops;
    private TransferenciasService $tr;
    private IncidenciasService $inc;
    private ConteosService $conteos;
    private Sucursal $central;
    private Sucursal $express;
    private Producto $harina;
    private Presentacion $medioKg;
    private Producto $gaseosa;
    private int $uid;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->ops = app(OperacionesService::class);
        $this->tr = app(TransferenciasService::class);
        $this->inc = app(IncidenciasService::class);
        $this->conteos = app(ConteosService::class);
        $this->uid = $this->superadmin()->id;

        $this->central = $this->central();
        $this->express = Sucursal::query()->where('tipo', 'express')->firstOrFail();

        $molinos = Proveedor::query()->create(['nombre' => 'Molinos']);
        $this->harina = Producto::query()->create(['nombre' => 'Harina 000', 'tipo' => 'granel', 'iva' => 21]);
        $this->medioKg = Presentacion::query()->create(['producto_id' => $this->harina->id, 'tam_kg' => 0.5]);
        // Bolsa de 25 kg a $10.000 neto → $400/kg.
        ProductoProveedor::query()->create(['producto_id' => $this->harina->id, 'proveedor_id' => $molinos->id, 'cantidad' => 25, 'costo' => 10000, 'usar_para_precio' => true]);
        $this->gaseosa = Producto::query()->create(['nombre' => 'Gaseosa 1.5L', 'tipo' => 'entero', 'iva' => 21]);
        ProductoProveedor::query()->create(['producto_id' => $this->gaseosa->id, 'proveedor_id' => $molinos->id, 'cantidad' => 6, 'costo' => 6000, 'usar_para_precio' => true]);
    }

    private function stock(Producto $p, Sucursal $s, ?int $presId = null, string $estado = 'disponible'): float
    {
        return (float) (DB::table('stock')->where('producto_id', $p->id)->where('sucursal_id', $s->id)
            ->when($presId === null, fn ($q) => $q->whereNull('presentacion_id'), fn ($q) => $q->where('presentacion_id', $presId))
            ->where('estado', $estado)->value('cantidad') ?? 0);
    }

    public function test_compra_fraccionar_y_corregir(): void
    {
        $this->ops->compra(['productoId' => $this->harina->id, 'cantidad' => 50, 'usuarioId' => $this->uid]);
        // Sin sucursal, entra a la distribuidora.
        $this->assertSame(50.0, $this->stock($this->harina, $this->central));

        $this->ops->fraccionar(['productoId' => $this->harina->id, 'sucursalId' => $this->central->id,
            'asignaciones' => [['presId' => $this->medioKg->id, 'cant' => 20]]]);
        $this->assertSame(40.0, $this->stock($this->harina, $this->central));
        $this->assertSame(20.0, $this->stock($this->harina, $this->central, $this->medioKg->id));

        // "Puse 20 y son 19": el medio kilo vuelve al granel.
        $r = $this->ops->corregirFraccionado(['productoId' => $this->harina->id, 'sucursalId' => $this->central->id,
            'presId' => $this->medioKg->id, 'cantidadReal' => 19]);
        $this->assertSame(0.5, $r['kg']);
        $this->assertSame(40.5, $this->stock($this->harina, $this->central));
        $this->assertSame(19.0, $this->stock($this->harina, $this->central, $this->medioKg->id));

        // No se puede fraccionar más de lo que hay.
        $this->expectException(ErrorDeNegocio::class);
        $this->ops->fraccionar(['productoId' => $this->harina->id, 'sucursalId' => $this->central->id,
            'asignaciones' => [['presId' => $this->medioKg->id, 'cant' => 1000]]]);
    }

    public function test_merma_congela_el_costo_y_deja_kardex(): void
    {
        $this->ops->compra(['productoId' => $this->harina->id, 'cantidad' => 10]);
        $this->ops->simple(['tipo' => 'merma', 'productoId' => $this->harina->id, 'sucursalId' => $this->central->id, 'cantidad' => 2, 'motivo' => 'Bolsa rota']);
        $this->assertSame(8.0, $this->stock($this->harina, $this->central));
        $m = DB::table('movimientos')->where('tipo', 'merma')->first();
        $this->assertEqualsWithDelta(400.0, (float) $m->costo_unitario, 0.001, 'costo neto por kg congelado en el movimiento');
        $this->assertSame(-1, (int) $m->signo);
        $this->assertStringContainsString('Bolsa rota', $m->descripcion);

        // Vencido: sale de disponible y queda contado como vencido.
        $this->ops->simple(['tipo' => 'vencido', 'productoId' => $this->harina->id, 'sucursalId' => $this->central->id, 'cantidad' => 1]);
        $this->assertSame(7.0, $this->stock($this->harina, $this->central));
        $this->assertSame(1.0, $this->stock($this->harina, $this->central, null, 'vencido'));
    }

    public function test_un_archivado_que_recibe_stock_vuelve_a_discontinuado(): void
    {
        $this->harina->update(['estado' => 'archivado']);
        $this->ops->simple(['tipo' => 'devolucion', 'productoId' => $this->harina->id, 'sucursalId' => $this->central->id, 'cantidad' => 1]);
        $this->assertSame('discontinuado', $this->harina->refresh()->estado->value);
    }

    public function test_transferencia_completa_con_faltante_e_incidencia(): void
    {
        $this->ops->compra(['productoId' => $this->gaseosa->id, 'cantidad' => 12]);
        $this->ops->compra(['productoId' => $this->harina->id, 'cantidad' => 10]);

        // El destino arma el borrador y lo envía.
        $b = $this->tr->borrador(['origenId' => $this->central->id, 'destinoId' => $this->express->id, 'usuarioId' => $this->uid]);
        $b2 = $this->tr->borrador(['origenId' => $this->central->id, 'destinoId' => $this->express->id]);
        $this->assertSame($b['id'], $b2['id'], 'un solo borrador por ruta');
        $this->tr->guardarBorrador($b['id'], ['items' => [
            ['productoId' => $this->gaseosa->id, 'cantidad' => 10],
            ['productoId' => $this->harina->id, 'cantidad' => 4],
        ]]);
        $env = $this->tr->enviarBorrador($b['id'], ['usuarioId' => $this->uid]);
        $this->assertSame('TR'.str_pad($b['id'], 4, '0', STR_PAD_LEFT), $env['codigo']);
        // Pendiente no toca stock.
        $this->assertSame(12.0, $this->stock($this->gaseosa, $this->central));

        // El origen la toma: preparada. Confirmar la lista de enteros RESERVA.
        $this->tr->avanzar($b['id'], $this->uid, 'pendiente');
        $this->tr->editarItem($b['id'], DB::table('transferencia_items')->where('producto_id', $this->gaseosa->id)->value('id'), ['cantidadPreparada' => 8]);
        $this->tr->confirmarLista($b['id'], ['tipo' => 'enteros', 'listo' => true, 'usuarioId' => $this->uid]);
        $this->assertSame(4.0, $this->stock($this->gaseosa, $this->central));
        $this->assertSame(8.0, $this->stock($this->gaseosa, $this->central, null, 'comprometido'));

        // Despachar sin confirmar la lista de granel rebota.
        try {
            $this->tr->avanzar($b['id'], $this->uid, 'preparada');
            $this->fail('debía exigir la lista de fraccionados');
        } catch (ErrorDeNegocio $e) {
            $this->assertStringContainsString('Fraccionados', $e->getMessage());
        }
        $this->tr->confirmarLista($b['id'], ['tipo' => 'granel', 'listo' => true]);
        $this->tr->avanzar($b['id'], $this->uid, 'preparada');
        $this->assertSame(8.0, $this->stock($this->gaseosa, $this->central, null, 'en_transito'));
        $this->assertSame(0.0, $this->stock($this->gaseosa, $this->central, null, 'comprometido'));
        // Viaja valuado al costo del día ($1.000/u).
        $this->assertEqualsWithDelta(1000.0, (float) DB::table('transferencia_items')->where('producto_id', $this->gaseosa->id)->value('costo_unitario'), 0.001);

        // El destino recibe 7 de 8: el faltante queda comprometido en el origen con incidencia.
        $itemId = DB::table('transferencia_items')->where('producto_id', $this->gaseosa->id)->value('id');
        $r = $this->tr->recibir($b['id'], ['items' => [['itemId' => $itemId, 'cantidadRecibida' => 7]], 'usuarioId' => $this->uid]);
        $this->assertSame('recibida', $r['estado']);
        $this->assertCount(1, $r['incidencias']);
        $this->assertSame(7.0, $this->stock($this->gaseosa, $this->express));
        $this->assertSame(4.0, $this->stock($this->harina, $this->express));
        $this->assertSame(0.0, $this->stock($this->gaseosa, $this->central, null, 'en_transito'));
        $this->assertSame(1.0, $this->stock($this->gaseosa, $this->central, null, 'comprometido'));

        // Resolver la incidencia como merma: sale de comprometido con costo congelado.
        $incId = DB::table('incidencias')->where('codigo', $r['incidencias'][0])->value('id');
        $this->inc->resolver($incId, 'merma', $this->uid);
        $this->assertSame(0.0, $this->stock($this->gaseosa, $this->central, null, 'comprometido'));
        $this->assertEqualsWithDelta(1000.0, (float) DB::table('movimientos')->where('ref_incidencia_id', $incId)->where('tipo', 'merma')->value('costo_unitario'), 0.001);
        // Inventario total: 12 compradas = 4 en central + 7 en express + 1 merma.
        $this->assertSame(4.0, $this->stock($this->gaseosa, $this->central));
    }

    public function test_cancelar_preparada_libera_solo_lo_confirmado(): void
    {
        $this->ops->compra(['productoId' => $this->gaseosa->id, 'cantidad' => 12]);
        $t = $this->tr->crear(['origenId' => $this->central->id, 'destinoId' => $this->express->id, 'items' => [['productoId' => $this->gaseosa->id, 'cantidad' => 5]]]);
        $this->tr->avanzar($t['id']);
        $this->tr->confirmarLista($t['id'], ['tipo' => 'enteros', 'listo' => true]);
        $this->assertSame(7.0, $this->stock($this->gaseosa, $this->central));
        $this->tr->cancelar($t['id'], $this->uid);
        $this->assertSame(12.0, $this->stock($this->gaseosa, $this->central));
        $this->assertSame(0.0, $this->stock($this->gaseosa, $this->central, null, 'comprometido'));
    }

    public function test_el_cajero_no_toca_transferencias_de_otra_sucursal(): void
    {
        $this->ops->compra(['productoId' => $this->gaseosa->id, 'cantidad' => 12]);
        $t = $this->tr->crear(['origenId' => $this->central->id, 'destinoId' => $this->express->id, 'items' => [['productoId' => $this->gaseosa->id, 'cantidad' => 5]]]);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException::class);
        // Limitado al express: preparar es del origen (central).
        $this->tr->avanzar($t['id'], $this->uid, null, $this->express->id);
    }

    public function test_incidencia_liberar_devuelve_a_disponible(): void
    {
        $this->ops->compra(['productoId' => $this->gaseosa->id, 'cantidad' => 12]);
        $r = $this->inc->crear(['productoId' => $this->gaseosa->id, 'sucursalId' => $this->central->id, 'cantidad' => 3, 'tipo' => 'rotura', 'motivo' => 'Caja golpeada'], $this->uid);
        $this->assertSame('INC'.str_pad($r['id'], 4, '0', STR_PAD_LEFT), $r['codigo']);
        $this->assertSame(9.0, $this->stock($this->gaseosa, $this->central));
        $this->inc->avanzar($r['id']);
        $this->inc->resolver($r['id'], 'liberar', $this->uid);
        $this->assertSame(12.0, $this->stock($this->gaseosa, $this->central));
        $this->assertSame('resuelta', DB::table('incidencias')->where('id', $r['id'])->value('estado'));
    }

    public function test_conteo_ciego_cierra_y_aplica_ajustes(): void
    {
        $this->ops->compra(['productoId' => $this->gaseosa->id, 'cantidad' => 12]);
        $this->ops->compra(['productoId' => $this->harina->id, 'cantidad' => 10]);

        $c = $this->conteos->crear(['sucursalId' => $this->central->id, 'usuarioId' => $this->uid, 'ciego' => true, 'soloConStock' => true]);
        $this->assertSame(2, $c['total'], 'harina suelta y gaseosa (la presentación no tiene stock)');

        $vista = $this->conteos->get($c['id'], false);
        $this->assertArrayNotHasKey('virtual', $vista['items'][0], 'ciego: el que cuenta no ve el virtual');

        $itemGaseosa = collect($vista['items'])->firstWhere('productoId', $this->gaseosa->id);
        $this->conteos->contarItem($c['id'], $itemGaseosa['id'], ['contado' => 11, 'usuarioId' => $this->uid]);
        // No se puede abrir otro control que incluya lo mismo.
        try {
            $this->conteos->crear(['sucursalId' => $this->central->id]);
            $this->fail('debía chocar con el control abierto');
        } catch (ErrorDeNegocio $e) {
            $this->assertStringContainsString('ya está en el control', $e->getMessage());
        }
        // Aplicar sin cerrar rebota.
        try {
            $this->conteos->aplicar($c['id'], $this->uid);
            $this->fail('debía exigir el cierre');
        } catch (ErrorDeNegocio $e) {
            $this->assertStringContainsString('Cerrá el control', $e->getMessage());
        }
        $this->conteos->cerrar($c['id']);
        $revision = $this->conteos->get($c['id'], true);
        $fila = collect($revision['items'])->firstWhere('productoId', $this->gaseosa->id);
        $this->assertSame(-1.0, $fila['diferencia']);
        $this->assertEqualsWithDelta(-1000.0, $fila['diferenciaPlata'], 0.001);

        $r = $this->conteos->aplicar($c['id'], $this->uid);
        $this->assertSame(1, $r['ajustes']);
        $this->assertSame(11.0, $this->stock($this->gaseosa, $this->central));
        $this->assertSame('aplicado', $r['estado']);
        $this->assertSame(1, DB::table('movimientos')->where('ref_conteo_id', $c['id'])->count());
    }

    public function test_ganchos_de_documentos_reservan_y_egresan(): void
    {
        $this->ops->compra(['productoId' => $this->gaseosa->id, 'cantidad' => 12]);
        $items = [['productoId' => $this->gaseosa->id, 'cantidad' => 5]];
        DB::transaction(fn () => $this->ops->reservarItems(['sucursalId' => $this->central->id, 'descripcion' => 'Presupuesto #1', 'items' => $items]));
        $this->assertSame(7.0, $this->stock($this->gaseosa, $this->central));
        $this->assertSame(5.0, $this->stock($this->gaseosa, $this->central, null, 'comprometido'));

        // Reservar más de lo que hay corta antes de mover nada.
        try {
            DB::transaction(fn () => $this->ops->reservarItems(['sucursalId' => $this->central->id, 'descripcion' => 'x', 'items' => [['productoId' => $this->gaseosa->id, 'cantidad' => 100]]]));
            $this->fail();
        } catch (ErrorDeNegocio $e) {
            $this->assertStringContainsString('Stock insuficiente para reservar', $e->getMessage());
        }

        DB::transaction(fn () => $this->ops->reservarItems(['sucursalId' => $this->central->id, 'descripcion' => 'liberado', 'liberar' => true, 'items' => $items]));
        DB::transaction(fn () => $this->ops->egresarStockItems(['sucursalId' => $this->central->id, 'descripcion' => 'Venta', 'items' => $items]));
        $this->assertSame(7.0, $this->stock($this->gaseosa, $this->central));
        DB::transaction(fn () => $this->ops->reingresarStockItems(['sucursalId' => $this->central->id, 'items' => [['productoId' => $this->gaseosa->id, 'cantidad' => 2]]]));
        $this->assertSame(9.0, $this->stock($this->gaseosa, $this->central));
        $this->assertSame(1, DB::table('movimientos')->where('tipo', 'devolucion')->count());
    }

    public function test_novedades_pedido_marca_nuevo_reingreso_y_excluye_lo_viejo(): void
    {
        // NUEVO: alta reciente (dentro de DIAS_NUEVO), recién entró a stock, express nunca lo recibió.
        $nuevo = Producto::query()->create(['nombre' => 'Producto Nuevo', 'tipo' => 'entero', 'iva' => 21]);
        DB::table('productos')->where('id', $nuevo->id)->update(['created_at' => now()->subDays(10)]);
        $this->ops->compra(['productoId' => $nuevo->id, 'cantidad' => 15, 'usuarioId' => $this->uid]);

        // REINGRESO: alta vieja (muy anterior a la ventana), pero volvió a entrar stock recién.
        $reingreso = Producto::query()->create(['nombre' => 'Producto Reingreso', 'tipo' => 'entero', 'iva' => 21]);
        DB::table('productos')->where('id', $reingreso->id)->update(['created_at' => now()->subDays(500)]);
        $this->ops->compra(['productoId' => $reingreso->id, 'cantidad' => 8, 'usuarioId' => $this->uid]);

        // VIEJO Y QUIETO: alta y última compra muy anteriores al piso histórico — no es novedad.
        $viejo = Producto::query()->create(['nombre' => 'Producto Viejo Sin Novedad', 'tipo' => 'entero', 'iva' => 21]);
        DB::table('productos')->where('id', $viejo->id)->update(['created_at' => '2020-01-01 00:00:00']);
        $this->ops->compra(['productoId' => $viejo->id, 'cantidad' => 3, 'usuarioId' => $this->uid]);
        DB::table('movimientos')->where('producto_id', $viejo->id)->where('tipo', 'compra')->update(['fecha' => '2020-01-01 00:00:00']);

        $token = $this->loguear($this->superadmin(), 'admin1234');
        $res = $this->conToken($token)
            ->getJson('/api/transferencias/novedades?origenId='.$this->central->id.'&destinoId='.$this->express->id)
            ->assertOk()->json();

        $porProducto = collect($res['items'])->keyBy('productoId');

        $this->assertTrue($porProducto->has($nuevo->id), 'el producto recién dado de alta debe listarse');
        $this->assertSame('nuevo', $porProducto[$nuevo->id]['chip']);
        $this->assertSame(15.0, (float) $porProducto[$nuevo->id]['disponible']);

        $this->assertTrue($porProducto->has($reingreso->id), 'el producto repuesto debe listarse');
        $this->assertSame('reingreso', $porProducto[$reingreso->id]['chip']);
        $this->assertSame(8.0, (float) $porProducto[$reingreso->id]['disponible']);

        $this->assertFalse($porProducto->has($viejo->id), 'lo anterior al piso histórico no es novedad');
    }
}
