<?php

namespace App\Precios;

/** Opciones de redondeo. Sin `redondeo`, el comportamiento es el de siempre (centavos). */
final class OpcionesPrecio
{
    public function __construct(
        /** Alícuota de IVA del producto (21, 10.5, 0…). */
        public readonly float $iva = 0,
        /** 0 = sin redondeo; 1 = al entero; 10/50/100 = a esa unidad. */
        public readonly float $redondeo = 0,
    ) {}
}
