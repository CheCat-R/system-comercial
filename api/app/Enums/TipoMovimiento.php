<?php

namespace App\Enums;

enum TipoMovimiento: string
{
    case Compra = 'compra';
    case Fraccionamiento = 'fraccionamiento';
    case VentaGranel = 'venta_granel';
    case VentaFraccionada = 'venta_fraccionada';
    case Devolucion = 'devolucion';
    case Ajuste = 'ajuste';
    case Merma = 'merma';
    case Vencido = 'vencido';
    case Defectuoso = 'defectuoso';
    case Transferencia = 'transferencia';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
