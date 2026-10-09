<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Una operación fiscal a la vez por venta: confirmar, facturar, nota de crédito y anular comparten un candado,
 * así dos pedidos simultáneos no pueden pedir dos CAE a ARCA para la misma venta (el segundo se perdía en el
 * sistema pero vivía en ARCA).
 */
class CandadoFiscalTest extends TestCase
{
    private string $admin;

    private string $cajero;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        config(['checat.candado_fiscal_espera' => 1]);   // en el test no se espera 60 s a que se libere
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $this->cajero = $this->loguear($this->crearUsuario('Lucas', 'cajero'));
    }

    private function armarVenta(): array
    {
        $a = fn () => $this->conToken($this->admin);
        $prov = $a()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $a()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $mostrador = collect($a()->getJson('/api/listas')->json('listas'))->firstWhere('nombre', 'Mostrador');
        $a()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk();
        $a()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 10, 'sucursalId' => $this->central()->id])->assertOk();
        $a()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated();

        return $this->conToken($this->cajero)->postJson('/api/ventas', ['estado' => 'borrador', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
    }

    public function test_con_otra_operacion_fiscal_en_curso_no_se_confirma_ni_se_anula_ni_se_factura(): void
    {
        $v = $this->armarVenta();
        $otra = Cache::lock('venta-fiscal:'.$v['id'], 30);
        $this->assertTrue($otra->get());
        try {
            $c = $this->conToken($this->admin);
            foreach (['confirmar' => ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => $v['total']]]], 'facturar' => [], 'anular' => ['motivo' => 'prueba'], 'nota-credito' => ['motivo' => 'prueba']] as $accion => $body) {
                $c->postJson('/api/ventas/'.$v['id'].'/'.$accion, $body)->assertStatus(400)
                    ->assertJsonPath('message', fn ($m) => str_contains($m, 'otra operación fiscal en curso'));
            }
        } finally {
            $otra->release();
        }
        // Liberado el candado, la venta sigue intacta y se cobra normalmente.
        $this->conToken($this->cajero)->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => $v['total']]]])->assertOk();
    }

    public function test_el_candado_se_libera_aunque_la_operacion_falle(): void
    {
        $v = $this->armarVenta();
        $c = $this->conToken($this->cajero);
        // Pagos que no cierran: falla adentro del candado.
        $c->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => 1]]])->assertStatus(400);
        $c->postJson('/api/ventas/'.$v['id'].'/confirmar', ['tipo' => 'ticket', 'pagos' => [['medio' => 'efectivo', 'importe' => $v['total']]]])->assertOk();
    }
}
