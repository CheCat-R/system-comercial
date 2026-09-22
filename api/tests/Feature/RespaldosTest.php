<?php

namespace Tests\Feature;

use App\Inventario\OperacionesService;
use App\Models\Producto;
use App\Models\Proveedor;
use App\Models\Rol;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Sistema › Respaldos: la copia externa (volcado + rastro de descargas) y la
 * limpieza de fin de práctica (exclusiva del superadmin, con la palabra
 * tipeada como segundo seguro).
 */
class RespaldosTest extends TestCase
{
    private function comoSuperadmin(): static
    {
        return $this->conToken($this->loguear($this->superadmin(), 'admin1234'));
    }

    public function test_info_trae_tamano_tablas_y_resumen(): void
    {
        $res = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->assertOk();
        $this->assertNotEmpty($res->json('tamano'));
        $this->assertGreaterThan(0, $res->json('tablas'));
        $this->assertArrayHasKey('productos', $res->json('resumen'));
        $this->assertIsArray($res->json('descargas'));
    }

    public function test_descargar_deja_rastro_en_auditoria(): void
    {
        $antes = DB::table('auditoria')->where('ambito', 'Respaldos')->count();
        $res = $this->comoSuperadmin()->get('/api/sistema/respaldos/descargar')->assertOk();
        $this->assertStringContainsString('.sql', $res->headers->get('content-disposition'));
        // El streaming solo corre al consumir el cuerpo: forzarlo es lo que dispara el registro de auditoría.
        $this->assertStringContainsString('INSERT INTO', $res->streamedContent());

        $info = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->assertOk();
        $this->assertSame($antes + 1, DB::table('auditoria')->where('ambito', 'Respaldos')->count());
        $this->assertSame('Administrador', $info->json('descargas.0.usuario'));
    }

    /** El permiso `sistema.respaldos` alcanza para ver info y bajar la copia, pero NO para la limpieza: esa es del superadmin y de nadie más. */
    public function test_la_limpieza_es_exclusiva_del_superadmin(): void
    {
        $rol = Rol::query()->create(['clave' => 'auditor_sistema', 'nombre' => 'Auditor', 'permisos' => ['sistema.respaldos']]);
        $usuario = Usuario::query()->create(['nombre' => 'Auditor', 'rol_id' => $rol->id, 'password' => 'clave1234', 'activo' => true]);
        $token = $this->conToken($this->loguear($usuario, 'clave1234'));

        $token->getJson('/api/sistema/respaldos/info')->assertOk();
        $token->getJson('/api/sistema/respaldos/limpieza/ensayo')->assertForbidden();
        $token->postJson('/api/sistema/respaldos/limpieza', ['confirmar' => 'LIMPIAR'])->assertForbidden();
    }

    public function test_limpieza_exige_la_palabra_exacta(): void
    {
        $this->comoSuperadmin()->postJson('/api/sistema/respaldos/limpieza', ['confirmar' => 'limpiar'])
            ->assertStatus(422);
        $this->comoSuperadmin()->postJson('/api/sistema/respaldos/limpieza', [])
            ->assertStatus(422);
    }

    public function test_limpieza_vacia_la_operatoria_y_conserva_el_catalogo(): void
    {
        $central = $this->central();
        $molinos = Proveedor::query()->create(['nombre' => 'Molinos']);
        $harina = Producto::query()->create(['nombre' => 'Harina 000', 'tipo' => 'granel', 'iva' => 21]);
        DB::table('producto_proveedores')->insert([
            'producto_id' => $harina->id, 'proveedor_id' => $molinos->id, 'cantidad' => 25, 'costo' => 10000,
            'usar_para_precio' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        app(OperacionesService::class)->compra(['productoId' => $harina->id, 'cantidad' => 50, 'sucursalId' => $central->id, 'usuarioId' => $this->superadmin()->id]);
        $this->assertGreaterThan(0, DB::table('movimientos')->count());
        $this->assertGreaterThan(0, DB::table('stock')->count());

        $ensayo = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/limpieza/ensayo')->assertOk();
        $this->assertGreaterThan(0, $ensayo->json('total'));

        $this->comoSuperadmin()->postJson('/api/sistema/respaldos/limpieza', ['confirmar' => 'LIMPIAR'])
            ->assertOk()->assertJsonPath('ok', true);

        $this->assertSame(0, DB::table('movimientos')->count());
        $this->assertSame(0, DB::table('stock')->count());
        // El catálogo y los proveedores quedan intactos.
        $this->assertTrue(Producto::query()->whereKey($harina->id)->exists());
        $this->assertTrue(Proveedor::query()->whereKey($molinos->id)->exists());
    }
}
