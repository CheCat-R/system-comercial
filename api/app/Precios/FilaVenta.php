<?php

namespace App\Precios;

use App\Models\ProductoLista;

/** Fila de `producto_listas` (lo que el precio necesita de ella). */
final class FilaVenta
{
    public function __construct(
        /** En cuántas unidades se vende: 1 = suelto, 12 = caja de 12. */
        public readonly float $unidades = 1,
        /** 'markup' o 'precio'. */
        public readonly string $modoPrecio = 'markup',
        public readonly float $markup = 0,
        /** Precio FINAL (con IVA) del FORMATO completo, en modo 'precio'. */
        public readonly float $precioFijo = 0,
    ) {}

    public static function desde(array $d): self
    {
        $modo = $d['modoPrecio'] ?? $d['modo_precio'] ?? 'markup';

        return new self(
            unidades: (float) ($d['unidades'] ?? 1),
            modoPrecio: is_object($modo) ? $modo->value : (string) $modo,
            markup: (float) ($d['markup'] ?? 0),
            precioFijo: (float) ($d['precioFijo'] ?? $d['precio_fijo'] ?? 0),
        );
    }

    public static function deModelo(ProductoLista $pl): self
    {
        return self::desde($pl->getAttributes());
    }
}
