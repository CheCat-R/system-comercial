<?php

namespace Tests\Feature;

use App\Inventario\OperacionesService;
use App\Models\Producto;
use App\Models\Proveedor;
use App\Models\Rol;
use App\Models\Usuario;
use App\Services\LicenciaService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Sistema › Respaldos: la copia descargada (volcado + rastro de descargas) y la
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

    // ------------------------------------------------------------------
    // El aviso de la descarga (todos los planes)
    // ------------------------------------------------------------------

    private function sinOperatoria(): void
    {
        DB::table('ventas')->delete();
        DB::table('comprobantes')->delete();
    }

    private function rastroDeDescarga(int $diasAtras): void
    {
        DB::table('auditoria')->insert([
            'fecha' => now()->subDays($diasAtras), 'usuario_id' => null, 'entidad' => 'sistema', 'entidad_id' => 0,
            'ambito' => 'Respaldos', 'campo' => 'Descarga del respaldo', 'despues' => 'prueba',
        ]);
    }

    public function test_aviso_no_molesta_a_una_instalacion_vacia_pero_si_cuando_hay_datos(): void
    {
        $this->sinOperatoria();
        $aviso = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->assertOk()->json('aviso');
        $this->assertNull($aviso['ultimaDescarga']);
        $this->assertFalse($aviso['avisar'], 'sin nada cargado no hay qué proteger todavía');

        $this->crearComprobanteDePrueba();
        $aviso = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->assertOk()->json('aviso');
        $this->assertTrue($aviso['avisar'], 'con datos y ninguna copia afuera, se avisa');
    }

    public function test_aviso_salta_a_los_7_dias_y_se_apaga_al_bajar_una_copia(): void
    {
        $this->rastroDeDescarga(3);
        $aviso = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->json('aviso');
        $this->assertFalse($aviso['avisar']);
        $this->assertSame(3, $aviso['dias']);

        DB::table('auditoria')->where('ambito', 'Respaldos')->delete();
        $this->rastroDeDescarga(10);
        $aviso = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->json('aviso');
        $this->assertTrue($aviso['avisar']);
        $this->assertSame(10, $aviso['dias']);
        $this->assertSame(1, $this->comoSuperadmin()->getJson('/api/sistema/respaldos/estado')->json('problemas'));

        $this->comoSuperadmin()->get('/api/sistema/respaldos/descargar')->assertOk()->streamedContent();
        $this->assertFalse($this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->json('aviso.avisar'));
        $this->assertSame(0, $this->comoSuperadmin()->getJson('/api/sistema/respaldos/estado')->json('problemas'));
    }

    public function test_la_insignia_no_filtra_nada_a_quien_no_tiene_el_permiso(): void
    {
        $this->rastroDeDescarga(30);
        $rol = Rol::query()->create(['clave' => 'solo_empresa', 'nombre' => 'Empresa', 'permisos' => ['sistema.empresa']]);
        $u = Usuario::query()->create(['nombre' => 'Empleado', 'rol_id' => $rol->id, 'password' => 'clave1234', 'activo' => true]);
        $res = $this->conToken($this->loguear($u, 'clave1234'))->getJson('/api/sistema/respaldos/estado')->assertOk();
        $this->assertSame(0, $res->json('problemas'));
        $this->assertFalse($res->json('avisar'));
    }

    // ------------------------------------------------------------------
    // La copia diaria automática (Pymes y Corporativo)
    // ------------------------------------------------------------------

    /** Corre `$prueba` con las copias apuntando a una carpeta temporal propia, que se borra al terminar. */
    private function conCarpetaTemporal(callable $prueba): void
    {
        $carpeta = sys_get_temp_dir().DIRECTORY_SEPARATOR.'respaldos-test-'.uniqid();
        config(['checat.respaldos.carpeta' => $carpeta, 'checat.respaldos.retencion' => 2]);
        try {
            $prueba($carpeta);
        } finally {
            foreach (glob($carpeta.DIRECTORY_SEPARATOR.'*') ?: [] as $f) {
                @unlink($f);
            }
            @rmdir($carpeta);
        }
    }

    public function test_copia_automatica_genera_un_gzip_valido_y_restaurable(): void
    {
        $this->conCarpetaTemporal(function (string $carpeta) {
            app(LicenciaService::class)->fijar('pymes');
            $this->artisan('respaldos:automatico')->assertSuccessful();

            $archivos = glob($carpeta.DIRECTORY_SEPARATOR.'respaldo-auto-*.sql.gz');
            $this->assertCount(1, $archivos);
            $this->assertEmpty(glob($carpeta.DIRECTORY_SEPARATOR.'*.parcial'), 'no queda ningún archivo a medias');
            $sql = gzdecode(file_get_contents($archivos[0]));
            $this->assertNotFalse($sql, 'es un gzip válido');
            $this->assertStringContainsString('SET FOREIGN_KEY_CHECKS=0;', $sql);
            $this->assertStringContainsString('TRUNCATE TABLE `usuarios`;', $sql);
            $this->assertStringContainsString('INSERT INTO `usuarios`', $sql);
            $this->assertStringContainsString('SET FOREIGN_KEY_CHECKS=1;', $sql);

            $auto = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->assertOk()->json('automatico');
            $this->assertCount(1, $auto['copias']);
            $this->assertTrue($auto['ultimoIntento']['ok']);
            $this->assertFalse($auto['problema']);
        });
    }

    public function test_copia_automatica_conserva_solo_las_ultimas_n(): void
    {
        $this->conCarpetaTemporal(function (string $carpeta) {
            app(LicenciaService::class)->fijar('pymes');
            mkdir($carpeta, 0750, true);
            foreach (['2020-01-01-0300', '2020-01-02-0300', '2020-01-03-0300'] as $d) {
                file_put_contents("{$carpeta}/respaldo-auto-{$d}.sql.gz", gzencode('-- vieja'));
            }
            file_put_contents("{$carpeta}/notas.txt", 'no es una copia: no se toca');

            $this->artisan('respaldos:automatico')->assertSuccessful();

            $quedan = array_map('basename', glob($carpeta.DIRECTORY_SEPARATOR.'respaldo-auto-*.sql.gz'));
            $this->assertCount(2, $quedan, 'retención = 2');
            $this->assertNotContains('respaldo-auto-2020-01-01-0300.sql.gz', $quedan);
            $this->assertNotContains('respaldo-auto-2020-01-02-0300.sql.gz', $quedan);
            $this->assertFileExists("{$carpeta}/notas.txt");
        });
    }

    public function test_emprendedor_no_tiene_copia_automatica(): void
    {
        $this->conCarpetaTemporal(function (string $carpeta) {
            app(LicenciaService::class)->fijar('emprendedor');
            $this->artisan('respaldos:automatico')->assertSuccessful();
            $this->assertFalse(is_dir($carpeta), 'el comando no hace nada en Emprendedor');

            $this->assertNull($this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->assertOk()->json('automatico'));
            $this->comoSuperadmin()->getJson('/api/sistema/respaldos/automaticos')->assertForbidden();
            // La descarga manual y el aviso siguen siendo de todos los planes.
            $this->comoSuperadmin()->get('/api/sistema/respaldos/descargar')->assertOk();
        });
    }

    public function test_bajar_una_copia_automatica_cuenta_como_copia_externa_y_no_deja_leer_otros_archivos(): void
    {
        $this->conCarpetaTemporal(function (string $carpeta) {
            app(LicenciaService::class)->fijar('pymes');
            $this->artisan('respaldos:automatico')->assertSuccessful();
            $nombre = basename(glob($carpeta.DIRECTORY_SEPARATOR.'respaldo-auto-*.sql.gz')[0]);
            $this->rastroDeDescarga(30);
            $this->assertTrue($this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->json('aviso.avisar'));

            $res = $this->comoSuperadmin()->get('/api/sistema/respaldos/automaticos/'.$nombre)->assertOk();
            $this->assertNotFalse(gzdecode(file_get_contents($res->baseResponse->getFile()->getPathname())));
            $this->assertFalse($this->comoSuperadmin()->getJson('/api/sistema/respaldos/info')->json('aviso.avisar'), 'bajarla a esta máquina es llevarse una copia afuera');

            // Solo se sirven archivos con el nombre exacto de una copia nuestra.
            $this->comoSuperadmin()->get('/api/sistema/respaldos/automaticos/ultimo-intento.json')->assertNotFound();
            $this->comoSuperadmin()->get('/api/sistema/respaldos/automaticos/..%2F..%2F.env')->assertNotFound();
            $this->comoSuperadmin()->get('/api/sistema/respaldos/automaticos/respaldo-auto-2001-01-01-0300.sql.gz')->assertNotFound();
        });
    }

    public function test_avisa_si_la_copia_automatica_se_atrasa_o_si_el_ultimo_intento_fallo(): void
    {
        $this->conCarpetaTemporal(function (string $carpeta) {
            app(LicenciaService::class)->fijar('pymes');
            mkdir($carpeta, 0750, true);
            $vieja = "{$carpeta}/respaldo-auto-".now()->subDays(3)->format('Y-m-d-Hi').'.sql.gz';
            file_put_contents($vieja, gzencode('-- x'));

            $auto = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/automaticos')->assertOk()->json();
            $this->assertTrue($auto['atrasada'], 'más de 36 h sin una copia nueva: el programador del servidor no está corriendo');
            $this->assertTrue($auto['problema']);
            $this->assertSame(1, $this->comoSuperadmin()->getJson('/api/sistema/respaldos/estado')->json('problemas'));

            // La fecha es la del nombre: tocar el archivo (copiarlo, restaurarlo) no lo "rejuvenece".
            touch($vieja);
            $this->assertTrue($this->comoSuperadmin()->getJson('/api/sistema/respaldos/automaticos')->json('atrasada'));

            unlink($vieja);
            file_put_contents("{$carpeta}/respaldo-auto-".now()->subHours(2)->format('Y-m-d-Hi').'.sql.gz', gzencode('-- x'));
            $this->assertFalse($this->comoSuperadmin()->getJson('/api/sistema/respaldos/automaticos')->json('problema'));

            file_put_contents("{$carpeta}/ultimo-intento.json", json_encode(['fecha' => now()->toIso8601String(), 'ok' => false, 'mensaje' => 'disco lleno']));
            $auto = $this->comoSuperadmin()->getJson('/api/sistema/respaldos/automaticos')->json();
            $this->assertTrue($auto['fallo']);
            $this->assertTrue($auto['problema']);
        });
    }

    /** Una compra cualquiera: alcanza para que haya "algo que proteger". */
    private function crearComprobanteDePrueba(): void
    {
        $prov = Proveedor::query()->create(['nombre' => 'Molinos']);
        $cols = array_flip(Schema::getColumnListing('comprobantes'));
        $fila = array_intersect_key([
            'proveedor_id' => $prov->id, 'sucursal_id' => $this->central()->id, 'tipo' => 'factura',
            'fecha' => now()->toDateString(), 'created_at' => now(), 'updated_at' => now(),
        ], $cols);
        DB::table('comprobantes')->insert($fila);
    }
}
