<?php

namespace Tests\Feature;

use App\Auth\PlanCatalogo;
use App\Models\Rol;
use App\Models\Sucursal;
use App\Models\Usuario;
use App\Services\LicenciaService;
use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Quién puede abrir qué por id. El listado ya filtraba por sucursal, pero pedir el
 * id a mano (o el id de una imputación, de un adjunto…) devolvía lo de cualquier
 * sucursal; y en Usuarios, "no se otorga lo que no se tiene" no cubría editar.
 */
class AlcanceDeSucursalTest extends TestCase
{
    private string $admin;

    private int $central;

    private int $otra;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->admin = $this->loguear($this->superadmin(), 'admin1234');
        $this->central = $this->central()->id;
        $this->otra = (int) Sucursal::query()->where('id', '!=', $this->central)->value('id');
    }

    private function admin(): static
    {
        return $this->conToken($this->admin);
    }

    /** El TOKEN de un usuario con un rol a medida (permisos exactos), logueado en la sucursal indicada. */
    private function como(string $nombre, array $permisos, int $sucursalId): string
    {
        $rol = Rol::query()->create(['clave' => 'rol_'.strtolower($nombre), 'nombre' => 'Rol '.$nombre, 'descripcion' => '', 'permisos' => $permisos, 'es_sistema' => false]);
        $u = Usuario::query()->create(['nombre' => $nombre, 'rol_id' => $rol->id, 'password' => 'clave1234', 'activo' => true]);

        return $this->loguear($u, 'clave1234', $sucursalId);
    }

    private function cajeroDe(string $nombre, int $sucursalId): string
    {
        return $this->loguear($this->crearUsuario($nombre, 'cajero'), 'clave1234', $sucursalId);
    }

    /** Harina granel (Mostrador neto 600) con stock en las dos sucursales, y la caja de Central abierta. */
    private function armarHarina(): array
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Molinos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $p = $this->admin()->postJson('/api/productos', ['nombre' => 'Harina 000', 'esGranel' => true, 'iva' => 21, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$p['id'].'/formatos-compra', ['items' => [['id' => $p['formatosCompra'][0]['id'], 'proveedorId' => $prov['id'], 'cantidad' => 25, 'costo' => 10000, 'usarParaPrecio' => true]]])->assertOk();
        $mostrador = collect($this->admin()->getJson('/api/listas')->json('listas'))->firstWhere('nombre', 'Mostrador');
        $p = $this->admin()->putJson('/api/productos/'.$p['id'].'/listas', ['items' => [['listaId' => $mostrador['id'], 'markup' => 50]]])->assertOk()->json();
        foreach ([$this->central, $this->otra] as $suc) {
            $this->admin()->postJson('/api/operaciones/movimiento', ['productoId' => $p['id'], 'tipo' => 'devolucion', 'cantidad' => 20, 'sucursalId' => $suc])->assertOk();
        }
        $turno = $this->admin()->postJson('/api/caja/abrir', ['montoInicial' => 1000])->assertCreated()->json();

        return [$p, $mostrador, $prov, $turno];
    }

    /* ------------------------------ Ventas y recibos ------------------------------ */

    public function test_una_venta_de_otra_sucursal_no_se_abre_por_id_y_los_costos_son_de_quien_tiene_la_llave(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $v = $this->admin()->postJson('/api/ventas', ['items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]], 'pagos' => [['medio' => 'efectivo', 'importe' => 726]]])->assertCreated()->json();

        $this->conToken($this->cajeroDe('Ana', $this->otra))->getJson('/api/ventas/'.$v['id'])->assertStatus(403);

        $suya = $this->conToken($this->cajeroDe('Beto', $this->central))->getJson('/api/ventas/'.$v['id'])->assertOk()->json();
        $this->assertArrayNotHasKey('costoUnitario', $suya['items'][0], 'el costo (el margen) no es del cajero');
        $this->assertArrayNotHasKey('porcSinFactura', $suya['items'][0]);
        $this->assertArrayHasKey('precioUnitario', $suya['items'][0]);

        $this->assertArrayHasKey('costoUnitario', $this->admin()->getJson('/api/ventas/'.$v['id'])->assertOk()->json('items.0'));
        // El listado con renglones tampoco lleva costos al cajero.
        $filas = $this->conToken($this->cajeroDe('Carla', $this->central))->getJson('/api/ventas?incluirItems=true')->assertOk()->json();
        $this->assertNotEmpty($filas);
        foreach ($filas as $f) {
            foreach ($f['items'] ?? [] as $it) {
                $this->assertArrayNotHasKey('costoUnitario', $it);
            }
        }
    }

    public function test_un_recibo_de_otra_sucursal_no_se_abre_por_id(): void
    {
        [$p, $mostrador] = $this->armarHarina();
        $cli = $this->admin()->postJson('/api/clientes', ['nombre' => 'Almacén Norte', 'tipoDoc' => 'dni', 'numeroDoc' => '30111222', 'ctaCteHabilitada' => true])->assertCreated()->json();
        $cc = $this->admin()->postJson('/api/ventas', ['clienteId' => $cli['id'], 'condicionPago' => 'cuenta_corriente', 'items' => [['productoId' => $p['id'], 'cantidad' => 1, 'listaId' => $mostrador['id']]]])->assertCreated()->json();
        $r = $this->admin()->postJson('/api/cobranzas', ['clienteId' => $cli['id'], 'pagos' => [['medio' => 'efectivo', 'importe' => 726]], 'imputaciones' => [['ventaId' => $cc['id'], 'importe' => 726]]])->assertCreated()->json();

        $this->conToken($this->cajeroDe('Ana', $this->otra))->getJson('/api/cobranzas/'.$r['id'])->assertStatus(403);
        $this->conToken($this->cajeroDe('Beto', $this->central))->getJson('/api/cobranzas/'.$r['id'])->assertOk();
    }

    /* ------------------------------ Pagos a proveedor ------------------------------ */

    public function test_un_pago_a_proveedor_solo_lo_toca_la_sucursal_que_lo_hizo(): void
    {
        [, , $prov, $turno] = $this->armarHarina();
        $beto = $this->cajeroDe('Beto', $this->central);
        $pago = $this->conToken($beto)->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 10000, 'medio' => 'efectivo', 'cajaSesionId' => $turno['id'], 'concepto' => 'pedido aceite'])->assertCreated()->json();

        $ana = $this->cajeroDe('Ana', $this->otra);
        $this->conToken($ana)->getJson('/api/pagos-proveedor/'.$pago['id'])->assertStatus(403);
        $this->conToken($ana)->postJson('/api/pagos-proveedor/'.$pago['id'].'/anular', ['motivo' => 'x'])->assertStatus(403);
        $this->conToken($ana)->patchJson('/api/pagos-proveedor/'.$pago['id'].'/papel', ['referencia' => 'x'])->assertStatus(403);
        $this->assertSame('activo', DB::table('proveedor_pagos')->find($pago['id'])->estado, 'el pago de la otra sucursal sigue vigente');

        // La suya sí: Beto puede ver y anular el pago que hizo desde su caja.
        $this->conToken($beto)->getJson('/api/pagos-proveedor/'.$pago['id'])->assertOk();
        $this->conToken($beto)->postJson('/api/pagos-proveedor/'.$pago['id'].'/anular', ['motivo' => 'me equivoqué'])->assertOk();
    }

    public function test_la_cajera_no_reasigna_pagos_ya_hechos(): void
    {
        [, , $prov, $turno] = $this->armarHarina();
        $beto = $this->cajeroDe('Beto', $this->central);
        $pago = $this->conToken($beto)->postJson('/api/pagos-proveedor', ['proveedorId' => $prov['id'], 'importe' => 10000, 'medio' => 'efectivo', 'cajaSesionId' => $turno['id'], 'concepto' => 'pedido aceite'])->assertCreated()->json();

        // El rol Cajero trae la SECCIÓN de pagos a proveedor (la bandeja), pero no la acción de imputar.
        $this->conToken($beto)->postJson('/api/pagos-proveedor/'.$pago['id'].'/imputar', ['imputaciones' => [['gastoId' => 1, 'importe' => 1]]])->assertStatus(403);
        $this->conToken($beto)->patchJson('/api/pagos-proveedor/'.$pago['id'].'/destino', ['destino' => 'gastos'])->assertStatus(403);
        $this->conToken($beto)->deleteJson('/api/pagos-proveedor/imputaciones/1')->assertStatus(403);
    }

    /* ------------------------------ Gastos ------------------------------ */

    public function test_un_gasto_de_otra_sucursal_y_sus_comprobantes_no_se_abren_por_id(): void
    {
        $boot = $this->admin()->getJson('/api/gastos/bootstrap')->assertOk()->json();
        $rubro = collect($boot['categorias'])->firstWhere('nombre', 'Alquiler');
        $g = $this->admin()->postJson('/api/gastos', ['categoriaId' => $rubro['id'], 'tipoDoc' => 'ticket', 'letra' => 'B', 'sucursalId' => $this->central,
            'items' => [['concepto' => 'Alquiler local', 'monto' => 1000]], 'condicionPago' => 'cuenta_corriente'])->assertCreated()->json();
        $png = 'data:image/png;base64,'.base64_encode(base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
        $adj = $this->admin()->postJson('/api/gastos/'.$g['id'].'/adjuntos', ['nombre' => 'ticket.png', 'data' => $png])->assertCreated()->json();

        $ana = $this->como('Ana', ['gastos.gastos', 'gastos.pagos'], $this->otra);
        $this->conToken($ana)->getJson('/api/gastos/'.$g['id'])->assertStatus(403);
        $this->conToken($ana)->getJson('/api/gastos/adjuntos/'.$adj['id'])->assertStatus(403);
        $this->conToken($ana)->postJson('/api/gastos/'.$g['id'].'/adjuntos', ['nombre' => 'x.png', 'data' => $png])->assertStatus(403);
        $this->conToken($ana)->deleteJson('/api/gastos/adjuntos/'.$adj['id'])->assertStatus(403);
        $this->assertSame(1, DB::table('gasto_adjuntos')->where('gasto_id', $g['id'])->count(), 'los comprobantes de la otra sucursal siguen ahí');

        $beto = $this->como('Beto', ['gastos.gastos', 'gastos.pagos'], $this->central);
        $this->conToken($beto)->getJson('/api/gastos/'.$g['id'])->assertOk();
        $this->conToken($beto)->getJson('/api/gastos/adjuntos/'.$adj['id'])->assertOk();
    }

    /* ------------------------------ Vencimientos ------------------------------ */

    public function test_los_vencimientos_de_otra_sucursal_no_se_ven_ni_se_procesan(): void
    {
        [$p] = $this->armarHarina();
        $sesion = $this->admin()->postJson('/api/vencimientos/sesiones', ['sucursalId' => $this->otra, 'items' => [['productoId' => $p['id'], 'cantidad' => 5, 'fechaVencimiento' => '2030-01-01']]])->assertCreated()->json();
        $id = (int) DB::table('vencimientos')->value('id');
        $this->assertGreaterThan(0, $id);

        $beto = $this->como('Beto', ['almacen.vencimientos', 'inventario'], $this->central);
        $this->assertCount(0, $this->conToken($beto)->getJson('/api/vencimientos')->assertOk()->json(), 'no ve los de otra sucursal');
        $this->assertSame(0, $this->conToken($beto)->getJson('/api/vencimientos/resumen')->assertOk()->json('vigentes.n'));
        $this->conToken($beto)->putJson('/api/vencimientos/'.$id, ['cantidad' => 500])->assertStatus(404);
        $this->conToken($beto)->postJson('/api/vencimientos/'.$id.'/procesar', ['unidadesVendidas' => 0, 'generarMerma' => true])->assertStatus(404);
        $this->conToken($beto)->deleteJson('/api/vencimientos/'.$id)->assertStatus(404);
        $this->assertEquals(5.0, (float) DB::table('vencimientos')->where('id', $id)->value('cantidad'));
        $this->assertSame(20.0, (float) DB::table('stock')->where('producto_id', $p['id'])->where('sucursal_id', $this->otra)->where('estado', 'disponible')->sum('cantidad'), 'no se dio de baja stock ajeno');

        // Quien está en esa sucursal sí, y el jefe ve todo.
        $ana = $this->como('Ana', ['almacen.vencimientos', 'inventario'], $this->otra);
        $this->assertCount(1, $this->conToken($ana)->getJson('/api/vencimientos')->assertOk()->json());
        $this->assertCount(1, $this->admin()->getJson('/api/vencimientos')->assertOk()->json());
    }

    /* ------------------------------ Transferencias ------------------------------ */

    public function test_quien_pide_una_transferencia_pide_para_su_sucursal(): void
    {
        [$p] = $this->armarHarina();
        $ana = $this->como('Ana', ['almacen.transferencias', 'pedidos'], $this->otra);

        // Intenta armar un pedido "de" Central hacia Central: el destino es SIEMPRE el de su sesión.
        $r = $this->conToken($ana)->postJson('/api/transferencias', ['origenId' => $this->central, 'destinoId' => $this->central, 'items' => [['productoId' => $p['id'], 'cantidad' => 1]]]);

        $r->assertStatus(201);
        $this->assertSame($this->otra, (int) DB::table('transferencias')->find($r->json('id'))->destino_id, 'pidió para Central, quedó para su sucursal');
    }

    /* ------------------------------ Usuarios ------------------------------ */

    public function test_no_se_modifica_a_un_usuario_con_mas_permisos_que_uno(): void
    {
        $encargado = $this->admin()->postJson('/api/roles', ['nombre' => 'Encargado', 'permisos' => ['ver', 'cta_cte', 'sistema.licencia']])->assertCreated()->json();
        $u = $this->admin()->postJson('/api/usuarios', ['nombre' => 'Elena', 'password' => 'clave-larga-1', 'rolId' => $encargado['id']])->assertCreated()->json();

        $ana = $this->loguear($this->crearUsuario('Ana', 'admin'));   // Administrador: no tiene cta_cte ni sistema.licencia

        $this->conToken($ana)->patchJson('/api/usuarios/'.$u['id'], ['password' => 'Temporal123'])->assertStatus(403);
        $this->conToken($ana)->patchJson('/api/usuarios/'.$u['id'], ['activo' => false])->assertStatus(403);
        $this->assertTrue((bool) Usuario::query()->find($u['id'])->activo);

        // El superadmin sí, y queda el rastro de qué hizo.
        $this->admin()->patchJson('/api/usuarios/'.$u['id'], ['password' => 'Temporal123', 'activo' => false])->assertOk();
        $rastro = DB::table('auditoria')->where('entidad', 'usuario')->where('entidad_id', $u['id'])->pluck('campo')->all();
        $this->assertContains('Contraseña', $rastro);
        $this->assertContains('Estado', $rastro);
    }

    public function test_reactivar_usuarios_respeta_el_limite_del_plan(): void
    {
        app(LicenciaService::class)->fijar('emprendedor');
        $limite = PlanCatalogo::limite('emprendedor', 'usuarios');
        $this->assertNotNull($limite);
        $activos = Usuario::query()->where('activo', true)->count();
        for ($i = 0; $activos + $i < $limite; $i++) {
            $this->crearUsuario('Relleno'.$i, 'cajero');
        }
        $baja = $this->crearUsuario('Dado de baja', 'cajero', 'clave1234', false);

        $this->admin()->patchJson('/api/usuarios/'.$baja->id, ['activo' => true])->assertStatus(422);
        $this->assertFalse((bool) $baja->fresh()->activo);
    }

    public function test_la_contrasena_propia_no_se_cambia_por_la_pantalla_de_usuarios(): void
    {
        $ana = $this->crearUsuario('Ana', 'admin');
        $token = $this->loguear($ana);

        $this->conToken($token)->patchJson('/api/usuarios/'.$ana->id, ['password' => 'otra-clave-nueva-1'])->assertStatus(422)->assertJsonValidationErrors('password');
        // Lo demás de su ficha se guarda igual.
        $this->conToken($token)->patchJson('/api/usuarios/'.$ana->id, ['nombre' => 'Ana María'])->assertOk();
    }

    public function test_el_rol_administrador_lo_edita_solo_el_superadmin(): void
    {
        $roles = $this->admin()->getJson('/api/roles')->json();
        $rolAdmin = collect($roles)->firstWhere('clave', 'admin');
        $this->assertNotNull($rolAdmin);
        $ana = $this->loguear($this->crearUsuario('Ana', 'admin'));
        $antes = $this->rol('admin')->permisos;

        $this->conToken($ana)->patchJson('/api/roles/'.$rolAdmin['id'], ['permisos' => ['ver']])->assertStatus(403);
        $this->assertSame($antes, $this->rol('admin')->fresh()->permisos, 'el rol Administrador sigue como estaba');

        $this->admin()->patchJson('/api/roles/'.$rolAdmin['id'], ['descripcion' => 'Dueño o gerente'])->assertOk();
    }
}
