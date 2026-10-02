<?php

namespace App\Licencias;

use RuntimeException;

/**
 * FIRMAR Y VERIFICAR con OpenSSL (ECDSA sobre la curva P-256, SHA-256).
 *
 * Se usa OpenSSL y no `sodium` porque ya es requisito del sistema (la
 * facturación electrónica con ARCA lo necesita) y está en cualquier servidor;
 * `sodium` hay que activarlo a mano en algunos entornos.
 *
 * La instalación del cliente solo necesita la clave PÚBLICA: puede comprobar
 * que una clave la emitió CCS, pero no puede fabricar una.
 */
final class Firma
{
    /**
     * Un par de claves nuevo, en formato PEM: `['privada' => ..., 'publica' => ...]`.
     *
     * En Windows (XAMPP) OpenSSL no encuentra su `openssl.cnf` solo y la generación
     * falla con "No such process": por eso se prueban los lugares habituales.
     */
    public static function generarPar(?string $openssl_cnf = null): array
    {
        $candidatos = $openssl_cnf ? [$openssl_cnf] : [];
        $candidatos[] = null; // sin config explícita: lo normal en Linux/macOS
        foreach ([getenv('OPENSSL_CONF'), 'C:/xampp/php/extras/openssl/openssl.cnf', 'C:/xampp/apache/conf/openssl.cnf', '/etc/ssl/openssl.cnf'] as $c) {
            if ($c) {
                $candidatos[] = $c;
            }
        }

        foreach ($candidatos as $cnf) {
            $opciones = ['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1'];
            if ($cnf !== null) {
                if (! is_file($cnf)) {
                    continue;
                }
                $opciones['config'] = $cnf;
            }
            $clave = @openssl_pkey_new($opciones);
            if ($clave === false) {
                continue;
            }
            $privada = '';
            if (! @openssl_pkey_export($clave, $privada, null, $cnf !== null ? ['config' => $cnf] : [])) {
                continue;
            }

            return ['privada' => $privada, 'publica' => openssl_pkey_get_details($clave)['key']];
        }

        throw new RuntimeException('OpenSSL no pudo generar las claves. Pasá la ruta de su archivo de configuración con --openssl-cnf=...');
    }

    /** La firma (binaria) de `$mensaje` con la clave privada. */
    public static function firmar(string $mensaje, string $privadaPem): string
    {
        $firma = '';
        if (! @openssl_sign($mensaje, $firma, $privadaPem, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('No se pudo firmar: la clave privada no es válida.');
        }

        return $firma;
    }

    public static function verificar(string $mensaje, string $firma, string $publicaPem): bool
    {
        return @openssl_verify($mensaje, $firma, $publicaPem, OPENSSL_ALGO_SHA256) === 1;
    }

    public static function b64(string $binario): string
    {
        return rtrim(strtr(base64_encode($binario), '+/', '-_'), '=');
    }

    public static function deB64(string $texto): string|false
    {
        $normal = strtr($texto, '-_', '+/');

        return base64_decode($normal.str_repeat('=', (4 - strlen($normal) % 4) % 4), true);
    }
}
