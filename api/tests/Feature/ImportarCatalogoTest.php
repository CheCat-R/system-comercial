<?php

namespace Tests\Feature;

/**
 * POST /productos/importar.
 *  1. Cada paquete (presentación) llega con su FORMATO DE VENTA (`listas`, desde la migración 0053) y queda con precio;
 *     si llega sin él, la API lo avisa en `paquetesSinPrecio` en vez de dejarlo sin precio en silencio.
 *  2. El formato de compra importado se acota como en `setFormatosCompra`: ni descuento mayor a 100 % ni costo negativo.
 */
class ImportarCatalogoTest extends PruebaDeComprasBase
{
    private function itemGranel(array $formato = [], ?array $presentaciones = null): array
    {
        $lista = $this->admin()->getJson('/api/listas')->json('listas.0.id');

        return [
            'producto' => ['nombre' => 'Almendras', 'codigoPropio' => 'A1', 'codigoBarras' => '', 'iva' => 21, 'esGranel' => true, 'categoriaNombre' => 'Alimentos', 'unidadesPorBulto' => 1],
            'formatoCompra' => [...['cantidad' => 1, 'costo' => 10000, 'descuento' => 0, 'flete' => 0, 'modoCosto' => 'lista'], ...$formato],
            // Forma que arma panel/src/modules/productos/domain/importarCatalogo.js (armarPresentaciones).
            'presentaciones' => $presentaciones ?? [[
                'tamKg' => 0.25, 'codigoBarras' => '7790001234567', 'nombre' => 'ALMENDRAS X250G', 'precioViejo' => 4700, 'precioNuevo' => 4717,
                'listas' => [['listaId' => $lista, 'modoPrecio' => 'markup', 'markup' => 66, 'unidades' => 1]],
            ]],
            'listas' => [['listaId' => $lista, 'modoPrecio' => 'markup', 'markup' => 48, 'unidades' => 1]],
        ];
    }

    public function test_los_paquetes_importados_quedan_con_precio(): void
    {
        [$prov] = $this->armarProveedorConProducto();
        $this->admin()->postJson('/api/productos/importar', ['proveedorId' => $prov['id'], 'items' => [$this->itemGranel()]])
            ->assertOk()->assertJsonPath('creados', 1)->assertJsonPath('paquetesSinPrecio', []);

        $prod = collect($this->admin()->getJson('/api/productos')->json())->firstWhere('codigoPropio', 'A1');
        $this->assertCount(1, $prod['presentaciones']);
        $this->assertNotNull($prod['presentaciones'][0]['precio'], 'El paquete de 250 g se importó sin precio: el POS no lo puede vender.');
    }

    public function test_un_paquete_sin_formato_de_venta_se_avisa(): void
    {
        [$prov] = $this->armarProveedorConProducto();
        $sinListas = [['tamKg' => 0.25, 'codigoBarras' => '7790001234567', 'nombre' => 'ALMENDRAS X250G']];
        $this->admin()->postJson('/api/productos/importar', ['proveedorId' => $prov['id'], 'items' => [$this->itemGranel([], $sinListas)]])
            ->assertOk()->assertJsonPath('paquetesSinPrecio.0', 'Almendras · 0.25 kg');
    }

    public function test_el_formato_de_compra_importado_no_puede_tener_descuento_mayor_a_100_ni_costo_negativo(): void
    {
        [$prov] = $this->armarProveedorConProducto();
        $this->admin()->postJson('/api/productos/importar', ['proveedorId' => $prov['id'], 'items' => [$this->itemGranel(['descuento' => 150, 'costo' => 10000], [])]])->assertOk();

        $prod = collect($this->admin()->getJson('/api/productos')->json())->firstWhere('codigoPropio', 'A1');
        $this->assertNotNull($prod);
        $this->assertGreaterThanOrEqual(0, $prod['costoNeto'], 'Se importó un producto con descuento 150 %: costo neto negativo.');
    }
}
