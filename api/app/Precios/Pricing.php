<?php

namespace App\Precios;

/**
 * PRECIOS — el único lugar donde se derivan (puro, sin DB).
 * ============================================================================
 *   costoNeto = costo × (1 − desc%) × (1 + flete%)   ← con parte sin factura,
 *                el flete entra × ratio (ver `costosFormato`)
 *   neto      = costoNeto × (1 + markup% de la lista)          ← lista
 *   neto      = … × tamKg                                      ← presentación
 *   final     = neto × (1 + IVA%)      ← lo que ve el cliente en góndola
 *
 * REDONDEO DE GÓNDOLA: se aplica sobre el precio **final con IVA**, no sobre
 * el neto (redondear el neto deja la góndola con centavos igual). Se redondea
 * el final y el neto se deriva hacia atrás. `precioLista` devuelve el neto ya
 * ajustado y `precioFinal` reconstruye la etiqueta; la operación es
 * idempotente, así la etiqueta y el ticket no discrepan.
 *
 * El redondeo entra por parámetro (no lee configuración) para que este módulo
 * siga siendo puro y testeable sin montar nada.
 */
final class Pricing
{
    /** Redondeo a centavos, como `Math.round(n * 100) / 100` del CRM. */
    public static function money(float $n): float
    {
        return round($n * 100) / 100;
    }

    /**
     * Descuento efectivo de una escala en cascada, en %. Cada uno se aplica
     * sobre lo que quedó del anterior: "30 y 10" es `1 − 0,70 × 0,90 = 37%`,
     * no 40%. Sumarlos es el error caro y silencioso que este cálculo evita.
     */
    public static function descuentoEfectivo(?CostoEntry $e): float
    {
        if (! $e) {
            return 0;
        }
        $factor = 1.0;
        foreach ([$e->descuento, $e->descuento2, $e->descuento3, $e->descuento4] as $d) {
            $factor *= 1 - ($d / 100);
        }

        return (1 - $factor) * 100;
    }

    /**
     * Deriva la cadena entera de un formato de compra:
     * lista → descuentos en cascada → flete → NETO → IVA → final.
     *
     * En modo 'final' se entra por el otro extremo: se carga lo que se PAGA y
     * el neto se deriva hacia atrás.
     *
     * MERCADERÍA SIN FACTURA (`porcSinFactura`): el costo se parte en dos.
     *   costoNeto    ¿cuánto cuesta de verdad? Valúa stock.
     *   costoPrecio  ¿sobre qué se calcula el markup? A la parte sin factura se
     *                le quita el IVA que la venta va a generar (÷ factor).
     *
     * El flete viene facturado y su % es bruto, así que pasa por el mismo
     * `ratio` que la mercadería: `costoPrecio = (M + flete) × ratio`,
     * `costoNeto = M + flete × ratio`, `ivaAbsorbido = M × (1 − ratio)`.
     * Identidad de control: `costoPrecio × factor = desembolso + flete·((1−q)·factor+q)`.
     * Con `porcSinFactura = 0` el ratio es 1 y todo queda como siempre.
     */
    public static function costosFormato(?CostoEntry $e, float $iva = 0): CostosFormato
    {
        if (! $e) {
            return new CostosFormato;
        }

        // Una cantidad en 0 dividiría por cero y dejaría precios en INF.
        $cantidad = max($e->cantidad ?: 1, 1e-9);
        $factorIva = 1 + $iva / 100;
        // Fracción sin factura (0–1), acotada: fuera de 0–100 no significa nada.
        $q = min(max($e->porcSinFactura, 0), 100) / 100;
        // Fracción del valor nominal que entra a la base del precio. Con q=0 vale 1.
        $ratio = (1 - $q) + $q / $factorIva;

        $partir = function (float $mercaderia, float $flete) use ($ratio, $q, $factorIva, $cantidad): array {
            $costoPrecio = ($mercaderia + $flete) * $ratio;
            $desembolso = $mercaderia * ((1 - $q) * $factorIva + $q);
            $absorbido = $mercaderia * (1 - $ratio);

            return [
                'porcSinFactura' => $q * 100,
                'costoPrecio' => $costoPrecio,
                'costoPrecioUnitario' => $costoPrecio / $cantidad,
                'ivaAbsorbido' => $absorbido,
                'ivaAbsorbidoUnitario' => $absorbido / $cantidad,
                'desembolso' => $desembolso,
                'desembolsoUnitario' => $desembolso / $cantidad,
            ];
        };

        if ($e->modoCosto === 'final') {
            // Lo cargado es el DESEMBOLSO del bulto; sólo la parte facturada trae IVA adentro.
            $costoFinal = $e->costoFinal;
            $costoNeto = $costoFinal / ((1 - $q) * $factorIva + $q);

            // En modo final no hay flete: todo es mercadería.
            return new CostosFormato(...[
                "cantidad" => $cantidad,
                "costoLista" => 0,
                "costoListaUnitario" => 0,
                "descuentoEfectivo" => 0,
                "costoBruto" => $costoNeto,
                "costoNeto" => $costoNeto,
                "costoFinal" => $costoFinal,
                "costoNetoUnitario" => $costoNeto / $cantidad,
                "costoFinalUnitario" => $costoFinal / $cantidad,
                ...$partir($costoNeto, 0),
            ]);
        }

        $costoLista = $e->costo;
        $desc = self::descuentoEfectivo($e);
        $costoBruto = $costoLista * (1 - $desc / 100);
        // Flete NOMINAL (M × flete%) y su valor REAL en neto (× ratio). Con q=0 coinciden.
        $flete = $costoBruto * ($e->flete / 100);
        $fleteNeto = $flete * $ratio;
        $costoNeto = $costoBruto + $fleteNeto;
        $costoFinal = $costoNeto * $factorIva;

        return new CostosFormato(...[
            "cantidad" => $cantidad,
            "costoLista" => $costoLista,
            "costoListaUnitario" => $costoLista / $cantidad,
            "descuentoEfectivo" => $desc,
            "costoBruto" => $costoBruto,
            "costoNeto" => $costoNeto,
            "costoFinal" => $costoFinal,
            "costoNetoUnitario" => $costoNeto / $cantidad,
            "costoFinalUnitario" => $costoFinal / $cantidad,
            ...$partir($costoBruto, $flete),
        ]);
    }

