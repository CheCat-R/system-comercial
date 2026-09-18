<?php

namespace App\Arca;

/**
 * EL QR FISCAL (RG 4892): JSON en base64 en una URL fija de ARCA. Vive en la
 * API porque acá están las tablas de códigos y el CUIT del certificado; el
 * navegador solo lo dibuja. `null` = este comprobante no lleva QR.
 */
final class Qr
{
    private const DOC_POR_NOMBRE = [
        'cuit' => Comprobante::DOC_CUIT, 'cuil' => Comprobante::DOC_CUIL, 'dni' => Comprobante::DOC_DNI, 'sin_identificar' => Comprobante::DOC_SIN_IDENTIFICAR,
    ];

    /** @param array{tipo:string, puntoVenta:string, numero:?int, fecha:mixed, total:float, cae:string, receptor?:?array} $d */
    public static function url(array $d): ?string
    {
        $tipoCmp = Comprobante::CBTE_TIPO[$d['tipo']] ?? null;
        $cae = trim((string) ($d['cae'] ?? ''));
        if (! $tipoCmp || empty($d['numero']) || ! preg_match('/^\d+$/', $cae) || Config::cuit() === '') {
            return null;
        }
        $digitos = preg_replace('/\D/', '', (string) ($d['receptor']['numeroDoc'] ?? ''));
        $tipoDocRec = $digitos !== '' ? (self::DOC_POR_NOMBRE[$d['receptor']['tipoDoc'] ?? ''] ?? Comprobante::DOC_DNI) : Comprobante::DOC_SIN_IDENTIFICAR;
        $payload = [
            'ver' => 1, 'fecha' => Fecha::qr($d['fecha']), 'cuit' => (int) Config::cuit(),
            'ptoVta' => (int) ($d['puntoVenta'] ?: Config::ptoVta()), 'tipoCmp' => $tipoCmp, 'nroCmp' => (int) $d['numero'],
            'importe' => round((float) $d['total'], 2), 'moneda' => 'PES', 'ctz' => 1,
            'tipoDocRec' => $tipoDocRec, 'nroDocRec' => $digitos !== '' ? (int) $digitos : 0,
            'tipoCodAut' => 'E', 'codAut' => (int) $cae,
        ];

        return 'https://www.afip.gob.ar/fe/qr/?p='.base64_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    }
}
