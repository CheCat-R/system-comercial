<?php

namespace App\Precios;

final class PrecioVenta
{
    public function __construct(
        public readonly float $unidades,
        /** Neto por UNIDAD: es la moneda del ticket (el POS trabaja en neto unitario). */
        public readonly float $netoUnitario,
        /** Lo que ve el cliente por una unidad. */
        public readonly float $finalUnitario,
        /** Lo que ve el cliente por el formato entero (la caja). */
        public readonly float $finalFormato,
    ) {}

    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