    /**
     * El formato que define el precio. UNA sola definición para todo el
     * sistema: el marcado `usarParaPrecio`, si no el primero.
     *
     * @template T
     * @param iterable<T> $formatos
     * @return T|null
     */
    public static function formatoActivo(iterable $formatos): mixed
    {
        $primero = null;
        foreach ($formatos as $f) {
            $primero ??= $f;
            $marcado = is_array($f) ? ($f['usarParaPrecio'] ?? $f['usar_para_precio'] ?? false) : ($f->usarParaPrecio ?? $f->usar_para_precio ?? false);
            if ($marcado) {
                return $f;
            }
        }

        return $primero;
    }

    /** El COSTO REAL unitario: valúa stock, pérdidas, transferencias. NO es la base del precio. */
    public static function costoNetoEntry(?CostoEntry $e, float $iva = 0): float
    {
        return self::costosFormato($e, $iva)->costoNetoUnitario;
    }

    /**
     * La BASE DEL PRECIO DE VENTA: neta, unitaria y con la parte sin factura ya
     * despojada del IVA que el negocio absorbe. Es lo único que puede
     * multiplicar el markup.
     */
    public static function costoPrecioEntry(?CostoEntry $e, float $iva = 0): float
    {
        return self::costosFormato($e, $iva)->costoPrecioUnitario;
    }

    /** Redondea a la unidad pedida. `redondeo <= 0` deja el valor a 2 decimales. */
    public static function redondearPrecio(float $valor, float $redondeo = 0): float
    {
        if ($redondeo <= 0) {
            return self::money($valor);
        }

        return round($valor / $redondeo) * $redondeo;
    }

    /** Precio final con IVA, ya redondeado: el número de la etiqueta. */
    public static function precioFinal(float $neto, float $iva = 0, float $redondeo = 0): float
    {
        return self::redondearPrecio($neto * (1 + $iva / 100), $redondeo);
    }

    /** Ajusta un neto teórico para que su precio final caiga en la unidad de redondeo. */
    private static function ajustarNeto(float $neto, OpcionesPrecio $opts): float
    {
        if ($opts->redondeo <= 0) {
            return self::money($neto);
        }
        $final = self::redondearPrecio($neto * (1 + $opts->iva / 100), $opts->redondeo);

        return self::money($final / (1 + $opts->iva / 100));
    }

    /** Precio NETO de venta de una lista, ajustado al redondeo de góndola. */
    public static function precioLista(float $costoNetoKg, float $markup, ?OpcionesPrecio $opts = null): float
    {
        return self::ajustarNeto($costoNetoKg * (1 + $markup / 100), $opts ?? new OpcionesPrecio);
    }

    /**
     * Deriva el precio de un formato de venta. Los DOS modos convergen en el
     * mismo resultado —neto unitario + finales—:
     *   markup  el precio ACOMPAÑA al costo, con redondeo de góndola sobre el
     *           final de la unidad; la caja vale exactamente N veces la unidad.
     *   precio  el número es LA VOLUNTAD del que lo fijó: el final del FORMATO
     *           es exacto, sin redondeo; la unidad se deriva dividiendo.
     */
    public static function precioVentaFila(float $costoNetoUnitario, FilaVenta $fila, ?OpcionesPrecio $opts = null): PrecioVenta
    {
        $opts ??= new OpcionesPrecio;
        $unidades = max($fila->unidades ?: 1, 1e-9);
        $iva = $opts->iva;

        if ($fila->modoPrecio === 'precio') {
            $finalFormato = self::money($fila->precioFijo);
            $finalUnitario = self::money($finalFormato / $unidades);

            return new PrecioVenta(
                unidades: $unidades,
                netoUnitario: self::money($finalFormato / (1 + $iva / 100) / $unidades),
                finalUnitario: $finalUnitario,
                finalFormato: $finalFormato,
            );
        }

        $netoUnitario = self::precioLista($costoNetoUnitario, $fila->markup, $opts);
        $finalUnitario = self::precioFinal($netoUnitario, $iva, $opts->redondeo);

        return new PrecioVenta(
            unidades: $unidades,
            netoUnitario: $netoUnitario,
            finalUnitario: $finalUnitario,
            finalFormato: self::money($finalUnitario * $unidades),
        );
    }

    /** COSTO neto de un paquete fraccionado: el del kilo por lo que consume. */
    public static function costoNetoPresentacion(float $costoNetoKg, float $tamKg): float
    {
        return $costoNetoKg * $tamKg;
    }
}
