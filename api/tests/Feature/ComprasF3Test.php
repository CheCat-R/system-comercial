<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * F3 de punta a punta contra MariaDB: comprobantes de compra (recepción,
 * costos, deuda, remito → factura, notas), pagos a proveedores (caja,
 * imputación, candados), gastos (renglones, pago inmediato, fijos, adjuntos),
 * compromisos y echeqs, estado de cuenta y el kanban de pedidos.
 */
class ComprasF3Test extends TestCase
{
    private string $admin;

    private string $cajero;

    private string $fraccionador;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $this->cajero = $this->loguear($this->crearUsuario('Lucas', 'cajero'));
        $this->fraccionador = $this->loguear($this->crearUsuario('Pedro', 'fraccionador'));
    }

    private function admin(): static
    {
        return $this->conToken($this->admin);
    }

    private function cajero(): static
    {
        return $this->conToken($this->cajero);
    }

    private function fraccionador(): static
    {
        return $this->conToken($this->fraccionador);
    }

    /** Un proveedor RI con un producto entero (Aceite) a $1000 de costo. */
    private function armarProveedorConProducto(array $prov = []): array
    {
        $p = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Distribuidora Norte', 'condicionIva' => 'responsable_inscripto', 'diasPago' => 30, ...$prov])->assertCreated()->json();
        $prod = $this->admin()->postJson('/api/productos', ['nombre' => 'Aceite 900ml', 'iva' => 21, 'proveedorId' => $p['id'], 'costoInicial' => 1000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$prod['id'].'/formatos-compra', ['items' => [['id' => $prod['formatosCompra'][0]['id'], 'proveedorId' => $p['id'], 'cantidad' => 12, 'costo' => 12000, 'usarParaPrecio' => true]]])->assertOk();

        return [$p, $prod];
    }

    private function stockDisponible(int $productoId): float
    {
        return (float) DB::table('stock')->where('producto_id', $productoId)->whereNull('presentacion_id')->where('estado', 'disponible')->sum('cantidad');
    }

    private function abrirCaja(): array
    {
        return $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 5000])->assertCreated()->json();
    }

    private function arqueo(int $turnoId): float
    {
        return (float) $this->admin()->getJson('/api/caja/'.$turnoId.'/arqueo')->assertOk()->json('esperadoEfectivo');
    }

    /* ------------------------------ Comprobantes ------------------------------ */

    public function test_factura_de_compra_recibe_stock_actualiza_costo_y_genera_deuda(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        $suc = $this->central()->id;
        // Sin la sección no se carga.
        $this->fraccionador()->postJson('/api/comprobantes', ['tipo' => 'factura', 'proveedorId' => $prov['id'], 'items' => []])->assertStatus(403);

        $f = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'A', 'puntoVenta' => '3', 'numero' => 1001, 'proveedorId' => $prov['id'], 'sucursalId' => $suc, 'recepcion' => true,
            'fecha' => '2026-09-10', 'vencimientoPago' => '2026-10-10', 'bonificacion' => 10,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 24, 'costoUnitario' => 1100, 'iva' => 21, 'codigoProveedor' => 'AC-900']],
            'percepciones' => [['nombre' => 'Perc. IIBB', 'alicuota' => 3, 'base' => 'neto']],
            'actualizarCostos' => [['productoId' => $prod['id'], 'costo' => 13200, 'cantidad' => 12]],
        ])->assertCreated()->json();
        // Bruto 26400 − 10% = 23760 neto; IVA 4989.60; percepción 3% de 23760 = 712.80; total 29462.40.
        $this->assertSame('Factura A 00003-00001001', $f['etiqueta']);
        $this->assertEquals(23760.0, $f['subtotalNeto']);
        $this->assertEquals(4989.6, $f['ivaTotal']);
        $this->assertEquals(712.8, $f['percepcionesTotal']);
        $this->assertEquals(29462.4, $f['total']);
        $this->assertEquals(29462.4, $f['saldo']);
        $this->assertSame('cuenta_corriente', $f['condicionPago']);
        $this->assertEquals(24.0, $this->stockDisponible($prod['id']));
        // El costo de catálogo cambió y quedó rastro con el comprobante.
        $this->assertEquals(13200.0, (float) DB::table('producto_proveedores')->where('producto_id', $prod['id'])->where('proveedor_id', $prov['id'])->value('costo'));
        $this->assertTrue(DB::table('producto_proveedor_costos')->where('comprobante_id', $f['id'])->exists());
        // El mapeo del artículo del proveedor se aprendió.
        $this->assertSame($prod['id'], (int) DB::table('proveedor_articulos')->where('proveedor_id', $prov['id'])->where('codigo', 'AC-900')->value('producto_id'));
        // Duplicado → 400 legible.
        $this->admin()->postJson('/api/comprobantes', ['tipo' => 'factura', 'puntoVenta' => '00003', 'numero' => 1001, 'proveedorId' => $prov['id'], 'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 1]]])
            ->assertStatus(400)->assertJsonPath('message', 'Distribuidora Norte ya tiene cargada la factura 00003-1001 (comprobante #'.$f['id'].').');
        // Bonificación mayor al bruto → 400.
        $this->admin()->postJson('/api/comprobantes', ['tipo' => 'factura', 'proveedorId' => $prov['id'], 'bonificacionImporte' => 99999, 'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 10]]])->assertStatus(400);

        // La cuenta del proveedor por mercadería y el saldo global.
        $this->admin()->getJson('/api/comprobantes/cuenta/'.$prov['id'])->assertOk()->assertJsonPath('saldo', 29462.4)->assertJsonPath('deuda', 29462.4);
        $this->admin()->getJson('/api/comprobantes/saldos')->assertOk()->assertJsonPath('total', 29462.4);
        // La liquidación se fuerza a letra X e IVA 0 y no viaja sin el permiso.
        $l = $this->admin()->postJson('/api/comprobantes', ['tipo' => 'liquidacion', 'letra' => 'A', 'proveedorId' => $prov['id'], 'cae' => '123', 'items' => [['productoId' => $prod['id'], 'cantidad' => 10, 'costoUnitario' => 1000, 'iva' => 21]]])->assertCreated()->json();
        $this->assertSame('X', $l['letra']);
        $this->assertEquals(0.0, $l['ivaTotal']);
        $this->assertSame('', $l['cae']);
        $this->assertEquals(10000.0, $l['total']);
        $this->admin()->getJson('/api/pagos-proveedor/cuenta/'.$prov['id'])->assertOk()->assertJsonPath('mercaderia', 39462.4);
    }

    public function test_pago_en_sucursal_desde_la_caja_y_factura_que_lo_toma_con_cuotas(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['modoCuenta' => 'facturas']);
        $turno = $this->abrirCaja();
        // La cajera le paga $10.000 del cajón al repartidor sin cargar factura.
        $pago = $this->cajero()->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 10000, 'medio' => 'efectivo', 'cajaSesionId' => $turno['id'], 'concepto' => 'pedido aceite'])->assertCreated()->json();
        $this->assertEquals(10000.0, $pago['saldo']);
        $this->assertSame('mercaderia', $pago['destino']);
        $this->assertNotNull($pago['cajaMovimientoId']);
        // El arqueo ya ve el egreso.
        $this->assertEquals(-5000.0, $this->arqueo($turno['id']));
        $this->admin()->getJson('/api/pagos-proveedor/sin-aplicar')->assertOk()->assertJsonPath('cantidad', 1)->assertJsonPath('total', 10000);
        // Un turno cerrado o de otra sucursal no acepta egresos.
        $this->admin()->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 1, 'cajaSesionId' => 9999])->assertStatus(400);

        // El admin carga la factura de $30.250 (25000 + IVA) tomando ese pago y el resto en dos cuotas.
        $f = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'numero' => 7, 'proveedorId' => $prov['id'], 'sucursalId' => $this->central()->id, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 25, 'costoUnitario' => 1000]],
            'tomarPagos' => [['pagoId' => $pago['id'], 'importe' => 10000]],
            'compromisos' => [['importe' => 10000, 'fechaVenc' => '2026-10-15'], ['importe' => 10250, 'fechaVenc' => '2026-11-15']],
        ])->assertCreated()->json();
        $this->assertEquals(30250.0, $f['total']);
        $this->assertEquals(10000.0, $f['pagado']);
        $this->assertEquals(20250.0, $f['saldo']);
        $this->assertCount(2, $f['compromisos']);
        $this->assertSame(1, $f['compromisos'][0]['cuota']);
        // Cuotas que no cierran → 400.
        $this->admin()->postJson('/api/comprobantes', ['tipo' => 'factura', 'proveedorId' => $prov['id'], 'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 1000]],
            'compromisos' => [['importe' => 500, 'fechaVenc' => '2026-10-15']]])->assertStatus(400);

        // Modo "por facturas": un pago suelto que no es el saldo ni una cuota se rechaza; una cuota pasa.
        $this->admin()->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 3000, 'medio' => 'transferencia', 'imputaciones' => [['comprobanteId' => $f['id'], 'importe' => 3000]]])->assertStatus(400);
        $k1 = $f['compromisos'][0];
        $pk = $this->admin()->postJson('/api/compromisos/'.$k1['id'].'/pagar', ['medio' => 'transferencia', 'referencia' => 'TR-1'])->assertOk()->json();
        $this->assertTrue($pk['pagado']);
        $this->assertEquals(10000.0, $pk['pago']['importe']);
        $this->admin()->getJson('/api/comprobantes/'.$f['id'])->assertOk()->assertJsonPath('saldo', 10250);
        // La última cuota por su saldo completo con pago mixto: cierra la factura y el compromiso.
        $p2 = $this->admin()->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 10250, 'formas' => [['medio' => 'transferencia', 'importe' => 10000], ['medio' => 'efectivo', 'importe' => 250]],
            'cajaSesionId' => $turno['id'], 'imputaciones' => [['comprobanteId' => $f['id'], 'importe' => 10250]]])->assertCreated()->json();
        $this->assertCount(2, $p2['formas']);
        $c = $this->admin()->getJson('/api/comprobantes/'.$f['id'])->assertOk()->json();
        $this->assertEquals(0.0, $c['saldo']);
        $this->assertTrue($c['compromisos'][1]['pagado']);
        $this->admin()->getJson('/api/compromisos?filtro=pendientes')->assertOk()->assertJsonPath('total', 0);
        // Solo la parte en efectivo salió del cajón: −5000 − 250.
        $this->assertEquals(-5250.0, $this->arqueo($turno['id']));
        // Desaplicar reabre el compromiso; anular un pago con imputaciones se rechaza.
        $this->admin()->postJson('/api/pagos-proveedor/'.$p2['id'].'/anular', [])->assertStatus(400);
        $imp = $this->admin()->getJson('/api/pagos-proveedor/'.$p2['id'])->json('imputaciones.0.id');
        $this->admin()->deleteJson('/api/pagos-proveedor/imputaciones/'.$imp)->assertOk()->assertJsonPath('saldo', 10250);
        $this->assertFalse((bool) DB::table('proveedor_compromisos')->where('id', $c['compromisos'][1]['id'])->value('pagado'));
        $this->admin()->postJson('/api/pagos-proveedor/'.$p2['id'].'/anular', ['motivo' => 'error'])->assertOk()->assertJsonPath('estado', 'anulado');
        $this->assertEquals(-5000.0, $this->arqueo($turno['id']));
    }

    public function test_remito_se_factura_sin_volver_a_mover_stock_y_la_nota_de_credito_ajusta_la_factura(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['modoCuenta' => 'libre']);
        $suc = $this->central()->id;
        $r = $this->admin()->postJson('/api/comprobantes', ['tipo' => 'remito', 'numero' => 55, 'proveedorId' => $prov['id'], 'sucursalId' => $suc, 'recepcion' => true,
            'items' => [['productoId' => $prod['id'], 'cantidad' => 10, 'costoUnitario' => 1000]]])->assertCreated()->json();
        $this->assertEquals(10.0, $this->stockDisponible($prod['id']));
        $this->assertEquals(0.0, $this->admin()->getJson('/api/comprobantes/cuenta/'.$prov['id'])->json('saldo'));
        $this->admin()->getJson('/api/comprobantes/remitos-pendientes')->assertOk()->assertJsonCount(1);

        // Llega la factura: precios reales, mismo id, el stock no se mueve.
        $itemId = $r['items'][0]['id'];
        $f = $this->admin()->postJson('/api/comprobantes/'.$r['id'].'/facturar', ['letra' => 'A', 'numero' => 900, 'fecha' => '2026-09-12', 'items' => [['itemId' => $itemId, 'costoUnitario' => 1200]],
            'pagoContado' => ['importe' => 4520, 'medio' => 'transferencia']])->assertOk()->json();
        $this->assertSame($r['id'], $f['id']);
        $this->assertSame('factura', $f['tipo']);
        $this->assertEquals(14520.0, $f['total']);
        $this->assertEquals(4520.0, $f['pagado']);
        $this->assertStringContainsString('Nace del Remito', $f['observaciones']);
        $this->assertEquals(10.0, $this->stockDisponible($prod['id']));
        $this->admin()->getJson('/api/comprobantes/remitos-pendientes')->assertOk()->assertJsonCount(0);
        // Un itemId ajeno corta todo.
        $this->admin()->postJson('/api/comprobantes/'.$f['id'].'/facturar', ['items' => [['itemId' => 99999]]])->assertStatus(400);

        // NC con devolución de 2 unidades: saca stock y baja el saldo de ESA factura.
        $this->assertEquals(10000.0, $this->admin()->getJson('/api/comprobantes/referenciables/'.$prov['id'])->assertOk()->json('0.saldo'));
        $nc = $this->admin()->postJson('/api/comprobantes', ['tipo' => 'nota_credito', 'numero' => 3, 'proveedorId' => $prov['id'], 'sucursalId' => $suc, 'recepcion' => true, 'refComprobanteId' => $f['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => 2, 'costoUnitario' => 1200]]])->assertCreated()->json();
        $this->assertEquals(2904.0, $nc['total']);
        $this->assertSame('Factura A 00001-00000900', $nc['refEtiqueta']);
        $this->assertEquals(8.0, $this->stockDisponible($prod['id']));
        $c = $this->admin()->getJson('/api/comprobantes/'.$f['id'])->assertOk()->json();
        $this->assertEquals(-2904.0, $c['ajuste']);
        $this->assertEquals(7096.0, $c['saldo']);
        // La bandeja de pago ofrece el saldo real y no acepta más que eso.
        $this->admin()->getJson('/api/pagos-proveedor/pendientes/'.$prov['id'])->assertOk()->assertJsonPath('0.saldo', 7096);
        $this->admin()->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 8000, 'medio' => 'transferencia', 'imputaciones' => [['comprobanteId' => $f['id'], 'importe' => 8000]]])->assertStatus(400);
        // Una NC no se paga; una nota no ajusta la factura de otro.
        $this->admin()->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 10, 'imputaciones' => [['comprobanteId' => $nc['id'], 'importe' => 10]]])->assertStatus(400);
        $otro = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Otro'])->json();
        $this->admin()->postJson('/api/comprobantes', ['tipo' => 'nota_debito', 'proveedorId' => $otro['id'], 'refComprobanteId' => $f['id'], 'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 1]]])->assertStatus(400);

        // Anular: primero la NC (devuelve las 2 unidades), después la factura no se puede (tiene pagos).
        $this->admin()->postJson('/api/comprobantes/'.$nc['id'].'/anular', ['motivo' => 'mal cargada'])->assertOk()->assertJsonPath('estado', 'anulado');
        $this->assertEquals(10.0, $this->stockDisponible($prod['id']));
        $this->admin()->getJson('/api/comprobantes/'.$f['id'])->assertOk()->assertJsonPath('saldo', 10000);
        $this->admin()->postJson('/api/comprobantes/'.$f['id'].'/anular', ['motivo' => 'x'])->assertStatus(400);
    }

    /* ------------------------------ Gastos ------------------------------ */

    public function test_gastos_con_renglones_pago_inmediato_cuentas_a_pagar_y_fijos(): void
    {
        $boot = $this->admin()->getJson('/api/gastos/bootstrap')->assertOk()->json();
        $rubro = collect($boot['categorias'])->firstWhere('nombre', 'Alquiler');
        $this->assertNotNull($rubro);
        $fletes = collect($boot['categorias'])->firstWhere('nombre', 'Fletes');
        $turno = $this->abrirCaja();

        // Factura A con renglones netos e IVA aparte, pagada en el acto desde la caja.
        $g = $this->admin()->postJson('/api/gastos', ['categoriaId' => $rubro['id'], 'tipoDoc' => 'factura', 'letra' => 'A', 'numero' => '0001-00000044', 'proveedorTexto' => 'Inmobiliaria Sur',
            'items' => [['concepto' => 'Alquiler septiembre', 'monto' => 100000], ['concepto' => 'Expensas', 'monto' => 20000]], 'ivaAparte' => true, 'iva' => 25200, 'percDgr' => 1000,
            'pagoInmediato' => ['importe' => 146200, 'medio' => 'efectivo', 'cajaSesionId' => $turno['id']]])->assertCreated()->json();
        $this->assertEquals(120000.0, $g['neto']);
        $this->assertEquals(146200.0, $g['total']);
        $this->assertSame('pagado', $g['estado']);
        $this->assertSame('Alquiler septiembre · Expensas', $g['descripcion']);
        $this->assertCount(1, $g['pagos']);
        $this->assertEquals(5000.0 - 146200.0, $this->arqueo($turno['id']));
        // Con pagos no se tocan importes ni se anula.
        $this->admin()->patchJson('/api/gastos/'.$g['id'], ['neto' => 1])->assertStatus(400);
        $this->admin()->postJson('/api/gastos/'.$g['id'].'/anular', ['motivo' => 'x'])->assertStatus(400);
        $this->admin()->patchJson('/api/gastos/'.$g['id'], ['observaciones' => 'ok'])->assertOk()->assertJsonPath('observaciones', 'ok');

        // Ticket final (IVA incluido informativo), en cuenta corriente y vencido: aparece en cuentas a pagar.
        $g2 = $this->admin()->postJson('/api/gastos', ['categoriaId' => $fletes['id'], 'tipoDoc' => 'ticket', 'letra' => 'B', 'items' => [['concepto' => 'Flete Chaco', 'monto' => 12100]], 'iva' => 2100,
            'condicionPago' => 'cuenta_corriente', 'vencimiento' => '2026-09-01'])->assertCreated()->json();
        $this->assertEquals(10000.0, $g2['neto']);
        $this->assertSame('pendiente', $g2['estado']);
        $cap = $this->admin()->getJson('/api/gastos/cuentas-a-pagar')->assertOk()->json();
        $this->assertCount(1, $cap);
        $this->assertLessThan(0, $cap[0]['dias']);
        $this->admin()->getJson('/api/gastos/pendientes')->assertOk()->assertJsonPath('vencidos', 1)->assertJsonPath('saldo', 12100);
        // El cajero puede pagarlo (gastos_pagar_proveedor) pero no cargar gastos.
        $this->cajero()->postJson('/api/gastos', ['categoriaId' => $fletes['id'], 'neto' => 1])->assertStatus(403);
        $this->cajero()->postJson('/api/gastos/'.$g2['id'].'/pagos', ['importe' => 12100, 'medio' => 'efectivo', 'cajaSesionId' => $turno['id']])->assertOk()->assertJsonPath('estado', 'pagado');
        $this->admin()->getJson('/api/gastos/cuentas-a-pagar')->assertOk()->assertJsonCount(0);
        // Duplicado por proveedor + número.
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Edesur', 'proveeGastos' => true, 'proveeMercaderia' => false])->json();
        $this->admin()->postJson('/api/gastos', ['categoriaId' => $rubro['id'], 'proveedorId' => $prov['id'], 'numero' => 'A-1', 'neto' => 100])->assertCreated();
        $this->admin()->postJson('/api/gastos', ['categoriaId' => $rubro['id'], 'proveedorId' => $prov['id'], 'numero' => 'A-1', 'neto' => 100])->assertStatus(400);

        // Resumen por rubro.
        $res = $this->admin()->getJson('/api/gastos/resumen')->assertOk()->json();
        $this->assertSame(3, $res['cantidad']);
        $this->assertEquals(146300.0, collect($res['porCategoria'])->firstWhere('nombre', 'Alquiler')['total']);
        $this->assertEquals(146300.0, $res['porTipo']['fijos']);

        // Gastos fijos: generar el período es idempotente.
        $rec = $this->admin()->postJson('/api/gastos/recurrentes', ['nombre' => 'Internet', 'categoriaId' => $rubro['id'], 'importeEstimado' => 30000, 'diaVencimiento' => 31])->assertCreated()->json();
        $this->admin()->getJson('/api/gastos/recurrentes/periodo/2026-02')->assertOk()->assertJsonCount(1, 'pendientes');
        $this->admin()->postJson('/api/gastos/recurrentes/generar', ['periodo' => '2026-02'])->assertOk()->assertJsonPath('creados', 1);
        $this->admin()->postJson('/api/gastos/recurrentes/generar', ['periodo' => '2026-02'])->assertOk()->assertJsonPath('creados', 0);
        $prev = $this->admin()->getJson('/api/gastos/recurrentes/periodo/2026-02')->assertOk()->json();
        $this->assertCount(0, $prev['pendientes']);
        $this->assertCount(1, $prev['emitidos']);
        $gen = $this->admin()->getJson('/api/gastos/'.$prev['emitidos'][0]['gastoId'])->assertOk()->json();
        // Día 31 en febrero → se recorta al 28 (medianoche argentina, 03:00Z).
        $this->assertStringStartsWith('2026-02-28T03:00:00', (string) $gen['vencimiento']);
        $this->assertSame($rec['id'], $gen['recurrenteId']);
        // El rubro con gastos no se borra.
        $this->admin()->deleteJson('/api/gastos/categorias/'.$rubro['id'])->assertStatus(400);

        // Adjunto: el mime sale de los bytes.
        $png = 'data:image/png;base64,'.base64_encode("\x89PNG\r\n\x1a\n".str_repeat('x', 20));
        $this->admin()->postJson('/api/gastos/'.$g2['id'].'/adjuntos', ['nombre' => 'ticket.png', 'data' => $png])->assertCreated()->assertJsonPath('mime', 'image/png');
        $this->admin()->postJson('/api/gastos/'.$g2['id'].'/adjuntos', ['data' => 'data:text/html;base64,'.base64_encode('<script>')])->assertStatus(400);
        $adj = $this->admin()->getJson('/api/gastos/'.$g2['id'])->json('adjuntos.0.id');
        $this->admin()->get('/api/gastos/adjuntos/'.$adj)->assertOk()->assertHeader('Content-Type', 'image/png');
        // Con pagos, el adjunto es el respaldo: no se borra.
        $this->admin()->deleteJson('/api/gastos/adjuntos/'.$adj)->assertStatus(400);
    }

    /* ------------------------------ Echeqs y estado de cuenta ------------------------------ */

    public function test_echeqs_nacen_con_la_factura_se_cobran_y_el_estado_de_cuenta_cierra(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto(['medioHabitual' => 'echeq', 'modoCuenta' => 'libre']);
        $f = $this->admin()->postJson('/api/comprobantes', ['tipo' => 'factura', 'numero' => 1, 'proveedorId' => $prov['id'], 'fecha' => '2026-08-01',
            'items' => [['productoId' => $prod['id'], 'cantidad' => 10, 'costoUnitario' => 1000]], 'compromisos' => [['importe' => 12100, 'fechaVenc' => '2026-09-30']]])->assertCreated()->json();
        // El compromiso es echeq y nació el papel "a completar".
        $e = $this->admin()->getJson('/api/echeqs')->assertOk()->json();
        $this->assertSame(1, $e['total']);
        $this->assertStringStartsWith('PEND-', $e['filas'][0]['numero']);
        $this->assertEquals(12100.0, $e['filas'][0]['importe']);
        // No aparece en la vitrina de compromisos (tiene la suya).
        $this->admin()->getJson('/api/compromisos')->assertOk()->assertJsonPath('total', 0);
        $eid = $e['filas'][0]['id'];
        $this->admin()->patchJson('/api/echeqs/'.$eid, ['numero' => '00012345', 'banco' => 'Galicia'])->assertOk()->assertJsonPath('banco', 'Galicia');
        $this->admin()->patchJson('/api/echeqs/'.$eid, ['importe' => 5])->assertStatus(400);
        $this->admin()->postJson('/api/echeqs/'.$eid.'/estado', ['estado' => 'entregado'])->assertOk()->assertJsonPath('estado', 'entregado');
        // Cobrado = pago real imputado a la factura.
        $this->admin()->postJson('/api/echeqs/'.$eid.'/estado', ['estado' => 'cobrado'])->assertOk()->assertJsonPath('estado', 'cobrado');
        $c = $this->admin()->getJson('/api/comprobantes/'.$f['id'])->assertOk()->json();
        $this->assertEquals(0.0, $c['saldo']);
        $this->assertSame('echeq', $c['pagos'][0]['medio']);
        $this->assertTrue($c['compromisos'][0]['pagado']);
        $this->admin()->deleteJson('/api/echeqs/'.$eid)->assertStatus(400);

        // Estado de cuenta: gastos + ajuste + conciliación.
        $rubro = collect($this->admin()->getJson('/api/gastos/categorias')->json())->firstWhere('nombre', 'Fletes');
        $this->admin()->postJson('/api/gastos', ['categoriaId' => $rubro['id'], 'proveedorId' => $prov['id'], 'neto' => 500])->assertCreated();
        $this->admin()->postJson('/api/proveedores-edoc/ajustes', ['proveedorId' => $prov['id'], 'monto' => 100, 'tipo' => 'haber', 'motivo' => 'redondeo'])->assertCreated();
        $this->admin()->postJson('/api/proveedores-edoc/ajustes', ['proveedorId' => $prov['id'], 'monto' => 100, 'tipo' => 'haber', 'motivo' => ''])->assertStatus(422);
        $ed = $this->admin()->getJson('/api/proveedores-edoc/'.$prov['id'])->assertOk()->json();
        $this->assertEquals(12600.0, $ed['totDebe']);
        $this->assertEquals(12200.0, $ed['totHaber']);
        $this->assertEquals(400.0, $ed['saldo']);
        $this->assertEquals(12100.0, $ed['totales']['pagos']);
        $this->assertCount(1, $ed['docsPendientes']);
        $glob = $this->admin()->getJson('/api/proveedores-edoc')->assertOk()->json();
        $fila = collect($glob)->firstWhere('id', $prov['id']);
        $this->assertEquals(400.0, $fila['saldo']);
        $this->assertSame('pendiente', $fila['estado']);
        $this->admin()->postJson('/api/proveedores-edoc/'.$prov['id'].'/conciliar')->assertOk();
        $this->assertNotNull($this->admin()->getJson('/api/proveedores-edoc/'.$prov['id'])->json('proveedor.conciliadoHasta'));
        // Percepciones y cuentas del proveedor.
        $this->admin()->putJson('/api/proveedores/'.$prov['id'].'/percepciones', ['percepciones' => [['nombre' => 'Perc. IVA RG 5329', 'alicuota' => 3]]])->assertOk()->assertJsonCount(1);
        $this->admin()->putJson('/api/proveedores/'.$prov['id'].'/cuentas', ['cuentas' => [['cbuAlias' => 'norte.mp', 'descripcion' => 'MP']]])->assertOk()->assertJsonPath('0.cbuAlias', 'norte.mp');
        $this->cajero()->getJson('/api/proveedores/'.$prov['id'].'/cuentas')->assertOk()->assertJsonCount(1);
        $this->cajero()->putJson('/api/proveedores/'.$prov['id'].'/cuentas', ['cuentas' => []])->assertStatus(403);
    }

    /* ------------------------------ Pedidos ------------------------------ */

    public function test_pedidos_kanban_estados_y_recibidos(): void
    {
        $a = $this->admin()->postJson('/api/proveedores', ['nombre' => 'A'])->json();
        $b = $this->admin()->postJson('/api/proveedores', ['nombre' => 'B'])->json();
        $this->admin()->postJson('/api/pedidos-proveedor', ['proveedorIds' => [$a['id'], $b['id'], $a['id']], 'notas' => 'harina y aceite'])->assertCreated()->assertJsonPath('creados', 2);
        $k = $this->admin()->getJson('/api/pedidos-proveedor')->assertOk()->json();
        $this->assertCount(2, $k);
        $id = $k[0]['id'];
        $this->admin()->postJson('/api/pedidos-proveedor/'.$id.'/enviado')->assertOk()->assertJsonPath('pedidoEnviado', true);
        $this->admin()->postJson('/api/pedidos-proveedor/'.$id.'/revisado')->assertOk();
        $this->admin()->patchJson('/api/pedidos-proveedor/'.$id.'/estado', ['estado' => 'pedido'])->assertOk()->assertJsonPath('pedidoEnviado', false)->assertJsonPath('revisadoAt', null);
        $this->admin()->postJson('/api/pedidos-proveedor/'.$id.'/enviado')->assertStatus(400);
        $this->admin()->patchJson('/api/pedidos-proveedor/'.$id.'/estado', ['estado' => 'recibido'])->assertOk();
        $this->admin()->getJson('/api/pedidos-proveedor')->assertOk()->assertJsonCount(1);
        $this->admin()->getJson('/api/pedidos-proveedor/recibidos?filtro=mes')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('filas.0.dias', 0);
        $this->admin()->getJson('/api/pedidos-proveedor/stats')->assertOk()->assertJsonPath('pendientes', 1);
        $this->cajero()->getJson('/api/pedidos-proveedor')->assertStatus(403);
    }
}
