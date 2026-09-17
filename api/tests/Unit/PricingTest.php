<?php

namespace Tests\Unit;

use App\Precios\CostoEntry;
use App\Precios\FilaVenta;
use App\Precios\OpcionesPrecio;
use App\Precios\Pricing;
use PHPUnit\Framework\TestCase;

/**
 * PRUEBAS DE `Pricing` — la aritmética del dinero. Puro (sin base), es el único
 * lugar donde se derivan los precios que ven la etiqueta, el POS, el sitio y
 * las métricas. Un error acá no tira una excepción: cobra mal, en silencio,
 * en todas las cajas. Portadas 1:1 de `crm-api/src/inventario/pricing.test.ts`.
 */
class PricingTest extends TestCase
{
    /** Igualdad con tolerancia de centavo: la coma flotante no es exacta. */
    private function cerca(float $real, float $esperado, string $mensaje = 'valor', float $tolerancia = 0.005): void
    {
        $this->assertTrue(abs($real - $esperado) <= $tolerancia, "$mensaje: se esperaba $esperado, llegó $real");
    }

    public function test_descuento_efectivo_es_en_cascada_no_se_suma(): void
    {
        // "30 y 10" es 37%, no 40%.
        $this->cerca(Pricing::descuentoEfectivo(new CostoEntry(descuento: 30, descuento2: 10)), 37);
        $this->cerca(Pricing::descuentoEfectivo(new CostoEntry), 0);
        $this->assertSame(0.0, Pricing::descuentoEfectivo(null));
    }

    public function test_costos_formato_cadena_lista_descuento_flete_neto_iva(): void
    {
        $c = Pricing::costosFormato(new CostoEntry(cantidad: 12, costo: 1200, descuento: 10, flete: 5), 21);
        $this->cerca($c->costoBruto, 1080, 'bruto (lista menos 10%)');
        $this->cerca($c->costoNeto, 1134, 'neto (bruto + 5% de flete)');
        $this->cerca($c->costoFinal, 1372.14, 'final (neto × 1,21)');
        $this->cerca($c->costoNetoUnitario, 94.5, 'neto por unidad');
        // Todo facturado: la base del precio ES el costo real y no se absorbe IVA.
        $this->cerca($c->costoPrecio, $c->costoNeto, 'base del precio = costo real');
        $this->cerca($c->ivaAbsorbido, 0, 'sin IVA absorbido');
        $this->cerca($c->desembolso, 1306.8, 'lo pagado al proveedor (bruto con IVA, sin flete)');
    }

    public function test_modo_final_deriva_el_neto_hacia_atras(): void
    {
        $c = Pricing::costosFormato(new CostoEntry(modoCosto: 'final', costoFinal: 1210, cantidad: 10), 21);
        $this->cerca($c->costoNeto, 1000, 'neto = final ÷ 1,21');
        $this->cerca($c->costoNetoUnitario, 100);
        $this->cerca($c->desembolso, 1210, 'se paga lo cargado');
    }

    public function test_cantidad_cero_no_deja_precios_en_infinito(): void
    {
        $c = Pricing::costosFormato(new CostoEntry(cantidad: 0, costo: 100), 21);
        $this->assertTrue(is_finite($c->costoNetoUnitario));
    }

    public function test_mercaderia_sin_factura_absorbe_el_iva_de_la_venta(): void
    {
        $c = Pricing::costosFormato(new CostoEntry(costo: 1000, porcSinFactura: 100), 21);
        $this->cerca($c->costoNeto, 1000, 'cuesta lo que se pagó: no hay IVA que recuperar');
        $this->cerca($c->costoPrecio, 1000 / 1.21, 'la base del precio pierde el IVA que la venta genera');
        $this->cerca($c->ivaAbsorbido, 1000 - 1000 / 1.21, 'la diferencia es lo que absorbe el negocio');
        $this->cerca($c->desembolso, 1000, 'al proveedor se le paga sin IVA');
        $this->cerca($c->costoPrecio * 1.21, $c->desembolso, 'costoPrecio × factor = desembolso');
    }

