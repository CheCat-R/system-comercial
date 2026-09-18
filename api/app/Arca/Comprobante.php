<?php

namespace App\Arca;

use App\Precios\Pricing;

/**
 * Los códigos y el armado del comprobante: traduce el vocabulario del sistema
 * (`factura_a`, `consumidor_final`, IVA 21%) al de ARCA (números). Es puro.
 *
 * Responsable Inscripto emite A y B con el IVA DISCRIMINADO: un renglón por
 * alícuota, y las sumas tienen que cerrar AL CENTAVO contra ImpNeto e ImpIVA.
 */
final class Comprobante
{
    /** Tipo de comprobante (FEParamGetTiposCbte). Cada tipo lleva su numeración. */
    public const CBTE_TIPO = [
        'factura_a' => 1, 'factura_b' => 6, 'factura_c' => 11,
        'nota_debito_a' => 2, 'nota_debito_b' => 7, 'nota_debito_c' => 12,
        'nota_credito_a' => 3, 'nota_credito_b' => 8, 'nota_credito_c' => 13,
    ];

    public const DOC_CUIT = 80;
    public const DOC_CUIL = 86;
    public const DOC_DNI = 96;
    public const DOC_SIN_IDENTIFICAR = 99;

    /** Condición de IVA del RECEPTOR (RG 5616), obligatoria desde 2024. */
    public const COND_IVA_RECEPTOR = [
        'responsable_inscripto' => 1, 'exento' => 4, 'consumidor_final' => 5, 'monotributo' => 6, 'no_categorizado' => 7,
    ];

    /** Id de alícuota (FEParamGetTiposIva). */
    public const ALICUOTA_ID = ['0' => 3, '10.5' => 4, '21' => 5, '27' => 6, '5' => 8, '2.5' => 9];

    public static function esFiscal(string $tipo): bool
    {
        return isset(self::CBTE_TIPO[$tipo]);
    }

    public static function letraDe(string $tipo): ?string
    {
        return preg_match('/_([abc])$/', $tipo, $m) ? strtoupper($m[1]) : null;
    }

    public static function esNotaCredito(?string $tipo): bool
    {
        return str_starts_with((string) $tipo, 'nota_credito');
    }

    /**
     * AGRUPA LOS RENGLONES POR ALÍCUOTA Y CUADRA LAS SUMAS. El sistema redondea
     * renglón por renglón, así que la suma puede diferir en centavos de la
     * cabecera; la diferencia se le carga al renglón de base más grande.
     *
     * @param  array<int, array{neto: float, iva: float}>  $renglones
     * @return array<int, array{id:int, baseImp:float, importe:float}>
     */
    public static function armarAlicuotas(array $renglones, float $neto, float $iva): array
    {
        $por = [];
        foreach ($renglones as $r) {
            $alic = (float) ($r['iva'] ?? 0);
            $k = self::claveAlicuota($alic);
            $por[$k] ??= ['base' => 0.0, 'importe' => 0.0];
            $por[$k]['base'] += (float) ($r['neto'] ?? 0);
            $por[$k]['importe'] += (float) ($r['neto'] ?? 0) * $alic / 100;
        }
        $filas = [];
        foreach ($por as $k => $v) {
            $id = self::ALICUOTA_ID[$k] ?? null;
            if (! $id) {
                throw new \RuntimeException('No hay código de ARCA para la alícuota de IVA '.$k.'%.');
            }
            $filas[] = ['id' => $id, 'baseImp' => Pricing::money($v['base']), 'importe' => Pricing::money($v['importe'])];
        }
        if (! $filas) {
            return [];
        }
        usort($filas, fn ($a, $b) => $b['baseImp'] <=> $a['baseImp']);
        $difBase = Pricing::money(Pricing::money($neto) - Pricing::money(array_sum(array_column($filas, 'baseImp'))));
        $difIva = Pricing::money(Pricing::money($iva) - Pricing::money(array_sum(array_column($filas, 'importe'))));
        $filas[0]['baseImp'] = Pricing::money($filas[0]['baseImp'] + $difBase);
        $filas[0]['importe'] = Pricing::money($filas[0]['importe'] + $difIva);

        return $filas;
    }

    private static function claveAlicuota(float $alic): string
    {
        $s = rtrim(rtrim(number_format($alic, 2, '.', ''), '0'), '.');

        return $s === '' ? '0' : $s;
    }

    /**
     * El documento del receptor como lo quiere ARCA. Una Factura A EXIGE CUIT;
     * una B a consumidor final puede ir sin identificar (99/0) hasta el tope.
     *
     * @param  array{tipoDoc:string, numeroDoc:string, condicionIva:string}  $receptor
     * @return array{docTipo:int, docNro:string, condIvaReceptorId:int}
     */
    public static function armarReceptor(string $letra, array $receptor, float $total, float $topeSinIdentificar = 0): array
    {
        $digitos = preg_replace('/\D/', '', (string) ($receptor['numeroDoc'] ?? ''));
        $cond = self::COND_IVA_RECEPTOR[$receptor['condicionIva'] ?? ''] ?? self::COND_IVA_RECEPTOR['consumidor_final'];
        $tipoDoc = $receptor['tipoDoc'] ?? 'dni';

        if ($letra === 'A') {
            if ($tipoDoc !== 'cuit' || strlen($digitos) !== 11) {
                throw new \RuntimeException('Una Factura A necesita el CUIT del cliente (11 dígitos). Cargáselo en su ficha o emitile Factura B.');
            }

            return ['docTipo' => self::DOC_CUIT, 'docNro' => $digitos, 'condIvaReceptorId' => $cond];
        }
        $identificado = $digitos !== '' && $tipoDoc !== 'sin_identificar';
        if (! $identificado) {
            if ($topeSinIdentificar > 0 && $total > $topeSinIdentificar) {
                throw new \RuntimeException('Una venta de $'.number_format($total, 2, ',', '.').' supera el tope para facturar sin identificar: pedile el DNI o el CUIT al cliente y cargalo en su ficha.');
            }

            return ['docTipo' => self::DOC_SIN_IDENTIFICAR, 'docNro' => '0', 'condIvaReceptorId' => $cond];
        }
        $tipo = match ($tipoDoc) {
            'cuit' => self::DOC_CUIT,
            'cuil' => self::DOC_CUIL,
            default => self::DOC_DNI,
        };

        return ['docTipo' => $tipo, 'docNro' => $digitos, 'condIvaReceptorId' => $cond];
    }
}
