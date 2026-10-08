<?php

namespace Tests\Feature;

use App\Ventas\VentasService;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * El lote offline (`POST /ventas/offline-lote`): una venta que YA se cobró en
 * el mostrador tiene que quedar registrada tal cual se cobró, una sola vez, y
 * una fila rota no puede frenar a las demás.
 */
class OfflineSincronizacionTest extends TestCase
{
    private string $admin;

    private string $cajero;

    private int $cajeroId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $u = $this->crearUsuario('Lucas', 'cajero');
        $this->cajeroId = $u->id;
        $this->cajero = $this->loguear($u);
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

    private function abrirCaja(float $fondo = 1000): array
    {
        return $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => $fondo])->assertCreated()->json();
    }

    private function stockDisponible(int $productoId): float
    {
        return (float) DB::table('stock')->where('producto_id', $productoId)->whereNull('presentacion_id')->where('estado', 'disponible')->sum('cantidad');
    }

    /** Una fila como la arma el POS: 1 kg de harina a $726 en efectivo, más lo que se le pase. */
    private function fila(array $p, array $mostrador, string $idLocal, array $extra = []): array
    {
        return ['idLocal' => $idLocal, 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id'], 'precioUnitario' => 600]],
            'pagos' => [['medio' => 'efectivo', 'importe' => 726]], ...$extra];
    }

    private function sincronizar(array ...$filas): array
    {
        return $this->cajero()->postJson('/api/ventas/offline-lote', ['ventas' => $filas])->assertOk()->json('resultados');
    }

    public function test_la_venta_offline_conserva_el_cliente(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Juan Pérez', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222'])->assertCreated()->json();

        $r = $this->sincronizar($this->fila($p, $mostrador, 'off-cli', ['clienteId' => $cli['id']]));

        $this->assertTrue($r[0]['ok'], $r[0]['motivo'] ?? '');
        $this->assertSame($cli['id'], (int) DB::table('ventas')->find($r[0]['ventaId'])->cliente_id);
    }

    public function test_la_venta_offline_con_extras_y_observaciones_se_registra_completa(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();

        $r = $this->sincronizar($this->fila($p, $mostrador, 'off-extra', [
            'extras' => [['concepto' => 'Envío', 'importe' => 100, 'iva' => 21]], 'observaciones' => 'Para el sábado',
            'pagos' => [['medio' => 'efectivo', 'importe' => 847]],   // 726 + 121
        ]));

        $this->assertTrue($r[0]['ok'], $r[0]['motivo'] ?? '');
        $venta = DB::table('ventas')->find($r[0]['ventaId']);
        $this->assertEquals(847.0, (float) $venta->total);
        $this->assertSame(1, DB::table('venta_extras')->where('venta_id', $venta->id)->where('concepto', 'Envío')->count());
        $this->assertStringContainsString('Para el sábado', $venta->observaciones);
    }

    public function test_el_redondeo_del_cobro_viaja_y_queda_como_extra(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();

        // 726 → 800: los pagos suman 800 y el POS manda el redondeo aparte.
        $r = $this->sincronizar($this->fila($p, $mostrador, 'off-red', ['redondeo' => 74, 'pagos' => [['medio' => 'efectivo', 'importe' => 800]]]));

        $this->assertTrue($r[0]['ok'], $r[0]['motivo'] ?? '');
        $venta = DB::table('ventas')->find($r[0]['ventaId']);
        $this->assertEquals(800.0, (float) $venta->total);
        $this->assertEquals(74.0, (float) DB::table('venta_extras')->where('venta_id', $venta->id)->where('concepto', 'Redondeo')->value('importe'));
    }

    public function test_la_venta_queda_con_la_fecha_del_cobro_y_quien_cobro_pero_firma_la_sesion(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $cobro = Carbon::now()->subHours(2)->startOfMinute();

        $r = $this->sincronizar(
            $this->fila($p, $mostrador, 'off-fecha', ['cobradaEn' => $cobro->toIso8601String(), 'cobradoPor' => 'Marta']),
            $this->fila($p, $mostrador, 'off-futura', ['cobradaEn' => Carbon::now()->addDays(2)->toIso8601String()]),
            $this->fila($p, $mostrador, 'off-vieja', ['cobradaEn' => Carbon::now()->subDays(10)->toIso8601String()]),
        );

        $venta = DB::table('ventas')->find($r[0]['ventaId']);
        $this->assertEqualsWithDelta($cobro->timestamp, Carbon::parse($venta->fecha)->timestamp, 60, 'la fecha es la del cobro, no la de la sincronización');
        $this->assertStringContainsString('Cobrada sin conexión', $venta->observaciones);
        $this->assertStringContainsString('por Marta', $venta->observaciones);
        $this->assertSame($this->cajeroId, (int) $venta->usuario_id, 'firma quien sincroniza: el relevo no se acepta del cliente');
        // Una fecha futura o de hace 10 días no se respeta: se usa la de ahora.
        foreach ([1, 2] as $i) {
            $this->assertEqualsWithDelta(Carbon::now()->timestamp, Carbon::parse(DB::table('ventas')->find($r[$i]['ventaId'])->fecha)->timestamp, 120);
        }
    }

    public function test_lo_que_decide_el_servidor_no_se_toma_de_la_fila(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $otro = $this->crearUsuario('Pedro', 'cajero');
        $otro->update(['relevo_caja' => true]);

        $r = $this->sincronizar($this->fila($p, $mostrador, 'off-intruso', ['operadorId' => $otro->id, 'sucursalId' => 999, 'condicionPago' => 'cuenta_corriente', 'tipo' => 'factura_a']));

        $this->assertTrue($r[0]['ok'], $r[0]['motivo'] ?? '');
        $venta = DB::table('ventas')->find($r[0]['ventaId']);
        $this->assertSame($this->cajeroId, (int) $venta->usuario_id);
        $this->assertSame($this->central()->id, (int) $venta->sucursal_id);
        $this->assertSame('contado', $venta->condicion_pago);
        $this->assertNotSame('factura_a', $venta->tipo);
    }

    public function test_sin_turno_abierto_la_venta_espera_y_entra_sola_cuando_se_abre_la_caja(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $t = $this->abrirCaja();
        $this->admin()->postJson('/api/caja/'.$t['id'].'/cerrar', ['declaradoEfectivo' => 1000])->assertOk();

        $r = $this->sincronizar($this->fila($p, $mostrador, 'off-caja'));
        $this->assertFalse($r[0]['ok']);
        $this->assertTrue($r[0]['reintentar'], 'no es un rechazo: espera la apertura de la caja');
        $this->assertStringContainsString('turno de caja', $r[0]['motivo']);
        $this->assertSame(0, DB::table('ventas')->where('estado', 'confirmada')->count());

        $this->abrirCaja();
        $r = $this->sincronizar($this->fila($p, $mostrador, 'off-caja'));
        $this->assertTrue($r[0]['ok'], $r[0]['motivo'] ?? '');
    }

    public function test_dos_reintentos_a_la_vez_no_duplican_la_venta(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();
        $svc = app(VentasService::class);
        $opciones = ['sucursalSesion' => $this->central()->id, 'soloSuSucursal' => $this->central()->id, 'puedePisarPrecio' => false, 'esJefe' => false, 'usuarioId' => $this->cajeroId];
        $fila = $this->fila($p, $mostrador, 'off-race');
        $segundo = null;

        $hecho = false;
        DB::listen(function (QueryExecuted $q) use (&$hecho, &$segundo, $svc, $fila, $opciones) {
            if (! $hecho && str_contains($q->sql, '`idempotencia_offline` = ?') && str_starts_with($q->sql, 'select')) {
                $hecho = true;
                // El otro reintento entra justo ahora, mientras este todavía no grabó nada.
                $segundo = $svc->sincronizarOffline([$fila], $opciones);
            }
        });
        $primero = $svc->sincronizarOffline([$fila], $opciones);

        $this->assertTrue($primero['resultados'][0]['ok']);
        $this->assertFalse($segundo['resultados'][0]['ok']);
        $this->assertTrue($segundo['resultados'][0]['reintentar'], 'el segundo espera: cuando reintente ve que ya existe');
        $this->assertSame(1, DB::table('ventas')->where('estado', 'confirmada')->count());
        $this->assertEquals(19.0, $this->stockDisponible($p['id']));
        // Y el reintento posterior la devuelve tal cual, sin duplicar.
        $otra = $svc->sincronizarOffline([$fila], $opciones);
        $this->assertTrue($otra['resultados'][0]['yaExistia']);
        $this->assertSame(1, DB::table('ventas')->where('estado', 'confirmada')->count());
    }

    public function test_una_fila_mal_armada_se_informa_y_no_frena_a_las_demas(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $this->abrirCaja();

        $r = collect($this->sincronizar(
            $this->fila($p, $mostrador, 'off-ok-1'),
            ['idLocal' => 'off-rota', 'items' => [['cantidad' => 1]], 'pagos' => [['medio' => 'efectivo', 'importe' => 726]]],
            $this->fila($p, $mostrador, 'off-ok-2'),
        ))->keyBy('idLocal');

        $this->assertTrue($r['off-ok-1']['ok']);
        $this->assertTrue($r['off-ok-2']['ok']);
        $this->assertFalse($r['off-rota']['ok']);
        $this->assertArrayNotHasKey('reintentar', $r['off-rota']);
        $this->assertStringContainsString('mal armada', $r['off-rota']['motivo']);
        $this->assertSame(2, DB::table('ventas')->where('estado', 'confirmada')->count());
    }
}
