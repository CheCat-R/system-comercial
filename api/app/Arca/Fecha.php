<?php

namespace App\Arca;

use Illuminate\Support\Carbon;

/**
 * LAS FECHAS QUE SE LE MANDAN A ARCA. La máquina de desarrollo está en hora
 * argentina y el servidor casi siempre en UTC: si el sello se arma con el reloj
 * del proceso y sin huso, ARCA ve una hora tres horas en el futuro y rechaza
 * ("generationTime posee formato o dato inválido"). Dos candados: las partes
 * salen con la zona ESCRITA, y el offset viaja EXPLÍCITO en el texto.
 */
final class Fecha
{
    public const ZONA = 'America/Argentina/Buenos_Aires';

    private static function ar(\DateTimeInterface|string|null $d): Carbon
    {
        return ($d ? Carbon::parse($d) : Carbon::now())->setTimezone(self::ZONA);
    }

    /** Sello para el WSAA: ISO 8601 con offset. Ej: 2026-08-19T21:40:07-03:00 */
    public static function selloWsaa(\DateTimeInterface|string|null $d = null): string
    {
        return self::ar($d)->format('Y-m-d\TH:i:sP');
    }

    /** Fecha del comprobante para el WSFE: AAAAMMDD en hora ARGENTINA. */
    public static function comprobante(\DateTimeInterface|string|null $d = null): string
    {
        return self::ar($d)->format('Ymd');
    }

    /** AAAA-MM-DD en hora argentina — el formato del QR de la RG 4892. */
    public static function qr(\DateTimeInterface|string|null $d = null): string
    {
        return self::ar($d)->format('Y-m-d');
    }

    /** El vencimiento del CAE viene AAAAMMDD; se guarda al mediodía argentino. */
    public static function parsearArca(?string $s): ?Carbon
    {
        $t = trim((string) $s);
        if (! preg_match('/^\d{8}$/', $t)) {
            return null;
        }

        return Carbon::createFromFormat('Ymd H:i:s', $t.' 12:00:00', self::ZONA)->utc();
    }
}
