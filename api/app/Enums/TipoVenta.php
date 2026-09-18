<?php

namespace App\Enums;

enum TipoVenta: string
{
    case Ticket = 'ticket';
    case FacturaA = 'factura_a';
    case FacturaB = 'factura_b';
    case FacturaC = 'factura_c';
    case NotaCreditoA = 'nota_credito_a';
    case NotaCreditoB = 'nota_credito_b';
    case NotaCreditoC = 'nota_credito_c';
    case NotaDebitoA = 'nota_debito_a';
    case NotaDebitoB = 'nota_debito_b';
    case NotaDebitoC = 'nota_debito_c';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
