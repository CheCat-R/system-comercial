<?php

namespace Tests\Feature;

use App\Models\Usuario;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Quien solo tiene el permiso de "Órdenes web" atiende los pedidos del sitio (pendientes): no puede cancelar un
 * presupuesto confirmado (con stock reservado) ni ninguno que no sea una orden web pendiente.
 */
class PresupuestosOrdenesWebPermisoTest extends TestCase
{
    private string $admin;

    private string $atencionWeb;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $rol = $this->conToken($this->admin)->postJson('/api/roles', ['nombre' => 'Atención web', 'permisos' => ['ver', 'ventas.ordenes']])->assertCreated()->json();
        $u = Usuario::query()->create(['nombre' => 'Mica', 'rol_id' => $rol['id'], 'password' => 'clave1234', 'activo' => true]);
        $this->atencionWeb = $this->loguear($u);
    }

    private function presupuesto(): int
    {
        $a = fn () => $this->conToken($this->admin);
        $prov = $a()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $a()->postJson('/api/productos', ['nombre' => 'Harina 000', 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $mostrador = collect($a()->getJson('/api/listas')->json('listas'))->firstWhere('nombre', 'Mostrador');
        $a()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk();
        $cli = $a()->postJson('/api/clientes', ['nombre' => 'Juan Perez'])->assertCreated()->json();

        return $a()->postJson('/api/presupuestos', ['clienteId' => $cli['id'], 'items' => [['productoId' => $p['id'], 'cantidad' => 2, 'listaId' => $mostrador['id'], 'precioLista' => 600]]])->assertCreated()->json('id');
    }

    public function test_con_solo_ordenes_web_no_se_cancela_un_presupuesto_que_no_es_una_orden_pendiente(): void
    {
        $id = $this->presupuesto();   // presupuesto común, en borrador

        $this->conToken($this->atencionWeb)->postJson('/api/presupuestos/'.$id.'/cancelar', ['motivo' => 'x'])->assertStatus(403);
        $this->assertNotSame('cancelado', DB::table('presupuestos')->where('id', $id)->value('estado'));

        // Quien gestiona presupuestos sí puede.
        $this->conToken($this->admin)->postJson('/api/presupuestos/'.$id.'/cancelar', ['motivo' => 'x'])->assertOk();
    }

    public function test_con_solo_ordenes_web_si_se_rechaza_un_pedido_del_sitio_pendiente(): void
    {
        $id = $this->presupuesto();
        DB::table('presupuestos')->where('id', $id)->update(['origen' => 'web', 'estado' => 'pendiente']);

        $this->conToken($this->atencionWeb)->postJson('/api/presupuestos/'.$id.'/cancelar', ['motivo' => 'sin stock'])->assertOk();
        $this->assertSame('cancelado', DB::table('presupuestos')->where('id', $id)->value('estado'));
    }
}
