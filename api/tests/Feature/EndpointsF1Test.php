<?php

namespace Tests\Feature;

use App\Models\Producto;
use App\Models\Sucursal;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Los endpoints de F1 de punta a punta: contrato JSON, permisos y precios derivados. */
class EndpointsF1Test extends TestCase
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

    /** Arma un producto granel con proveedor, presentación y formato de venta por la API. */
    private function armarHarina(): array
    {
        $marca = $this->admin()->postJson('/api/catalogos/marcas', ['nombre' => 'Molinos'])->assertCreated()->json();
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', [
            'nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'marcaId' => $marca['id'],
            'proveedorId' => $prov['id'], 'costoInicial' => 10000,
        ])->assertCreated()->json();
        $this->assertSame('granel', $p['tipo']);
        $this->assertSame('Molinos', $p['marca']);
        $this->assertNotSame('', $p['codigoPropio'], 'código propio autogenerado');

        // Formato de compra: bolsa de 25 kg a $10.000 → $400/kg.
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [
            ['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true],
        ]])->assertOk()->json();
        $this->assertEqualsWithDelta(400.0, $p['costoNeto'], 0.001);
        $this->assertEqualsWithDelta(400.0, $p['formatosCompra'][0]['costoNetoUnitario'], 0.001);

        // Presentación de 500 g con EAN interno generado.
        $ean = $this->admin()->getJson('/api/productos/siguiente-ean')->assertOk()->json('codigo');
        $this->assertSame(13, strlen($ean));
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/presentaciones', ['items' => [['tamKg' => 0.5, 'codigoBarras' => $ean]]])->assertOk()->json();
        $this->assertCount(1, $p['presentaciones']);
        $this->assertTrue($p['presentaciones'][0]['sinFormato']);
        $this->assertNull($p['presentaciones'][0]['precio'], 'sin formato de venta no hay precio (no es cero)');

        return [$p, $prov];
    }

    public function test_producto_con_formato_de_venta_deriva_precios(): void
    {
        [$p] = $this->armarHarina();
        $listas = $this->admin()->getJson('/api/listas')->assertOk()->json('listas');
        $mostrador = collect($listas)->firstWhere('nombre', 'Mostrador');

        // Markup 50% sobre $400 → neto 600 → final 726 → góndola al entero (redondeoPrecio=1) = 726.
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk()->json();
        $this->assertCount(1, $p['listas']);
        $this->assertEqualsWithDelta(726.0, $p['listas'][0]['precioFinalUnitario'], 0.001);
        $this->assertEqualsWithDelta(726.0, $p['precioFinal'], 0.001);
        $this->assertSame('Minorista 1 · Mostrador', $p['listas'][0]['etiqueta']);

        // El paquete de 500 g hereda el costo del kilo: $200 → +50% = 300 → final 363.
        $presId = $p['presentaciones'][0]['id'];
        $p = $this->admin()->putJson('/api/productos/presentaciones/'.$presId.'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk()->json();
        $this->assertEqualsWithDelta(363.0, $p['presentaciones'][0]['precioFinal'], 0.001);

        // La evolución registró el precio inicial.
        $ev = $this->admin()->getJson('/api/precios/evolucion?productoId='.$p['id'])->assertOk()->json();
        $this->assertNotEmpty($ev);
        $this->assertSame('inicial', $ev[0]['origen']);

        // El cajero ve el producto con precio pero SIN costos ni markup.
        $visto = $this->cajero()->getJson('/api/productos/'.$p['id'])->assertOk()->json();
        $this->assertNull($visto['costoNeto']);
        $this->assertNull($visto['listas'][0]['markup']);
        $this->assertEqualsWithDelta(726.0, $visto['precioFinal'], 0.001);
        $this->assertArrayNotHasKey('costo', $visto['formatosCompra'][0]);
    }

    public function test_actualizar_costos_mueve_el_precio_y_se_revierte_por_lote(): void
    {
        [$p] = $this->armarHarina();
        $mostrador = collect($this->admin()->getJson('/api/listas')->json('listas'))->firstWhere('nombre', 'Mostrador');
        $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk();
        $formatoId = $p['formatosCompra'][0]['id'];

        $r = $this->admin()->postJson('/api/precios/costos', ['cambios' => [['id' => $formatoId, 'costo' => 12000]], 'origen' => 'masiva', 'motivo' => 'Lista nueva'])->assertOk()->json();
        $this->assertSame(1, $r['actualizados']);
        $this->assertNotSame('', $r['lote']);
        // $480/kg × 1.5 × 1.21 = 871.2 → 871
        $this->assertEqualsWithDelta(871.0, $this->admin()->getJson('/api/productos/'.$p['id'])->json('precioFinal'), 0.001);

        $h = $this->admin()->getJson('/api/precios/historial?lote='.$r['lote'])->assertOk()->json();
        $this->assertCount(1, $h);
        $this->assertEqualsWithDelta(10000.0, $h[0]['costoAnterior'], 0.001);

        $rev = $this->admin()->postJson('/api/precios/revertir/'.$r['lote'])->assertOk()->json();
        $this->assertSame(1, $rev['revertidos']);
        $this->assertEqualsWithDelta(726.0, $this->admin()->getJson('/api/productos/'.$p['id'])->json('precioFinal'), 0.001);
        $this->assertSame('reversion', $this->admin()->getJson('/api/precios/evolucion?productoId='.$p['id'])->json('0.origen'));
    }

    public function test_operaciones_por_http_y_permisos_por_rol(): void
    {
        [$p] = $this->armarHarina();
        $central = $this->central();

        // El cajero no fracciona ni carga mermas; el admin sí.
        $this->cajero()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 1])->assertStatus(403);
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 10, 'sucursalId' => $central->id])->assertOk();
        // Un ajuste sin motivo rebota con un 400 legible.
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'ajuste', 'signo' => 1, 'cantidad' => 1, 'sucursalId' => $central->id])
            ->assertStatus(400)->assertJsonPath('message', 'Un ajuste necesita su motivo: es lo que queda en el historial.');

        $presId = $p['presentaciones'][0]['id'];
        $this->admin()->postJson('/api/operaciones/fraccionar', ['productoId' => $p['id'], 'sucursalId' => $central->id, 'asignaciones' => [['presId' => $presId, 'cant' => 4]]])->assertOk();

        $stock = $this->admin()->getJson('/api/stock')->assertOk()->json();
        $granel = collect($stock)->first(fn ($s) => $s['productoId'] === $p['id'] && $s['presentacionId'] === null);
        $this->assertEquals(8.0, $granel['cantidad']);

        $movs = $this->admin()->getJson('/api/movimientos?productoId='.$p['id'])->assertOk()->json();
        $this->assertCount(2, $movs);

        // El cajero ve el stock (sección existencias) pero sólo de su sucursal.
        $this->cajero()->getJson('/api/stock')->assertOk();
        // El cajero no lista movimientos (no tiene almacen.operaciones ni compras.historial).
        $this->cajero()->getJson('/api/movimientos')->assertStatus(403);
    }

    public function test_bootstrap_trae_todo_lo_que_el_panel_necesita(): void
    {
        $this->armarHarina();
        $b = $this->admin()->getJson('/api/bootstrap')->assertOk()->json();
        foreach (['listasCatalogo', 'catalogos', 'sucursales', 'proveedores', 'usuarios', 'productos', 'stock', 'transferencias', 'incidencias', 'configVentas'] as $k) {
            $this->assertArrayHasKey($k, $b);
        }
        $this->assertCount(1, $b['productos']);
        $this->assertSame(1, $b['configVentas']['redondeoPrecio']);
        $this->assertNotEmpty($b['listasCatalogo']['listas']);
    }

    public function test_configuracion_merge_parcial_validado(): void
    {
        $c = $this->admin()->putJson('/api/configuracion/ventas', ['redondeoPrecio' => 10, 'basura' => 'x', 'descuentoMaxVendedor' => 500])->assertOk()->json();
        $this->assertSame(10, $c['redondeoPrecio']);
        $this->assertArrayNotHasKey('basura', $c);
        $this->assertSame(100, $c['descuentoMaxVendedor'], 'acotado al máximo');
        // Un valor fuera de la lista cerrada vuelve al default.
        $this->assertSame(1, $this->admin()->putJson('/api/configuracion/ventas', ['redondeoPrecio' => 7])->json('redondeoPrecio'));
        $this->cajero()->putJson('/api/configuracion/ventas', ['redondeoPrecio' => 10])->assertStatus(403);
        $this->cajero()->getJson('/api/configuracion/ventas')->assertOk();
        $this->admin()->getJson('/api/configuracion/nada')->assertStatus(404);
    }

    public function test_chat_grupal_y_privado_por_polling(): void
    {
        // El chat vive en la central (distribuidora); el superadmin entró ahí.
        $b = $this->admin()->getJson('/api/chat/bootstrap')->assertOk()->json();
        $this->assertTrue($b['habilitado']);
        $this->assertSame([], $b['mensajes']);

        $m = $this->admin()->postJson('/api/chat/mensajes', ['texto' => 'Hola equipo'])->assertCreated()->json();
        $this->assertSame('Administrador', $m['usuarioNombre']);
        // Privado para Lucas.
        $lucasId = DB::table('usuarios')->where('nombre', 'Lucas')->value('id');
        $this->admin()->postJson('/api/chat/mensajes', ['texto' => 'Sólo para vos', 'paraUsuarioId' => $lucasId])->assertCreated();
        $this->admin()->postJson('/api/chat/mensajes', ['texto' => '   '])->assertStatus(422)->assertJsonPath('message', 'Falta el texto.');

        // Lucas está en la central: ve el grupal y su privado.
        $lucasCentral = $this->loguear(\App\Models\Usuario::query()->find($lucasId), 'clave1234', $this->central()->id);
        $nuevos = $this->conToken($lucasCentral)->getJson('/api/chat/mensajes?desde=0')->assertOk()->json();
        $this->assertCount(2, $nuevos['mensajes']);
        $this->assertContains('Administrador', array_column($nuevos['enLinea'], 'nombre'));

        $this->conToken($lucasCentral)->postJson('/api/chat/leido', ['ultimoMensajeId' => $m['id']])->assertOk();
        $this->assertSame($m['id'], (int) DB::table('chat_lecturas')->where('usuario_id', $lucasId)->value('ultimo_mensaje_id'));

        // En un express no hay chat.
        $express = Sucursal::query()->where('tipo', 'express')->firstOrFail();
        $lucasExpress = $this->loguear(\App\Models\Usuario::query()->find($lucasId), 'clave1234', $express->id);
        $this->assertFalse($this->conToken($lucasExpress)->getJson('/api/chat/bootstrap')->json('habilitado'));
    }

    public function test_catalogos_duplicados_baja_y_fusion(): void
    {
        $a = $this->admin()->postJson('/api/catalogos/marcas', ['nombre' => 'Cachafaz'])->assertCreated()->json();
        $this->admin()->postJson('/api/catalogos/marcas', ['nombre' => ' cachafáz '])->assertStatus(400)->assertJsonPath('message', 'Ya existe: "Cachafaz".');
        $b = $this->admin()->postJson('/api/catalogos/marcas', ['nombre' => 'CACHAFAZ SRL'])->assertCreated()->json();
        Producto::query()->create(['nombre' => 'Alfajor', 'marca_id' => $b['id']]);

        // Con usos se desactiva, no se borra.
        $this->admin()->deleteJson('/api/catalogos/marcas/'.$b['id'])->assertOk()->assertJsonPath('desactivada', true);
        // Fusionar mueve los productos y borra el origen.
        $this->admin()->postJson('/api/catalogos/marcas/'.$b['id'].'/fusionar', ['haciaId' => $a['id']])->assertOk();
        $this->assertSame($a['id'], Producto::query()->where('nombre', 'Alfajor')->value('marca_id'));
        $this->assertNull(DB::table('marcas')->find($b['id']));
        $this->cajero()->postJson('/api/catalogos/marcas', ['nombre' => 'X'])->assertStatus(403);
    }

    public function test_producto_se_archiva_solo_sin_stock_y_se_borra_solo_sin_historia(): void
    {
        [$p] = $this->armarHarina();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 2, 'sucursalId' => $this->central()->id])->assertOk();
        $this->admin()->postJson('/api/productos/'.$p['id'].'/estado', ['estado' => 'archivado'])->assertStatus(400);
        $this->admin()->postJson('/api/productos/'.$p['id'].'/estado', ['estado' => 'discontinuado', 'motivo' => 'No se trae más'])->assertOk()->assertJsonPath('estado', 'discontinuado');
        $this->admin()->deleteJson('/api/productos/'.$p['id'])->assertStatus(400);

        $nuevo = $this->admin()->postJson('/api/productos', ['nombre' => 'Sin historia', 'codigoBarras' => '7790000000012'])->assertCreated()->json();
        $this->admin()->postJson('/api/productos', ['nombre' => 'Otro', 'codigoBarras' => '7790000000012'])->assertStatus(400);
        $this->admin()->deleteJson('/api/productos/'.$nuevo['id'])->assertOk();
    }
}
