<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Tests\TestCase;

/**
 * Lo que el POS le pide a la API al cobrar: un descuento con nombre se puede cobrar, el origen de la lista
 * (monto, marca, cliente…) sobrevive al guardado, y un cobro no se confirma contra un borrador distinto
 * del que el cajero tiene en pantalla.
 */
class CobroYListasDelPosTest extends TestCase
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

    /** Harina a $400/kg de costo: Mostrador neto 600 / final 726; Mayorista +20 % (neto 480) desde 10 kg. 20 kg en Central. */
    private function armarHarina(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $listas = $this->admin()->getJson('/api/listas')->json('listas');
        $mostrador = collect($listas)->firstWhere('nombre', 'Mostrador');
        $mayorista = collect($listas)->firstWhere('nombre', 'Mayorista');
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [
            ['listaId' => $mostrador['id'], 'markup' => 50], ['listaId' => $mayorista['id'], 'markup' => 20],
        ]])->assertOk()->json();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 20, 'sucursalId' => $this->central()->id])->assertOk();
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();

        return [$p, $mostrador, $mayorista];
    }

    public function test_un_descuento_con_nombre_se_cobra_al_contado_y_en_cuenta_corriente(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $d = $this->admin()->postJson('/api/descuentos', ['nombre' => 'Tardanza', 'porcentaje' => 25, 'listaId' => $mostrador['id']])->assertCreated()->json();

        // Neto 600 − 25 % = 450; con IVA 544,50.
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'descuentos' => [$d['id']], 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->assertEqualsWithDelta(544.5, $v['total'], 0.01);
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => 544.5]]])->assertOk();

        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Juan Perez', 'ctaCteHabilitada' => true, 'limiteCredito' => 100000])->assertCreated()->json();
        $v2 = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'clienteId' => $cli['id'], 'descuentos' => [$d['id']], 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $this->cajero()->postJson('/api/ventas/'.$v2['id'].'/confirmar', ['tipo' => 'factura', 'condicionPago' => 'cuenta_corriente'])->assertOk();
    }
    public function test_no_se_cobra_un_ticket_distinto_del_guardado(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();

        // En pantalla hay 2 kg ($1.452), pero el guardado quedó en 1 kg ($726).
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'totalEsperado' => 1452, 'pagos' => [['medio' => 'efectivo', 'importe' => 1452]]])
            ->assertStatus(400)->assertJsonPath('message', fn ($m) => str_contains($m, 'no es el que está guardado'));
        // Con el total correcto (y el redondeo aparte) se cobra.
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'totalEsperado' => 726, 'redondeo' => 4, 'pagos' => [['medio' => 'efectivo', 'importe' => 730]]])->assertOk();
    }

    public function test_el_precio_por_monto_queda_registrado_como_monto_y_vale_su_restriccion_de_medios(): void
    {
        [$p, $mostrador, $mayorista] = $this->armarHarina();
        // Desde .000 de ticket (a precio de Mostrador) rige Mayorista, pero solo pagando con transferencia.
        $this->admin()->putJson('/api/configuracion/ventas', ['montoMinimoMayorista' => 5000, 'modalidadMontoId' => $mayorista['modalidadId'], 'mediosPagoMonto' => ['transferencia']])->assertOk();

        // 10 kg × 600 = 6.000 neto de lista base: habilita Mayorista (neto 480 → 4.800 + IVA = 5.808).
        $items = [['productoId' => $p['id'], 'cantidad' => 10, 'listaId' => $mayorista['id'], 'listaOrigen' => 'monto']];
        $r = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => $items]); $this->assertSame(201, $r->status(), (string) $r->json('message')); $v = $r->json();
        $this->assertSame('monto', $v['items'][0]['listaOrigen'], 'el servidor lo registra como lo que es, y el POS lo reconoce al reabrir');

        // Y como es "monto", no se puede cobrar en efectivo.
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => $v['total']]]])
            ->assertStatus(400)->assertJsonPath('message', fn ($m) => str_contains($m, 'precio por monto'));
        $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'transferencia', 'importe' => $v['total']]]])->assertOk();
    }

    public function test_una_lista_ganada_por_cantidad_no_se_registra_como_monto(): void
    {
        [$p, $mostrador, $mayorista] = $this->armarHarina();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [
            ['listaId' => $mostrador['id'], 'markup' => 50], ['listaId' => $mayorista['id'], 'markup' => 20, 'unidadesMinimas' => 10],
        ]])->assertOk();
        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 10, 'listaId' => $mayorista['id'], 'listaOrigen' => 'monto']]])->assertCreated()->json();
        $this->assertSame('auto', $v['items'][0]['listaOrigen'], 'quien declara "monto" sin que el monto lo habilite no cambia lo registrado');
    }
}
