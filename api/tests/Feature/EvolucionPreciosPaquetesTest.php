<?php

namespace Tests\Feature;


use App\Support\Ean13;

/**
 * la evolución de precios y el aviso "cambiaron los precios" (el que ve el cajero) ignoran los PAQUETES
 * fraccionados. HistorialPreciosService::preciosActuales() sólo mira `producto_listas` con presentacion_id NULL
 * (el formato de venta de la madre). Un granel cuya madre no tiene formato de venta (el caso de 73 madres, según el
 * manual del propio panel) y vende solo sus paquetes puede subir un 30 % de costo sin dejar rastro en la evolución
 * ni disparar el aviso a la caja: el cajero cobra el paquete a un precio que cambió sin que nadie se lo avise.
 */
class EvolucionPreciosPaquetesTest extends PruebaDeComprasBase
{
    public function test_subir_el_costo_de_un_granel_que_solo_vende_paquetes_deja_registro_y_avisa_a_caja(): void
    {
        $prov = $this->admin()->postJson('/api/proveedores', ['nombre' => 'Granos SA', 'condicionIva' => 'responsable_inscripto'])->assertCreated()->json();
        $prod = $this->admin()->postJson('/api/productos', ['nombre' => 'Almendras', 'iva' => 21, 'esGranel' => true, 'proveedorId' => $prov['id'], 'costoInicial' => 10000])->assertCreated()->json();
        $ean = Ean13::armar('29', 1);
        $p = $this->admin()->putJson('/api/productos/'.$prod['id'].'/presentaciones', ['items' => [['tamKg' => 0.25, 'codigoBarras' => $ean]]])->assertOk()->json();
        $pres = $p['presentaciones'][0];
        $lista = $this->admin()->getJson('/api/listas')->json('listas.0.id');
        $this->admin()->putJson('/api/productos/presentaciones/'.$pres['id'].'/listas', ['items' => [['listaId' => $lista, 'modoPrecio' => 'markup', 'markup' => 50, 'unidades' => 1]]])->assertOk();

        $antes = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('presentaciones.0.precioFinal');
        $this->assertGreaterThan(0, $antes, 'precondición: el paquete tiene precio');
        $ultimoAntes = $this->admin()->getJson('/api/precios/ultimo-cambio')->json('id');

        // El proveedor sube el costo un 30 %: 10.000 → 13.000 el kilo.
        $fid = $prod['formatosCompra'][0]['id'];
        $this->admin()->postJson('/api/precios/costos', ['cambios' => [['id' => $fid, 'costo' => 13000]], 'origen' => 'manual', 'motivo' => 'aumento'])->assertOk()->assertJsonPath('actualizados', 1);

        $despues = $this->admin()->getJson('/api/productos/'.$prod['id'])->json('presentaciones.0.precioFinal');
        $this->assertGreaterThan($antes, $despues, 'precondición: el precio del paquete subió');
        $ultimoDespues = $this->admin()->getJson('/api/precios/ultimo-cambio')->json('id');

        $this->assertGreaterThan($ultimoAntes, $ultimoDespues, "El paquete pasó de {$antes} a {$despues} pero la evolución de precios no registró nada (el cajero no recibe el aviso de cambio de precios).");
    }
}
