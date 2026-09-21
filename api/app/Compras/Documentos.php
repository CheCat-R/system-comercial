<?php

namespace App\Compras;

use App\Exceptions\ErrorDeNegocio;
use Illuminate\Support\Carbon;

/**
 * Lo que comparten comprobantes, gastos, pagos y finanzas del proveedor: los
 * tipos de documento con sus tres preguntas (¿mueve stock? ¿genera deuda? ¿es
 * fiscal?), la etiqueta con que se nombra un papel en toda pantalla y las
 * fechas "AAAA-MM-DD" leídas en hora argentina.
 *
 * LISTA DE TIPOS: cada pregunta es una lista explícita — un tipo nuevo hay que
 * agregarlo en todas o se cuela un documento que mueve mercadería y no aparece
 * en lo que se debe.
 */
final class Documentos
{
    public const ZONA = 'America/Argentina/Buenos_Aires';

    public const EPS = 0.009;

    public const TIPOS = ['orden_compra', 'remito', 'factura', 'liquidacion', 'nota_credito', 'nota_debito'];

    public const LETRAS = ['A', 'B', 'C', 'X'];

    public const MEDIOS = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'cheque', 'qr', 'otro', 'deposito', 'echeq'];

    /** Los que SUMAN a la cuenta corriente del proveedor (la liquidación también: la plata es una). */
    public const GENERAN_DEUDA = ['factura', 'liquidacion', 'nota_debito'];

    /** Los que INGRESAN mercadería cuando vienen con recepción. */
    public const INGRESAN_STOCK = ['remito', 'factura', 'liquidacion'];

    public const NOMBRE_TIPO = [
        'orden_compra' => 'la orden de compra', 'remito' => 'el remito', 'factura' => 'la factura',
        'liquidacion' => 'la liquidación', 'nota_credito' => 'la nota de crédito', 'nota_debito' => 'la nota de débito',
    ];

    public const ABREV_TIPO = [
        'orden_compra' => 'OC', 'remito' => 'Remito', 'factura' => 'Factura', 'liquidacion' => 'Liquidación',
        'nota_credito' => 'NC', 'nota_debito' => 'ND',
    ];

    public static function money(float|int|string|null $n): float
    {
        $v = (float) $n * 100;

        return is_finite($v) ? round($v) / 100 : 0.0;
    }

    /** Un comprobante no fiscal no discrimina IVA ni lleva percepciones. */
    public static function esFiscal(string $tipo): bool
    {
        return $tipo !== 'liquidacion';
    }

    public static function generaDeuda(string $tipo): bool
    {
        return in_array($tipo, self::GENERAN_DEUDA, true);
    }

    /** "Factura A 00001-00193307" — la misma etiqueta en tabla, detalle, error y pagos. */
    public static function etiqueta(object|array $c): string
    {
        $c = (object) $c;
        $tipo = self::ABREV_TIPO[$c->tipo ?? ''] ?? ucfirst((string) ($c->tipo ?? 'Comprobante'));
        $letra = ($c->letra ?? '') ? ' '.$c->letra : '';
        $num = ($c->numero ?? null) !== null
            ? ' '.self::puntoVenta((string) ($c->punto_venta ?? $c->puntoVenta ?? '')).'-'.str_pad((string) $c->numero, 8, '0', STR_PAD_LEFT)
            : ' #'.($c->id ?? '');

        return $tipo.$letra.$num;
    }

    /** El papel imprime cinco dígitos; se normaliza a cinco para que el único de la base cruce las dos formas. */
    public static function puntoVenta(?string $pv): string
    {
        $d = preg_replace('/\D/', '', (string) $pv) ?: '1';

        return str_pad(substr(ltrim($d, '0') ?: '1', -5), 5, '0', STR_PAD_LEFT);
    }

    /**
     * 'AAAA-MM-DD' → medianoche ARGENTINA en UTC. Con hora, tal cual. Nulo si
     * viene vacío. El texto que no es fecha se rechaza como 400, no como 500.
     */
    public static function fecha(?string $s, bool $obligatoria = false): ?Carbon
    {
        $s = trim((string) $s);
        if ($s === '') {
            if ($obligatoria) {
                throw new ErrorDeNegocio('Falta la fecha.');
            }

            return null;
        }
        if (! preg_match('/^\d{4}-\d{2}-\d{2}/', $s)) {
            throw new ErrorDeNegocio('La fecha va como AAAA-MM-DD.');
        }
        try {
            $c = strlen($s) <= 10 ? Carbon::parse($s, self::ZONA)->startOfDay() : Carbon::parse($s);
        } catch (\Throwable) {
            throw new ErrorDeNegocio('Fecha inválida: '.$s);
        }

        return $c->utc();
    }

    /** Fin de día argentino, para el "hasta" de los filtros. */
    public static function finDeDia(?string $s): ?Carbon
    {
        $s = trim((string) $s);
        if ($s === '') {
            return null;
        }
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            throw new ErrorDeNegocio('La fecha va como AAAA-MM-DD.');
        }

        return Carbon::parse($s, self::ZONA)->endOfDay()->utc();
    }

    /** Medianoche de HOY en Argentina (UTC): las dos puntas de "días restantes" en el mismo huso. */
    public static function hoy(): Carbon
    {
        return Carbon::now(self::ZONA)->startOfDay()->utc();
    }

    /** Días enteros entre hoy (AR) y una fecha; negativo si ya pasó. */
    public static function diasHasta(mixed $fecha): ?int
    {
        if (! $fecha) {
            return null;
        }
        $f = Carbon::parse($fecha)->setTimezone(self::ZONA)->startOfDay();

        return (int) Carbon::now(self::ZONA)->startOfDay()->diffInDays($f, false);
    }

    public static function hoyIso(): string
    {
        return Carbon::now(self::ZONA)->format('Y-m-d');
    }
}
