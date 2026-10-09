<?php

namespace Tests\Feature;

use Database\Seeders\CatalogoBaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Base de las pruebas de Productos / Compras / Proveedores / Gastos.
 */
abstract class PruebaDeComprasBase extends TestCase
{
    protected string $tokenAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogoBaseSeeder::class);
        $this->tokenAdmin = $this->loguear($this->superadmin(), 'admin1234');
    }

    protected function admin(): static
    {
        return $this->conToken($this->tokenAdmin);
    }

    /** Proveedor + producto entero con un solo formato de compra: caja x12 a $12.000 ($1.000 la unidad). */
    protected function armarProveedorConProducto(array $prov = [], float $iva = 21): array
    {
        $p = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Distribuidora Norte', 'condicionIva' => 'responsable_inscripto', ...$prov])->assertCreated()->json();
        $prod = $this->admin()->postJson('/api/productos', ['nombre' => 'Aceite 900ml', 'iva' => $iva, 'proveedorId' => $p['id'], 'costoInicial' => 1000])->assertCreated()->json();
        $this->admin()->putJson('/api/productos/'.$prod['id'].'/formatos-compra', ['items' => [['id' => $prod['formatosCompra'][0]['id'], 'proveedorId' => $p['id'], 'cantidad' => 12, 'costo' => 12000, 'usarParaPrecio' => true]]])->assertOk();

        return [$p, $this->admin()->getJson('/api/productos/'.$prod['id'])->json()];
    }

    protected function stockDisponible(int $productoId): float
    {
        return (float) DB::table('stock')->where('producto_id', $productoId)->whereNull('presentacion_id')->where('estado', 'disponible')->sum('cantidad');
    }
}
