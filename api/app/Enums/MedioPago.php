<?php

namespace App\Enums;

enum MedioPago: string
{
    case Efectivo = 'efectivo';
    case Transferencia = 'transferencia';
    case TarjetaDebito = 'tarjeta_debito';
    case TarjetaCredito = 'tarjeta_credito';
    case Cheque = 'cheque';
    case Qr = 'qr';
    case Otro = 'otro';
    case Deposito = 'deposito';
    case Echeq = 'echeq';

    /** @return string[] */
    public static function valores(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
