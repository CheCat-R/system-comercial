<?php

namespace App\Precios;

use App\Models\ProductoProveedor;

/**
 * FORMATO DE COMPRA — cómo entra el producto. Todos los importes son del
 * BULTO entero, no de la unidad: es como los factura el proveedor. Lo
 * unitario se deriva dividiendo por `cantidad`.
 */
final class CostoEntry
{
    public function __construct(
        /** Unidades por bulto. "Caja x12" → 12. */
        public readonly float $cantidad = 1,
        /** Costo de lista del bulto, sin descuentos ni flete. */
        public readonly float $costo = 0,
        /** Escala de descuentos, EN CASCADA (30 y 10 = 37%, no 40%). */
        public readonly float $descuento = 0,
        public readonly float $descuento2 = 0,
        public readonly float $descuento3 = 0,
        public readonly float $descuento4 = 0,
        public readonly float $flete = 0,
        /** 'final' ignora descuentos y flete: el costo se carga ya cerrado y con IVA. */
        public readonly string $modoCosto = 'lista',
        public readonly float $costoFinal = 0,
        /** Qué parte de la mercadería viene SIN FACTURA (0–100). */
        public readonly float $porcSinFactura = 0,
        public readonly bool $usarParaPrecio = false,
    ) {}

    /** Desde un array con claves camelCase (request) o snake_case (fila de la base). */
    public static function desde(array $d): self
    {
        $g = fn (string $camel, string $snake, mixed $def) => $d[$camel] ?? $d[$snake] ?? $def;

        return new self(
            cantidad: (float) $g('cantidad', 'cantidad', 1),
            costo: (float) $g('costo', 'costo', 0),
            descuento: (float) $g('descuento', 'descuento', 0),
            descuento2: (float) $g('descuento2', 'descuento2', 0),
            descuento3: (float) $g('descuento3', 'descuento3', 0),
            descuento4: (float) $g('descuento4', 'descuento4', 0),
            flete: (float) $g('flete', 'flete', 0),
            modoCosto: (string) (is_object($m = $g('modoCosto', 'modo_costo', 'lista')) ? $m->value : $m),
            costoFinal: (float) $g('costoFinal', 'costo_final', 0),
            porcSinFactura: (float) $g('porcSinFactura', 'porc_sin_factura', 0),
            usarParaPrecio: (bool) $g('usarParaPrecio', 'usar_para_precio', false),
        );
    }

    public static function deModelo(ProductoProveedor $f): self
    {
        return self::desde($f->getAttributes());
    }
}
