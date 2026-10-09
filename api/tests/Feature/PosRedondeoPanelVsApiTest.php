<?php

namespace Tests\Feature\Hallazgos;

use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * HALLAZGO: el POS y la API redondean distinto el mismo renglón.
 *
 * Producto con precio de góndola $2.503 (modo "precio"): el catálogo del POS
 * trae el neto 2068.595 (4 decimales). La API redondea el neto del renglón con
 * `round()` de PHP (2068.60) y da total $2.503,00. El panel (`r2` de pos.js,
 * `Math.round(x*100)/100`) da neto 2068.59 y total $2.502,99 — y precarga ESE
 * importe en el pago. `validarPagos` exige |pagado − total| <= 0.01, y
 * 2503 − 2502.99 en double es 0.0100000000002: se rechaza.
 *
 * Offline es lo peor: la venta YA se cobró en el mostrador, la sincronización
 * la rechaza siempre (no es transitorio) y queda en la cola "con error".
 */
class PosRedondeoPanelVsApiTest extends TestCase
{
    private string $admin;

    private string $cajero;

    /** Lo que muestra y cobra el panel para 1 u. a neto 2068.595 (ver pos.hallazgo.test.js). */
    private const TOTAL_PANEL = 2502.99;

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

    /** Un producto a $2.503 de góndola en Mostrador, 10 u. en Central. */
    private function armarProducto(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Prov SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Aceite 1,5 L', 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 1000])->assertCreated()->json();
        $mostrador = collect($this->admin()->getJson('/api/listas')->json('listas'))->firstWhere('nombre', 'Mostrador');
        $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'modoPrecio' => 'precio', 'precioFijo' => 2503]]])->assertOk();
        $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 10, 'sucursalId' => $this->central()->id])->assertOk();

        $item = collect($this->cajero()->getJson('/api/ventas/catalogo')->assertOk()->json('items'))->firstWhere('key', 'p'.$p['id']);
        $this->assertEqualsWithDelta(2068.595, $item['precio'], 1e-9, 'el neto que recibe el POS');
        $this->assertEqualsWithDelta(2503.0, $item['precioFinal'], 1e-9, 'el precio de góndola');

        return [$p, $mostrador, $item['precio']];
    }

    public function test_cobro_online_con_el_total_que_muestra_el_panel(): void
    {
        [$p, $mostrador, $neto] = $this->armarProducto();
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();

        $v = $this->cajero()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id'], 'precioUnitario' => $neto]]])->assertCreated()->json();

        // El CobroModal precarga "efectivo por el total" del panel.
        $r = $this->cajero()->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => self::TOTAL_PANEL]]]);

        $this->assertSame(200, $r->status(), 'El panel cobra $'.self::TOTAL_PANEL.' y la API calcula $'.$v['total'].': '.($r->json('message') ?? ''));
    }

    public function test_venta_offline_cobrada_con_el_total_del_panel_entra_al_sincronizar(): void
    {
        [$p, $mostrador, $neto] = $this->armarProducto();
        $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();

        $r = $this->cajero()->postJson('/api/ventas/offline-lote', ['ventas' => [[
            'idLocal' => 'hallazgo-redondeo',
            'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id'], 'precioUnitario' => $neto]],
            'pagos' => [['medio' => 'efectivo', 'importe' => self::TOTAL_PANEL]],
        ]]])->assertOk()->json('resultados');

        $this->assertTrue($r[0]['ok'], 'La venta ya cobrada en el mostrador se rechaza al sincronizar: '.($r[0]['motivo'] ?? ''));
        $this->assertSame(1, DB::table('ventas')->where('idempotencia_offline', 'hallazgo-redondeo')->count());
    }
}
