<?php

namespace Tests\Feature;

use App\Ventas\Portero;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * El servidor es quien decide el precio: lo que manda el panel se valida, no se
 * obedece. Cubre lo que quedaba abierto en presupuestos (la cotización se honra
 * sin `precio_manual`), ofertas (combo y % al ticket sin techo, vigencia que no
 * se miraba), el monto mayorista (se medía con importes del body) y las listas
 * de cliente (una puerta a precios más bajos, sin llave).
 */
class PreciosDelServidorTest extends TestCase
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

    /** Un producto granel a $400/kg de costo, Mostrador +50% (neto 600 / final 726) y Mayorista +20% (neto 480) desde 10 kg. */
    private function producto(string $nombre, int $provId): array
    {
        $p = $this->admin()->postJson('/api/productos', ['nombre' => $nombre, 'esGranel' => true, 'iva' => 21, 'proveedorId' => $provId, 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $provId, 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $listas = $this->listas();

        return $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [
            ['listaId' => $listas['mostrador']['id'], 'markup' => 50], ['listaId' => $listas['mayorista']['id'], 'markup' => 20, 'unidadesMinimas' => 10],
        ]])->assertOk()->json();
    }

    private function listas(): array
    {
        $todas = $this->admin()->getJson('/api/listas')->json('listas');

        return ['mostrador' => collect($todas)->firstWhere('nombre', 'Mostrador'), 'mayorista' => collect($todas)->firstWhere('nombre', 'Mayorista')];
    }

    /** @return array{0: array, 1: array} harina y azúcar */
    private function dosProductos(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();

        return [$this->producto('Harina 000', $prov['id']), $this->producto('Azúcar', $prov['id'])];
    }

    private function renglon(array $p, float $cantidad, array $extra = []): array
    {
        return ['productoId' => $p['id'], 'cantidad' => $cantidad, 'listaId' => $this->listas()['mostrador']['id'], 'precioUnitario' => 600, ...$extra];
    }

    private function borrador(string $quien, array $items, int $esperado, ?string $contiene = null): void
    {
        $r = $this->$quien()->postJson('/api/ventas', ['estado' => 'borrador', 'items' => $items])->assertStatus($esperado);
        if ($contiene !== null) {
            $this->assertStringContainsString($contiene, (string) $r->json('message'));
        }
    }

    /* ------------------------------ Presupuestos ------------------------------ */

    public function test_el_cajero_no_puede_cotizar_a_un_precio_inventado(): void
    {
        [$harina] = $this->dosProductos();
        $mostrador = $this->listas()['mostrador'];
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Bar La Esquina'])->assertCreated()->json();
        $item = fn (float $precio, array $extra = []) => ['productoId' => $harina['id'], 'cantidad' => 10, 'precioLista' => $precio, 'listaId' => $mostrador['id'], ...$extra];

        // El precio inventado no pasa; el de la lista, sí.
        $this->cajero()->postJson('/api/presupuestos', ['clienteId' => $cli['id'], 'items' => [$item(0.01)]])
            ->assertStatus(400)->assertJsonPath('message', fn ($m) => str_contains($m, 'permiso para pisar precios'));
        $pr = $this->cajero()->postJson('/api/presupuestos', ['clienteId' => $cli['id'], 'items' => [$item(600, ['iva' => 0])]])->assertCreated()->json();

        // El IVA sale del producto, no del body.
        $this->assertEquals(21.0, (float) DB::table('presupuesto_items')->where('presupuesto_id', $pr['id'])->value('iva'));
        // Y editarlo a un precio inventado tampoco.
        $this->cajero()->patchJson('/api/presupuestos/'.$pr['id'], ['items' => [$item(0.01)]])->assertStatus(400);

        // Quien tiene `precio_manual` sí puede cotizar a otro precio.
        $this->admin()->postJson('/api/presupuestos', ['clienteId' => $cli['id'], 'items' => [$item(450)]])->assertCreated();
    }

    /* ------------------------------ Combos ------------------------------ */

    private function combo(array $harina, array $azucar, float $precio = 1300, array $extra = []): array
    {
        return $this->admin()->postJson('/api/ofertas', ['nombre' => 'Combo dulce', 'tipo' => 'combo', 'precio' => $precio,
            'componentes' => [['productoId' => $harina['id'], 'cantidad' => 1], ['productoId' => $azucar['id'], 'cantidad' => 1]], ...$extra])->assertCreated()->json();
    }

    public function test_un_combo_descuenta_hasta_lo_que_ahorra_con_los_componentes_completos(): void
    {
        [$harina, $azucar] = $this->dosProductos();
        $combo = $this->combo($harina, $azucar);   // 1 + 1 a $1.300 final; suelto valen $1.452 → ahorra $152 por conjunto
        $con = fn (float $desc) => ['ofertaId' => $combo['id'], 'oferta' => 'Combo dulce', 'ofertaDescuento' => $desc];

        // Sin el otro componente en el ticket no hay combo: el descuento declarado no vale.
        $this->borrador('cajero', [$this->renglon($harina, 5, $con(99999))], 400, 'necesita todos sus componentes');
        // Con los dos, no se puede descontar más de lo que ahorra el combo.
        $this->borrador('cajero', [$this->renglon($harina, 1, $con(99999)), $this->renglon($azucar, 1)], 400, 'descuenta hasta');
        // Lo legítimo (2 conjuntos = $304 final = $125,62 neto por renglón) pasa.
        $this->borrador('cajero', [$this->renglon($harina, 2, $con(125.62)), $this->renglon($azucar, 2, $con(125.62))], 201);
    }

    public function test_el_regalo_en_un_combo_de_un_solo_renglon_ya_no_pasa(): void
    {
        [$harina, $azucar] = $this->dosProductos();
        $combo = $this->combo($harina, $azucar);

        $this->borrador('cajero', [$this->renglon($harina, 5, ['ofertaId' => $combo['id'], 'oferta' => 'x', 'ofertaDescuento' => 3000]), $this->renglon($azucar, 1)], 400);
    }

    /* ------------------------------ % al ticket ------------------------------ */

    public function test_la_oferta_al_ticket_tiene_techo_y_monto_minimo(): void
    {
        [$harina] = $this->dosProductos();
        $o = $this->admin()->postJson('/api/ofertas', ['nombre' => '10% al ticket', 'tipo' => 'ticket', 'porcentaje' => 10, 'montoMinimo' => 5000])->assertCreated()->json();
        $con = fn (float $desc) => ['ofertaId' => $o['id'], 'oferta' => '10% al ticket', 'ofertaDescuento' => $desc];

        // 2 kg → $1.452 con IVA: no llega al mínimo.
        $this->borrador('cajero', [$this->renglon($harina, 2, $con(120))], 400, 'pide un ticket de al menos');
        // 9 kg → $6.534 con IVA: llega. El 10% de $5.400 neto son $540: más no.
        $this->borrador('cajero', [$this->renglon($harina, 9, $con(900))], 400, 'descuenta hasta');
        $this->borrador('cajero', [$this->renglon($harina, 9, $con(540))], 201);
    }

    /* ------------------------------ Vigencia ------------------------------ */

    public function test_una_oferta_vencida_fuera_de_dia_o_de_otra_sucursal_no_se_aplica(): void
    {
        [$harina] = $this->dosProductos();
        $crear = fn (array $extra) => $this->admin()->postJson('/api/ofertas', ['nombre' => '10% harina', 'tipo' => 'porcentaje', 'porcentaje' => 10,
            'alcances' => [['tipo' => 'producto', 'refId' => $harina['id']]], ...$extra])->assertCreated()->json();
        $hoy = Carbon::now(Portero::ZONA);
        $con = fn (array $o) => ['ofertaId' => $o['id'], 'oferta' => '10% harina', 'ofertaDescuento' => 120];

        $vencida = $crear(['hasta' => $hoy->copy()->subDay()->format('Y-m-d H:i:s')]);
        $this->borrador('cajero', [$this->renglon($harina, 2, $con($vencida))], 400, 'ya venció');
        $this->admin()->deleteJson('/api/ofertas/'.$vencida['id']);

        $futura = $crear(['desde' => $hoy->copy()->addDay()->format('Y-m-d H:i:s')]);
        $this->borrador('cajero', [$this->renglon($harina, 2, $con($futura))], 400, 'todavía no empezó');
        $this->admin()->deleteJson('/api/ofertas/'.$futura['id']);

        $mascara = str_repeat('1', 7);
        $mascara[$hoy->dayOfWeekIso - 1] = '0';
        $otroDia = $crear(['dias' => $mascara]);
        $this->borrador('cajero', [$this->renglon($harina, 2, $con($otroDia))], 400, 'no corre hoy');
        $this->admin()->deleteJson('/api/ofertas/'.$otroDia['id']);

        $otraSucursal = $crear(['sucursales' => '999']);
        $this->borrador('cajero', [$this->renglon($harina, 2, $con($otraSucursal))], 400, 'no corre en esta sucursal');
        $this->admin()->deleteJson('/api/ofertas/'.$otraSucursal['id']);

        // La vigente, hoy, en esta sucursal: pasa.
        $vigente = $crear(['desde' => $hoy->copy()->subDay()->format('Y-m-d H:i:s'), 'hasta' => $hoy->copy()->addDay()->format('Y-m-d H:i:s'), 'sucursales' => (string) $this->central()->id]);
        $this->borrador('cajero', [$this->renglon($harina, 2, $con($vigente))], 201);
    }

    /* ------------------------------ Mayorista por monto ------------------------------ */

    public function test_el_monto_mayorista_no_se_abre_con_un_precio_de_lista_inflado(): void
    {
        [$harina] = $this->dosProductos();
        $may = $this->listas()['mayorista'];
        $this->admin()->putJson('/api/configuracion/ventas', ['montoMinimoMayorista' => 5000, 'modalidadMontoId' => $may['modalidadId']])->assertOk();
        $mayorista = fn (float $cant, array $extra = []) => ['productoId' => $harina['id'], 'cantidad' => $cant, 'listaId' => $may['id'], ...$extra];

        // 4 kg ($2.400 neto) no llegan a $5.000: el precioLista inflado del body no cambia eso.
        $this->borrador('cajero', [$mayorista(4, ['precioLista' => 99999999])], 400, 'no habilita la lista');
        // 9 kg ($5.400 neto en mostrador) sí llegan, sin ayuda del body.
        $this->borrador('cajero', [$mayorista(9)], 201);
    }

    /* ------------------------------ Listas del cliente ------------------------------ */

    public function test_asignar_listas_a_un_cliente_pide_la_llave_de_precios(): void
    {
        $this->dosProductos();
        $may = $this->listas()['mayorista'];

        $this->cajero()->postJson('/api/clientes', ['nombre' => 'Nuevo', 'listas' => [$may['id']]])->assertStatus(403);
        $cli = $this->cajero()->postJson('/api/clientes', ['nombre' => 'Nuevo'])->assertCreated()->json();
        $this->cajero()->putJson('/api/listas/cliente/'.$cli['id'], ['listas' => [$may['id']]])->assertStatus(403);
        $this->cajero()->patchJson('/api/clientes/'.$cli['id'], ['nombre' => 'Nuevo', 'listas' => [$may['id']]])->assertStatus(403);
        // Guardar la ficha sin tocar las listas funciona igual.
        $this->cajero()->patchJson('/api/clientes/'.$cli['id'], ['nombre' => 'Nuevo SA', 'listas' => []])->assertOk();

        $this->admin()->putJson('/api/listas/cliente/'.$cli['id'], ['listas' => [$may['id']]])->assertOk();
        // Con la lista ya asignada, el cajero puede reenviarla tal cual (la ficha completa viaja entera).
        $this->cajero()->patchJson('/api/clientes/'.$cli['id'], ['nombre' => 'Nuevo SA', 'listas' => [$may['id']]])->assertOk();
    }
}
