<?php

namespace Tests\Feature;

use App\Arca\Comprobante;
use App\Arca\Qr;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * F2 de punta a punta contra MariaDB: clientes, caja, POS (borrador →
 * cobro), el portero de precios, notas de crédito, anulación, cobranzas,
 * presupuestos, ofertas/descuentos y la parte pura de ARCA.
 */
class VentasF2Test extends TestCase
{
    private string $admin;

    private string $cajero;

    private int $cajeroId;

    private string $fraccionador;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $u = $this->crearUsuario('Lucas', 'cajero');
        $this->cajeroId = $u->id;
        $this->cajero = $this->loguear($u);
        $this->fraccionador = $this->loguear($this->crearUsuario('Pedro', 'fraccionador'));
    }

    private function fraccionador(): static
    {
        return $this->conToken($this->fraccionador);
    }

    private function admin(): static
    {
        return $this->conToken($this->admin);
    }

    private function cajero(): static
    {
        return $this->conToken($this->cajero);
    }

    /** Harina granel a $400/kg de costo, Mostrador +50% (neto 600 / final 726), 20 kg en Central. */
    private function armarHarinaConStock(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $listas = $this->admin()->getJson('/api/listas')->json('listas');
        $mostrador = collect($listas)->firstWhere('nombre', 'Mostrador');
        $mayorista = collect($listas)->firstWhere('nombre', 'Mayorista');
        // Mayorista +20% (neto 480) desde 10 kg.
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [
            ['listaId' => $mostrador['id'], 'markup' => 50], ['listaId' => $mayorista['id'], 'markup' => 20, 'unidadesMinimas' => 10],
        ]])->assertOk()->json();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 20, 'sucursalId' => $this->central()->id])->assertOk();

        return [$p, $mostrador, $mayorista];
    }

    private function abrirCaja(float $fondo = 1000): array
    {
        return $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => $fondo])->assertCreated()->json();
    }

    private function stockDisponible(int $productoId): float
    {
        return (float) DB::table('stock')->where('producto_id', $productoId)->whereNull('presentacion_id')->where('estado', 'disponible')->sum('cantidad');
    }

    /* ------------------------------ Clientes ------------------------------ */

    public function test_clientes_consumidor_final_documento_unico_y_llave_de_credito(): void
    {
        // El bootstrap garantiza el Consumidor Final genérico.
        $b = $this->admin()->getJson('/api/ventas/bootstrap')->assertOk()->json();
        $cf = collect($b['clientes'])->firstWhere('esConsumidorFinal', true);
        $this->assertNotNull($cf);
        $this->assertSame('consumidor_final', $cf['condicionIva']);

        $c = $this->admin()->postJson('/api/clientes', ['nombre' => 'Panadería El Sol', 'tipoDoc' => 'cuit', 'numeroDoc' => '30-71234567-8', 'condicionIva' => 'responsable_inscripto', 'ctaCteHabilitada' => true, 'limiteCredito' => 50000, 'diasPlazo' => 30])->assertCreated()->json();
        $this->assertSame('30712345678', $c['numeroDoc']);
        // CUIT repetido → 400 legible.
        $this->admin()->postJson('/api/clientes', ['nombre' => 'Otro', 'tipoDoc' => 'cuit', 'numeroDoc' => '30712345678'])->assertStatus(400)->assertJsonPath('message', 'Ese documento ya está registrado en "Panadería El Sol".');
        // CUIT corto → 400.
        $this->admin()->postJson('/api/clientes', ['nombre' => 'X', 'tipoDoc' => 'cuit', 'numeroDoc' => '123'])->assertStatus(400);

        // Sin la sección ventas.clientes no se escribe el padrón.
        $this->fraccionador()->postJson('/api/clientes', ['nombre' => 'Y'])->assertStatus(403);
        // Y el padrón lo lee cualquiera con sesión.
        $this->cajero()->getJson('/api/clientes')->assertOk();

        // El admin (sin `cta_cte`) puede editar la ficha pero NO tocar el crédito.
        $adminRol = $this->crearUsuario('Marta', 'admin');
        $marta = $this->conToken($this->loguear($adminRol));
        $marta->patchJson('/api/clientes/'.$c['id'], ['nombre' => 'Panadería El Sol SRL', 'tipoDoc' => 'cuit', 'numeroDoc' => '30712345678', 'condicionIva' => 'responsable_inscripto'])->assertOk()->assertJsonPath('ctaCteHabilitada', true)->assertJsonPath('limiteCredito', 50000);
        $marta->patchJson('/api/clientes/'.$c['id'], ['nombre' => 'Panadería El Sol SRL', 'limiteCredito' => 999999])->assertStatus(403);
        $marta->patchJson('/api/clientes/'.$c['id'].'/credito', ['ctaCteHabilitada' => false])->assertStatus(403);

        // El Consumidor Final no se borra ni se le quita lo fiscal.
        $this->admin()->deleteJson('/api/clientes/'.$cf['id'])->assertStatus(400);
        $this->admin()->patchJson('/api/clientes/'.$cf['id'], ['nombre' => 'Consumidor Final', 'condicionIva' => 'responsable_inscripto', 'activo' => false])->assertOk()->assertJsonPath('condicionIva', 'consumidor_final')->assertJsonPath('activo', true);
        // Sin historial se borra de verdad.
        $this->admin()->deleteJson('/api/clientes/'.$c['id'])->assertOk()->assertJsonPath('desactivado', false);
    }

    /* ------------------------------ Caja ------------------------------ */

    public function test_caja_un_turno_por_sucursal_arqueo_y_cierre(): void
    {
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 0])->assertStatus(400);
        $t = $this->abrirCaja(1000);
        $this->assertSame('abierta', $t['estado']);
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 500])->assertStatus(400)->assertJsonPath('message', 'Ya hay un turno de caja abierto en esta sucursal. Cerralo antes de abrir otro.');
        $this->cajero()->getJson('/api/caja/actual/'.$this->central()->id)->assertOk()->assertJsonPath('turno.id', $t['id']);

        // Movimiento manual pide `diferencias`.
        $this->fraccionador()->postJson('/api/caja/'.$t['id'].'/movimiento', ['tipo' => 'egreso', 'importe' => 200, 'motivo' => 'Flete'])->assertStatus(403);
        $this->admin()->postJson('/api/caja/'.$t['id'].'/movimiento', ['tipo' => 'egreso', 'importe' => 200, 'motivo' => 'Flete'])->assertCreated();
        $this->admin()->postJson('/api/caja/'.$t['id'].'/movimiento', ['tipo' => 'ingreso', 'importe' => 50, 'motivo' => ''])->assertStatus(422);

        $a = $this->admin()->getJson('/api/caja/'.$t['id'].'/arqueo')->assertOk()->json();
        $this->assertEquals(800.0, $a['esperadoEfectivo']);
        $ctl = $this->admin()->postJson('/api/caja/'.$t['id'].'/control', ['contadoEfectivo' => 790])->assertCreated()->json();
        $this->assertEquals(-10.0, $ctl['diferencia']);

        $c = $this->admin()->postJson('/api/caja/'.$t['id'].'/cerrar', ['declaradoEfectivo' => 810])->assertOk()->json();
        $this->assertSame('cerrada', $c['estado']);
        $this->assertEquals(800.0, $c['sistemaEfectivo']);
        $this->assertEquals(10.0, $c['diferencia']);
        $this->admin()->postJson('/api/caja/'.$t['id'].'/cerrar', ['declaradoEfectivo' => 810])->assertStatus(400);
        // Cerrado, se puede abrir otro.
        $this->abrirCaja(300);
    }

    /* ------------------------------ POS ------------------------------ */

    public function test_pos_borrador_portero_y_cobro_con_stock_y_caja(): void
    {
        [$p, $mostrador, $mayorista] = $this->armarHarinaConStock();
        $central = $this->central();

        // Catálogo del POS: la harina suelta con sus dos listas y stock 20.
        $cat = $this->cajero()->getJson('/api/ventas/catalogo')->assertOk()->json();
        $item = collect($cat['items'])->firstWhere('key', 'p'.$p['id']);
        $this->assertEquals(20.0, $item['stock']);
        $this->assertEqualsWithDelta(600.0, $item['precio'], 0.01);
        $this->assertEqualsWithDelta(726.0, $item['precioFinal'], 0.01);
        $this->assertCount(2, $item['precios']);
        // El neto mayorista sale del redondeo de góndola (final $581 → neto $480,17): el POS usa el del catálogo.
        $precioMay = collect($item['precios'])->firstWhere('listaId', $mayorista['id'])['precio'];
        $this->assertEqualsWithDelta(480.17, $precioMay, 0.01);
        $this->assertTrue(collect($cat['listas'])->firstWhere('listaId', $mostrador['id'])['esBase']);

        // Sin caja abierta el cajero no puede cobrar al contado (cajaObligatoria).
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600]]])->assertCreated()->json();
        $this->assertSame('borrador', $v['estado']);
        $this->assertNull($v['numero']);
        $this->assertEqualsWithDelta(1452.0, $v['total'], 0.01); // 2 × 600 × 1.21
        $this->assertEquals(20.0, $this->stockDisponible($p['id']), 'el borrador no toca stock');
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 1452]]])->assertStatus(400)->assertJsonPath('message', 'No hay un turno de caja abierto en esta sucursal. Abrí la caja para vender.');

        // EL PORTERO: precio pisado sin permiso → 400; lista mayorista sin ganársela → 400; IVA del producto manda.
        $this->cajero()->putJson('/api/ventas/'.$v['id'], ['items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 1]]])->assertStatus(400);
        $this->cajero()->putJson('/api/ventas/'.$v['id'], ['items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mayorista['id'], 'precioUnitario' => $precioMay]]])->assertStatus(400);
        $this->cajero()->putJson('/api/ventas/'.$v['id'], ['items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600, 'descuento' => 50]]])->assertStatus(400);
        // 12 kg sí habilitan Mayorista (mínimo 10).
        $v = $this->cajero()->putJson('/api/ventas/'.$v['id'], ['items' => [['productoId' => $p['id'], 'cantidad' => 12, 'listaId' => $mayorista['id'], 'precioUnitario' => $precioMay]]])->assertOk()->json();
        $this->assertSame('auto', $v['items'][0]['listaOrigen']);
        $this->assertEqualsWithDelta($precioMay, $v['items'][0]['precioUnitario'], 0.01);
        $this->assertEquals(21.0, $v['items'][0]['iva']);
        $this->assertNotNull($v['items'][0]['costoUnitario'], 'el costo se congela al armar el renglón');
        // El superadmin pisa precio (precio_manual vía comodín).
        $this->admin()->putJson('/api/ventas/'.$v['id'], ['items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 500]]])->assertOk()->assertJsonPath('items.0.listaOrigen', 'manual');
        // Vuelve a 2 kg de mostrador para cobrar.
        $v = $this->cajero()->putJson('/api/ventas/'.$v['id'], ['items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600]]])->assertOk()->json();

        $turno = $this->abrirCaja(1000);
        // Los pagos tienen que cubrir el total exacto.
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 1000]]])->assertStatus(400);
        // Redondeo del cobro: +$8 → $1.460, como extra con IVA 0.
        $c = $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['redondeo' => 8, 'pagos' => [['medio' => 'efectivo', 'importe' => 1460]]])->assertOk()->json();
        $this->assertSame('confirmada', $c['estado']);
        $this->assertSame(1, $c['numero']);
        $this->assertSame('ticket', $c['tipo']);
        $this->assertEqualsWithDelta(1460.0, $c['total'], 0.01);
        $this->assertSame($turno['id'], $c['cajaSesionId']);
        $this->assertSame($this->cajeroId, $c['cobradoPor']);
        $this->assertEquals(18.0, $this->stockDisponible($p['id']), 'confirmar descuenta stock');
        $this->assertSame('Ticket 00001-00000001', $c['etiqueta']);
        // Cobrar dos veces no duplica.
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['pagos' => [['medio' => 'efectivo', 'importe' => 1460]]])->assertStatus(400);
        // El arqueo ve la venta.
        $a = $this->admin()->getJson('/api/caja/'.$turno['id'].'/arqueo')->assertOk()->json();
        $this->assertEquals(2460.0, $a['esperadoEfectivo']);

        // Listado con totales del filtro.
        $l = $this->admin()->getJson('/api/ventas/listado')->assertOk()->json();
        $this->assertSame(1, $l['total']);
        $this->assertSame(1, $l['totales']['tickets']);
        $this->assertEqualsWithDelta(1460.0, $l['totales']['plata'], 0.01);
        $this->assertEquals(1460.0, $l['totales']['porMedio'][0]['importe']);

        // Anular: pide motivo y permiso `devoluciones`; devuelve stock y saca la venta del arqueo.
        $this->fraccionador()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => 'x'])->assertStatus(403);
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => ''])->assertStatus(422);
        $an = $this->admin()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => 'Cliente se arrepintió'])->assertOk()->json();
        $this->assertSame('anulada', $an['estado']);
        $this->assertEquals(20.0, $this->stockDisponible($p['id']));
        $this->assertEquals(1000.0, $this->admin()->getJson('/api/caja/'.$turno['id'].'/arqueo')->json('esperadoEfectivo'));
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => 'otra vez'])->assertStatus(400);

        // Descartar un borrador de otra sucursal: 403 para el cajero.
        $b2 = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'sucursalId' => $central->id + 1, 'items' => []])->assertCreated()->json();
        $this->cajero()->deleteJson('/api/ventas/'.$b2['id'])->assertStatus(403);
        $this->admin()->deleteJson('/api/ventas/'.$b2['id'])->assertOk();
    }

    public function test_venta_directa_cuenta_corriente_cobranza_y_anulacion_del_recibo(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Almacén Norte', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222', 'ctaCteHabilitada' => true, 'limiteCredito' => 2000, 'diasPlazo' => 15])->assertCreated()->json();
        $this->abrirCaja(500);

        // Cta. cte. no lleva pagos, y el límite de crédito frena.
        $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'condicionPago' => 'cuenta_corriente', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]], 'pagos' => [['medio' => 'efectivo', 'importe' => 726]]])->assertStatus(400);
        $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'condicionPago' => 'cuenta_corriente', 'items' => [['productoId' => $p['id'], 'cantidad' => 3, 'listaId' => $mostrador['id']]]])->assertStatus(400)->assertJsonFragment(['message' => 'Supera el límite de crédito. Saldo $0.00 + $2178.00 > límite $2000.00.']);
        $v = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'condicionPago' => 'cuenta_corriente', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->assertSame('confirmada', $v['estado']);
        $this->assertNotNull($v['vencimientoPago']);
        $this->assertEqualsWithDelta(1452.0, $v['saldo'], 0.01);

        $cuenta = $this->admin()->getJson('/api/clientes/'.$cli['id'].'/cuenta')->assertOk()->json();
        $this->assertEqualsWithDelta(1452.0, $cuenta['saldo'], 0.01);
        $this->assertEqualsWithDelta(548.0, $cuenta['disponible'], 0.01);
        $this->assertCount(1, $cuenta['comprobantes']);

        // Recibo parcial imputado en automático (FIFO) + a cuenta.
        $this->admin()->postJson('/api/cobranzas', ['clienteId' => $cli['id'], 'pagos' => [['medio' => 'transferencia', 'importe' => 5000]], 'imputaciones' => [['ventaId' => $v['id'], 'importe' => 5000]]])->assertStatus(400);
        $r = $this->admin()->postJson('/api/cobranzas', ['clienteId' => $cli['id'], 'pagos' => [['medio' => 'efectivo', 'importe' => 1000]], 'auto' => true])->assertCreated()->json();
        $this->assertSame(1, $r['numero']);
        $this->assertEquals(0.0, $r['aCuenta']);
        $this->assertEquals(1000.0, $r['imputaciones'][0]['importe']);
        $this->assertEqualsWithDelta(452.0, $this->admin()->getJson('/api/clientes/'.$cli['id'].'/cuenta')->json('saldo'), 0.01);
        // Con la cobranza imputada la venta no se anula.
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/anular', ['motivo' => 'x'])->assertStatus(400)->assertJsonPath('message', 'Tiene cobranzas imputadas. Anulá primero la cobranza.');
        // Se anula el recibo (devoluciones) y el saldo vuelve.
        $this->fraccionador()->postJson('/api/cobranzas/'.$r['id'].'/anular', ['motivo' => 'x'])->assertStatus(403);
        $this->admin()->postJson('/api/cobranzas/'.$r['id'].'/anular', ['motivo' => 'Transferencia rebotó'])->assertOk()->assertJsonPath('estado', 'anulada');
        $this->assertEqualsWithDelta(1452.0, $this->admin()->getJson('/api/clientes/'.$cli['id'].'/cuenta')->json('saldo'), 0.01);
        // El cliente con historial no se borra: se desactiva.
        $this->admin()->deleteJson('/api/clientes/'.$cli['id'])->assertOk()->assertJsonPath('desactivado', true);
    }

    public function test_factura_sin_arca_y_nota_de_credito_parcial_con_devolucion(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Panadería Sur', 'tipoDoc' => 'cuit', 'numeroDoc' => '30712345678', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $turno = $this->abrirCaja(1000);

        // Con ARCA apagado, "facturar" emite la letra con numeración local y sin CAE. RI + RI → Factura A.
        $v = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 4, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $f = $this->admin()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'factura', 'pagos' => [['medio' => 'efectivo', 'importe' => 2904]]])->assertOk()->json();
        $this->assertSame('factura_a', $f['tipo']);
        $this->assertSame(1, $f['numero']);
        $this->assertSame('', $f['cae']);
        $this->assertFalse($f['facturarPendiente']);
        $this->assertNull($f['qrArca'], 'sin CAE no hay QR');
        $this->assertSame(1, $f['codigoComprobante']);
        $this->assertEquals(16.0, $this->stockDisponible($p['id']));

        // Un ticket no lleva NC; una factura sí. Permiso `nota_credito`.
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/nota-credito', ['motivo' => 'x'])->assertStatus(403);
        // Parcial: vuelve 1 kg, con devolución de efectivo.
        $nc = $this->admin()->postJson('/api/ventas/'.$v['id'].'/nota-credito', ['motivo' => 'Venía húmeda', 'items' => [['itemId' => $f['items'][0]['id'], 'cantidad' => 1]], 'devolverEfectivo' => true])->assertCreated()->json();
        $this->assertSame('nota_credito_a', $nc['tipo']);
        $this->assertSame(1, $nc['numero']);
        $this->assertEqualsWithDelta(726.0, $nc['total'], 0.01);
        $this->assertSame($v['id'], $nc['refVentaId']);
        $this->assertEquals(17.0, $this->stockDisponible($p['id']), 'la mercadería vuelve');
        $this->assertEquals(1000 + 2904 - 726, $this->admin()->getJson('/api/caja/'.$turno['id'].'/arqueo')->json('esperadoEfectivo'));

        $f2 = $this->admin()->getJson('/api/ventas/'.$v['id'])->assertOk()->json();
        $this->assertEqualsWithDelta(726.0, $f2['acreditado'], 0.01);
        $this->assertEquals(3.0, $f2['items'][0]['devolvible']);
        $this->assertCount(1, $f2['notas']);
        // No se puede devolver más de lo que queda.
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/nota-credito', ['motivo' => 'x', 'items' => [['itemId' => $f['items'][0]['id'], 'cantidad' => 4]]])->assertStatus(400);
        // La total por lo que queda.
        $nc2 = $this->admin()->postJson('/api/ventas/'.$v['id'].'/nota-credito', ['motivo' => 'Se devolvió todo', 'devuelveMercaderia' => false])->assertCreated()->json();
        $this->assertEqualsWithDelta(2178.0, $nc2['total'], 0.01);
        $this->assertEquals(17.0, $this->stockDisponible($p['id']), 'sin devolver mercadería no mueve stock');
        $this->assertEquals(0.0, $this->admin()->getJson('/api/ventas/'.$v['id'])->json('acreditable'));
        $this->admin()->postJson('/api/ventas/'.$v['id'].'/nota-credito', ['motivo' => 'x'])->assertStatus(400);
        // La NC no se anula ni se "factura".
        $this->admin()->postJson('/api/ventas/'.$nc['id'].'/anular', ['motivo' => 'x'])->assertStatus(400);
        $l = $this->admin()->getJson('/api/ventas/listado')->assertOk()->json();
        $this->assertSame(2, $l['totales']['notasCredito']);
        $this->assertEqualsWithDelta(0.0, $l['totales']['plata'], 0.01, 'las notas restan del total del período');
    }

    /* ------------------------------ Presupuestos ------------------------------ */

    public function test_presupuesto_reserva_stock_y_se_cierra_en_una_venta(): void
    {
        [$p, $mostrador, $mayorista] = $this->armarHarinaConStock();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Bar La Esquina'])->assertCreated()->json();
        $pr = $this->admin()->postJson('/api/presupuestos', ['clienteId' => $cli['id'], 'entrega' => 'cadete', 'items' => [
            ['productoId' => $p['id'], 'nombre' => 'Harina 000', 'cantidad' => 12, 'precioLista' => 480, 'iva' => 21, 'listaId' => $mayorista['id'], 'lista' => 'Mayorista'],
        ]])->assertCreated()->json();
        $this->assertSame('PR'.str_pad((string) $pr['id'], 4, '0', STR_PAD_LEFT), $pr['codigo']);
        $this->admin()->postJson('/api/presupuestos/'.$pr['id'].'/confirmar')->assertStatus(400); // sólo un enviado se confirma
        $this->admin()->postJson('/api/presupuestos/'.$pr['id'].'/enviar')->assertOk()->assertJsonPath('dias', 7);
        $this->admin()->postJson('/api/presupuestos/'.$pr['id'].'/confirmar')->assertOk()->assertJsonPath('reservado', true);
        $this->assertEquals(8.0, $this->stockDisponible($p['id']), '12 kg quedan comprometidos');
        $det = $this->admin()->getJson('/api/presupuestos/'.$pr['id'])->assertOk()->json();
        $this->assertSame('confirmado', $det['estado']);

        // Otro cliente no puede cerrar este presupuesto.
        $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'presupuestoId' => $pr['id'], 'items' => []])->assertStatus(400)->assertJsonPath('message', 'Ese presupuesto es de otro cliente.');
        // El precio cotizado se honra aunque no coincida con la lista de hoy (cambiamos el markup).
        $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50], ['listaId' => $mayorista['id'], 'markup' => 30, 'unidadesMinimas' => 10]]])->assertOk();
        $this->abrirCaja(100);
        $v = $this->cajero()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'presupuestoId' => $pr['id'], 'items' => [['productoId' => $p['id'], 'cantidad' => 12, 'listaId' => $mayorista['id'], 'precioUnitario' => 480]],
            'pagos' => [['medio' => 'efectivo', 'importe' => 6969.6]]])->assertCreated()->json();
        $this->assertSame('presupuesto', $v['items'][0]['listaOrigen']);
        $this->assertEquals(8.0, $this->stockDisponible($p['id']), 'la reserva se liberó y salió por la venta');
        $this->assertEquals(0.0, (float) DB::table('stock')->where('producto_id', $p['id'])->where('estado', 'comprometido')->sum('cantidad'));
        $this->assertSame('cerrado', $this->admin()->getJson('/api/presupuestos/'.$pr['id'])->json('estado'));
        $this->assertSame($v['id'], $this->admin()->getJson('/api/presupuestos/'.$pr['id'])->json('ventaId'));

        // Cancelar un confirmado libera la reserva.
        $pr2 = $this->admin()->postJson('/api/presupuestos', ['clienteId' => $cli['id'], 'items' => [['productoId' => $p['id'], 'cantidad' => 3, 'precioLista' => 600]]])->assertCreated()->json();
        $this->admin()->postJson('/api/presupuestos/'.$pr2['id'].'/enviar')->assertOk();
        $this->admin()->postJson('/api/presupuestos/'.$pr2['id'].'/confirmar')->assertOk();
        $this->assertEquals(5.0, $this->stockDisponible($p['id']));
        $this->admin()->postJson('/api/presupuestos/'.$pr2['id'].'/cancelar', ['motivo' => 'No vino'])->assertOk();
        $this->assertEquals(8.0, $this->stockDisponible($p['id']));
    }

    /* ------------------------------ Ofertas y descuentos ------------------------------ */

    public function test_ofertas_validan_por_tipo_y_el_portero_acota_el_descuento(): void
    {
        [$p, $mostrador] = $this->armarHarinaConStock();
        $this->cajero()->postJson('/api/ofertas', ['nombre' => 'x', 'tipo' => 'porcentaje', 'porcentaje' => 10])->assertStatus(403);
        $this->admin()->postJson('/api/ofertas', ['nombre' => '3x2', 'tipo' => 'nxm', 'lleva' => 2, 'paga' => 3, 'alcances' => [['tipo' => 'producto', 'refId' => $p['id']]]])->assertStatus(400);
        $this->admin()->postJson('/api/ofertas', ['nombre' => '10% harina', 'tipo' => 'porcentaje', 'porcentaje' => 10])->assertStatus(400)->assertJsonPath('message', 'Elegí a qué productos, paquetes, marcas, categorías o etiquetas alcanza.');
        $o = $this->admin()->postJson('/api/ofertas', ['nombre' => '10% harina', 'tipo' => 'porcentaje', 'porcentaje' => 10, 'alcances' => [['tipo' => 'producto', 'refId' => $p['id']]]])->assertCreated()->json();
        $this->assertCount(1, $o['alcances']);
        $this->assertCount(1, $this->cajero()->getJson('/api/ventas/catalogo')->json('ofertas'));

        // El POS calcula el importe; el servidor lo ACOTA: 2 kg × 600 × 10% = 120 máximo.
        $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600, 'ofertaId' => $o['id'], 'oferta' => '10% harina', 'ofertaDescuento' => 500]]])->assertStatus(400);
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioUnitario' => 600, 'ofertaId' => $o['id'], 'oferta' => '10% harina', 'ofertaDescuento' => 120]]])->assertCreated()->json();
        $this->assertEqualsWithDelta(1080.0, $v['subtotalNeto'], 0.01);
        $this->assertEqualsWithDelta(120.0, $v['items'][0]['ofertaDescuento'], 0.01);
        // Con un renglón vendido la oferta no se borra: se desactiva.
        $this->admin()->deleteJson('/api/ofertas/'.$o['id'])->assertOk()->assertJsonPath('desactivada', true);

        // Descuento con nombre: uno por lista, requiere admin → el cajero no lo aplica.
        $this->admin()->postJson('/api/descuentos', ['nombre' => 'Empleados', 'porcentaje' => 25])->assertStatus(400);
        $d = $this->admin()->postJson('/api/descuentos', ['nombre' => 'Empleados', 'porcentaje' => 25, 'listaId' => $mostrador['id'], 'requiereAdmin' => true])->assertCreated()->json();
        $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'descuentos' => [$d['id']], 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertStatus(400)->assertJsonPath('message', 'El descuento "Empleados" lo tiene que aplicar un administrador.');
        $v2 = $this->admin()->postJson('/api/ventas', ['estado' => 'borrador', 'descuentos' => [$d['id']], 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->assertEquals(25.0, $v2['items'][0]['descuento']);
        $this->assertEquals(0.0, $v2['items'][0]['descuentoBase']);
        $this->assertSame('Empleados', $v2['items'][0]['descuentoNombre']);
        // Una vez aplicado por el admin, el cajero puede seguir editando el ticket.
        $this->cajero()->putJson('/api/ventas/'.$v2['id'], ['descuentos' => [$d['id']], 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id']]]])->assertOk();
        $this->admin()->deleteJson('/api/descuentos/'.$d['id'])->assertStatus(400);
    }

    /* ------------------------------ ARCA (puro) ------------------------------ */

    public function test_arca_alicuotas_cierran_al_centavo_receptor_y_qr(): void
    {
        // Tres renglones al 21% y uno al 10.5%: las bases suman exacto contra los totales de la cabecera.
        $renglones = [['neto' => 33.33, 'iva' => 21], ['neto' => 33.33, 'iva' => 21], ['neto' => 33.34, 'iva' => 21], ['neto' => 10, 'iva' => 10.5]];
        $al = Comprobante::armarAlicuotas($renglones, 110.0, 22.05);
        $this->assertCount(2, $al);
        $this->assertSame(5, $al[0]['id']);
        $this->assertEqualsWithDelta(110.0, $al[0]['baseImp'] + $al[1]['baseImp'], 0.001);
        $this->assertEqualsWithDelta(22.05, $al[0]['importe'] + $al[1]['importe'], 0.001);

        $this->assertSame(['docTipo' => 80, 'docNro' => '30712345678', 'condIvaReceptorId' => 1], Comprobante::armarReceptor('A', ['tipoDoc' => 'cuit', 'numeroDoc' => '30-71234567-8', 'condicionIva' => 'responsable_inscripto'], 1000));
        $this->assertSame(99, Comprobante::armarReceptor('B', ['tipoDoc' => 'sin_identificar', 'numeroDoc' => '', 'condicionIva' => 'consumidor_final'], 1000)['docTipo']);
        $this->expectException(\RuntimeException::class);
        Comprobante::armarReceptor('A', ['tipoDoc' => 'dni', 'numeroDoc' => '30111222', 'condicionIva' => 'consumidor_final'], 1000);
    }

    public function test_arca_apagado_deja_todo_como_estaba_y_el_estado_explica_por_que(): void
    {
        config(['arca.cuit' => '']);
        $e = $this->admin()->getJson('/api/arca/estado')->assertOk()->json();
        $this->assertFalse($e['disponible']);
        $this->assertSame('Falta ARCA_CUIT (el CUIT del emisor, 11 dígitos).', $e['motivo']);
        $this->assertSame(0, $e['trabadas']['cantidad']);
        $this->cajero()->getJson('/api/arca/estado')->assertStatus(403);
        $this->assertNull(Qr::url(['tipo' => 'factura_b', 'puntoVenta' => '00001', 'numero' => 1, 'fecha' => now(), 'total' => 100, 'cae' => '']));
        config(['arca.cuit' => '20123456789']);
        \App\Arca\Config::resetDisponible();
        $url = Qr::url(['tipo' => 'factura_b', 'puntoVenta' => '00001', 'numero' => 7, 'fecha' => now(), 'total' => 1234.5, 'cae' => '71234567890123', 'receptor' => ['tipoDoc' => 'dni', 'numeroDoc' => '30111222']]);
        $this->assertStringStartsWith('https://www.afip.gob.ar/fe/qr/?p=', $url);
        $payload = json_decode(base64_decode(substr($url, strlen('https://www.afip.gob.ar/fe/qr/?p='))), true);
        $this->assertSame(6, $payload['tipoCmp']);
        $this->assertSame(96, $payload['tipoDocRec']);
        $this->assertSame(1234.5, $payload['importe']);
    }
}
