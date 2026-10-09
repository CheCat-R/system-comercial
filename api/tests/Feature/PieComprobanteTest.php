<?php

namespace Tests\Feature;


/**
 * el pie de una factura de compra no cierra al centavo.
 * ComprobantesService::armarPie() redondea UNA sola vez el total (sobre importes sin redondear) y guarda por separado
 * subtotal_neto e iva_total ya redondeados: neto + IVA + percepciones != total en ~1 de cada 5 facturas con descuento.
 * Como el saldo se compara con tolerancia 0,009, ese centavo es una deuda fantasma de $0,01 (o un pago exacto del
 * papel rechazado con "le faltan 0,01").
 */
class PieComprobanteTest extends PruebaDeComprasBase
{
    public function test_neto_mas_iva_mas_percepciones_dan_el_total_guardado(): void
    {
        [$prov, $prod] = $this->armarProveedorConProducto();
        // 1 × $1,56 con 1 % de descuento e IVA 21 %: neto 1,5444 → 1,54 · IVA 0,3243 → 0,32 · total 1,8687 → 1,87 (¡1,54 + 0,32 = 1,86!).
        $f = $this->admin()->postJson('/api/comprobantes', [
            'tipo' => 'factura', 'letra' => 'A', 'numero' => 1, 'proveedorId' => $prov['id'],
            'items' => [['productoId' => $prod['id'], 'cantidad' => 1, 'costoUnitario' => 1.56, 'descuento' => 1, 'iva' => 21]],
        ])->assertCreated()->json();

        $suma = round($f['subtotalNeto'] + $f['ivaTotal'] + $f['percepcionesTotal'], 2);
        $this->assertEquals($suma, $f['total'], "Neto {$f['subtotalNeto']} + IVA {$f['ivaTotal']} = {$suma}, pero el total guardado es {$f['total']}.");
    }
}
