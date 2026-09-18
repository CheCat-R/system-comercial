<?php

namespace App\Arca;

/**
 * El interruptor general y las URLs. Homologación no tiene valor fiscal: es
 * donde se prueba todo. Producción emite facturas de verdad.
 */
final class Config
{
    private static ?bool $cacheDisponible = null;

    public static function produccion(): bool
    {
        return (bool) config('arca.produccion');
    }

    /** CUIT del emisor, 11 dígitos. Tiene que coincidir con el del certificado. */
    public static function cuit(): string
    {
        return (string) config('arca.cuit');
    }

    public static function ptoVta(): int
    {
        return (int) config('arca.pto_vta');
    }

    public static function wsaaUrl(): string
    {
        return self::produccion() ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms' : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
    }

    public static function wsfeUrl(): string
    {
        return self::produccion() ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx' : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
    }

    public static function certPath(): string
    {
        return (string) config('arca.cert_path');
    }

    public static function keyPath(): string
    {
        return (string) config('arca.key_path');
    }

    public static function timeoutSeg(): float
    {
        return max(1, (int) config('arca.timeout_ms')) / 1000;
    }

    /**
     * ¿Se puede facturar? Sin certificado, TODA la facturación se apaga sola y
     * el sistema opera exactamente como antes. Se cachea por request: mirar el
     * disco en cada venta no tiene sentido.
     */
    public static function disponible(): bool
    {
        if (self::$cacheDisponible === null) {
            self::$cacheDisponible = self::cuit() !== '' && self::ptoVta() > 0
                && self::certPath() !== '' && self::keyPath() !== ''
                && is_file(self::certPath()) && is_file(self::keyPath());
        }

        return self::$cacheDisponible;
    }

    public static function resetDisponible(): void
    {
        self::$cacheDisponible = null;
    }

    /** POR QUÉ no se puede facturar, en castellano. */
    public static function motivoNoDisponible(): ?string
    {
        if (self::disponible()) {
            return null;
        }
        $cuit = self::cuit();
        if ($cuit === '') {
            return 'Falta ARCA_CUIT (el CUIT del emisor, 11 dígitos).';
        }
        if (strlen($cuit) !== 11) {
            return 'ARCA_CUIT tiene '.strlen($cuit).' dígitos y necesita 11.';
        }
        if (! self::ptoVta()) {
            return 'Falta ARCA_PTO_VTA (el punto de venta tipo "Web Services").';
        }
        if (self::certPath() === '') {
            return 'Falta ARCA_CERT_PATH (la ruta al certificado .crt).';
        }
        if (self::keyPath() === '') {
            return 'Falta ARCA_KEY_PATH (la ruta a la clave privada .key).';
        }
        if (! is_file(self::certPath())) {
            return 'No existe el certificado en '.self::certPath().'. Revisá el nombre EXACTO del archivo (Windows esconde las extensiones y suele quedar ".crt.crt").';
        }
        if (! is_file(self::keyPath())) {
            return 'No existe la clave privada en '.self::keyPath().'. Mismo chequeo que el certificado.';
        }

        return 'Configuración de ARCA incompleta.';
    }

    /** El punto de venta con el formato del comprobante: CINCO dígitos. */
    public static function puntoVenta(?int $ptoVta = null): string
    {
        $n = $ptoVta ?: self::ptoVta();

        return $n ? str_pad((string) $n, 5, '0', STR_PAD_LEFT) : '';
    }

    /** Lo que sabe ARCA contra lo que dice el membrete: avisos, no bloqueos. */
    public static function diferenciasConEmpresa(array $empresa): array
    {
        $avisos = [];
        $cuit = self::cuit();
        $suyo = preg_replace('/\D/', '', (string) ($empresa['cuit'] ?? ''));
        if ($cuit !== '' && $suyo === '') {
            $avisos[] = 'Sistema › Empresa NO tiene el CUIT cargado, así que las facturas se imprimen SIN el CUIT del emisor — y sin ese dato el comprobante no sirve. El CAE se pide igual (con '.$cuit.', el del certificado), o sea que el error no se nota hasta que alguien mira el papel.';
        } elseif ($cuit !== '' && $suyo !== $cuit) {
            $avisos[] = 'El CUIT con el que se factura ('.$cuit.') no es el de Sistema › Empresa ('.$suyo.'). El de ARCA es el del certificado y es el que manda; corregí el del membrete.';
        }
        if ($cuit !== '' && trim((string) ($empresa['razonSocial'] ?? '')) === '') {
            $avisos[] = 'Sistema › Empresa no tiene la razón social cargada: las facturas van a salir a nombre de "'.(trim((string) ($empresa['nombre'] ?? '')) ?: '(sin nombre)').'", que es el nombre de fantasía. Si ante ARCA facturás con otro nombre, cargalo — en la factura es obligatorio.';
        }

        return $avisos;
    }
}