    public function test_identidad_de_control_cierra_con_parte_sin_factura_y_flete(): void
    {
        $iva = 21;
        $factor = 1 + $iva / 100;
        $q = 0.5;
        $c = Pricing::costosFormato(new CostoEntry(costo: 1000, flete: 10, porcSinFactura: 50), $iva);
        $flete = 100; // 10% de la mercadería post descuento
        $this->cerca($c->costoPrecio * $factor, $c->desembolso + $flete * ((1 - $q) * $factor + $q), 'identidad de control');
        // Con q=0 el ratio es 1 y todo queda como siempre.
        $sinNegro = Pricing::costosFormato(new CostoEntry(costo: 1000, flete: 10, porcSinFactura: 0), $iva);
        $this->cerca($sinNegro->costoPrecio, $sinNegro->costoNeto);
    }

    public function test_redondear_precio(): void
    {
        $this->assertSame(1234.57, Pricing::redondearPrecio(1234.567));
        $this->assertSame(1235.0, Pricing::redondearPrecio(1234.567, 1));
        $this->assertSame(1820.0, Pricing::redondearPrecio(1815, 10));
        $this->assertSame(1800.0, Pricing::redondearPrecio(1815, 100));
    }

    public function test_redondeo_de_gondola_es_idempotente(): void
    {
        // costo 1000, markup 50% → neto 1500 → final 1815 → góndola a $10 → 1820.
        $opts = new OpcionesPrecio(iva: 21, redondeo: 10);
        $neto = Pricing::precioLista(1000, 50, $opts);
        $final = Pricing::precioFinal($neto, 21, 10);
        $this->assertSame(1820.0, $final, 'la etiqueta cae en la unidad de redondeo');
        $this->cerca($neto, 1820 / 1.21, 'el neto se deriva hacia atrás desde la etiqueta', 0.01);
        // Aplicar de nuevo no mueve el número: etiqueta y ticket no discrepan.
        $this->assertSame(1820.0, Pricing::precioFinal(Pricing::precioLista($neto, 0, $opts), 21, 10));
    }

    public function test_precio_venta_fila_modo_markup_la_caja_vale_n_veces_la_unidad(): void
    {
        $p = Pricing::precioVentaFila(100, new FilaVenta(unidades: 6, markup: 40), new OpcionesPrecio(iva: 21, redondeo: 1));
        $this->assertSame(6.0, $p->unidades);
        $this->assertSame(169.0, $p->finalUnitario, 'neto 140 → final 169,4 → al entero 169');
        $this->cerca($p->netoUnitario, 169 / 1.21, 'neto unitario derivado del final', 0.01);
        $this->assertSame(169.0 * 6, $p->finalFormato);
    }

    public function test_precio_venta_fila_modo_precio_el_final_del_formato_es_exacto(): void
    {
        $p = Pricing::precioVentaFila(100, new FilaVenta(unidades: 12, modoPrecio: 'precio', precioFijo: 10000), new OpcionesPrecio(iva: 21, redondeo: 100));
        $this->assertSame(10000.0, $p->finalFormato, 'lo fijado no se toca');
        $this->cerca($p->finalUnitario, 10000 / 12, 'la unidad es informativa, puede dar centavos', 0.01);
        $this->cerca($p->netoUnitario, 10000 / 1.21 / 12, 'neto unitario', 0.01);
    }

    public function test_formato_activo_el_marcado_si_no_el_primero(): void
    {
        $a = ['id' => 'a', 'usarParaPrecio' => false];
        $b = ['id' => 'b', 'usarParaPrecio' => true];
        $this->assertSame($b, Pricing::formatoActivo([$a, $b]));
        $this->assertSame($a, Pricing::formatoActivo([$a]));
        $this->assertNull(Pricing::formatoActivo([]));
        // También con las claves de la base.
        $this->assertSame(['usar_para_precio' => true], Pricing::formatoActivo([['usar_para_precio' => false], ['usar_para_precio' => true]]));
    }

    public function test_costo_neto_presentacion_hereda_el_costo_del_kilo(): void
    {
        $this->assertSame(500.0, Pricing::costoNetoPresentacion(1000, 0.5));
        $this->assertSame(0.0, Pricing::costoNetoPresentacion(1000, 0));
    }

    public function test_costo_entry_desde_fila_snake_case_y_enum(): void
    {
        $e = CostoEntry::desde(['cantidad' => 12, 'costo' => 1200, 'descuento' => 10, 'flete' => 5, 'modo_costo' => \App\Enums\ModoCosto::Lista, 'usar_para_precio' => 1]);
        $this->assertSame('lista', $e->modoCosto);
        $this->assertTrue($e->usarParaPrecio);
        $this->cerca(Pricing::costoNetoEntry($e, 21), 94.5);
    }
}
