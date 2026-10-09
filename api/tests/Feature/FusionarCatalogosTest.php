<?php

namespace Tests\Feature;


/**
 * fusionar dos categorías con una subcategoría del mismo nombre deja a los productos SIN subcategoría.
 * CatalogosService::fusionar() borra la subcategoría "repetida" del origen (para no chocar con el único
 * categoria_id+nombre) pero no reapunta antes los productos que la usaban: la FK `productos.subcategoria_id` es
 * nullOnDelete, así que quedan en NULL en silencio (y con eso fuera de los filtros, listas de reglas y reportes por rubro).
 */
class FusionarCatalogosTest extends PruebaDeComprasBase
{
    public function test_fusionar_categorias_conserva_la_subcategoria_de_los_productos(): void
    {
        $a = $this->admin()->postJson('/api/catalogos/categorias', ['nombre' => 'Lacteos viejos'])->assertSuccessful()->json();
        $b = $this->admin()->postJson('/api/catalogos/categorias', ['nombre' => 'Lacteos'])->assertSuccessful()->json();
        $subA = $this->admin()->postJson('/api/catalogos/subcategorias', ['nombre' => 'Quesos', 'categoriaId' => $a['id']])->assertSuccessful()->json();
        $subB = $this->admin()->postJson('/api/catalogos/subcategorias', ['nombre' => 'Quesos', 'categoriaId' => $b['id']])->assertSuccessful()->json();
        $prod = $this->admin()->postJson('/api/productos', ['nombre' => 'Queso cremoso', 'categoriaId' => $a['id'], 'subcategoriaId' => $subA['id']])->assertCreated()->json();
        $this->assertSame($subA['id'], $prod['subcategoriaId'], 'precondición');

        $this->admin()->postJson('/api/catalogos/categorias/'.$a['id'].'/fusionar', ['haciaId' => $b['id']])->assertOk();

        $despues = $this->admin()->getJson('/api/productos/'.$prod['id'])->json();
        $this->assertSame($b['id'], $despues['categoriaId']);
        $this->assertSame($subB['id'], $despues['subcategoriaId'], 'El producto quedó con subcategoría '.var_export($despues['subcategoriaId'], true).' en vez de la "Quesos" de la categoría destino.');
    }
}
