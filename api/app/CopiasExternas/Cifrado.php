<?php

namespace App\CopiasExternas;

use InvalidArgumentException;
use RuntimeException;

/**
 * CIFRADO DE LAS COPIAS QUE SALEN DEL SERVIDOR.
 *
 * Una copia de la base lleva los clientes, los precios y los usuarios de un comercio. Si va a un Google Drive —la cuenta de quien opera
 * el servicio, no la del comercio— tiene que viajar y quedar CIFRADA: lo que Google guarda no se puede leer sin la clave, que vive
 * en el servidor (para cifrar) y en el gestor de contraseñas de quien opera (para poder restaurar si el servidor se pierde).
 *
 * AES-256-GCM por TROZOS (la copia puede pesar cientos de MB y no se carga entera en memoria). Formato:
 *
 *     "CCSE2" · sal (16 bytes) · tamaño de trozo (4 bytes) · [ trozo cifrado · etiqueta (16 bytes) ] …
 *
 *   · La clave de cada archivo se deriva de la maestra y de una sal propia: la misma clave no se usa dos veces con el mismo IV.
 *   · El IV de cada trozo es su número de orden, y el número y la marca "último trozo" van como dato autenticado: reordenar trozos,
 *     repetir uno o CORTAR el final del archivo se detecta (un archivo truncado no se confunde con uno completo).
 */
final class Cifrado
{
    private const MAGIA = 'CCSE2';

    private const ETIQUETA = 16;

    public const TROZO = 1048576;

    /** Una clave maestra nueva (32 bytes al azar), en base64 para guardarla como texto. */
    public static function nuevaClave(): string
    {
        return base64_encode(random_bytes(32));
    }

    public static function claveValida(string $claveB64): bool
    {
        $k = base64_decode(trim($claveB64), true);

        return $k !== false && strlen($k) === 32;
    }

    public static function cifrar(string $origen, string $destino, string $claveB64, int $trozo = self::TROZO): void
    {
        $maestra = self::maestra($claveB64);
        if ($trozo < 1) {
            throw new InvalidArgumentException('El tamaño de trozo tiene que ser positivo.');
        }
        $in = @fopen($origen, 'rb');
        $out = @fopen($destino, 'wb');
        if ($in === false || $out === false) {
            throw new RuntimeException('No se pudo abrir el archivo para cifrarlo.');
        }
        try {
            $sal = random_bytes(16);
            $clave = hash_hkdf('sha256', $maestra, 32, 'ccs-copia-v1', $sal);
            fwrite($out, self::MAGIA.$sal.pack('N', $trozo));

            $n = 0;
            $actual = self::leer($in, $trozo);
            do {
                $siguiente = self::leer($in, $trozo);
                $final = $siguiente === '';
                $cifrado = openssl_encrypt($actual, 'aes-256-gcm', $clave, OPENSSL_RAW_DATA, self::iv($n), $etiqueta, self::aad($n, $final), self::ETIQUETA);
                if ($cifrado === false) {
                    throw new RuntimeException('OpenSSL no pudo cifrar la copia.');
                }
                fwrite($out, $cifrado.$etiqueta);
                $actual = $siguiente;
                $n++;
            } while (! $final);
        } catch (\Throwable $e) {
            fclose($in);
            fclose($out);
            @unlink($destino);
            throw $e;
        }
        fclose($in);
        fclose($out);
    }

    public static function descifrar(string $origen, string $destino, string $claveB64): void
    {
        $maestra = self::maestra($claveB64);
        $in = @fopen($origen, 'rb');
        if ($in === false) {
            throw new RuntimeException('No se pudo abrir la copia cifrada.');
        }
        $cabecera = self::leer($in, strlen(self::MAGIA) + 16 + 4);
        if (strlen($cabecera) < strlen(self::MAGIA) + 20 || ! str_starts_with($cabecera, self::MAGIA)) {
            fclose($in);
            throw new RuntimeException('Ese archivo no es una copia cifrada de CCS.');
        }
        $sal = substr($cabecera, strlen(self::MAGIA), 16);
        $trozo = unpack('N', substr($cabecera, -4))[1];
        if ($trozo < 1) {
            fclose($in);
            throw new RuntimeException('La copia cifrada tiene la cabecera dañada.');
        }
        $clave = hash_hkdf('sha256', $maestra, 32, 'ccs-copia-v1', $sal);
        $out = fopen($destino, 'wb');
        $marco = $trozo + self::ETIQUETA;

        try {
            $n = 0;
            $actual = self::leer($in, $marco);
            do {
                $siguiente = self::leer($in, $marco);
                $final = $siguiente === '';
                if (strlen($actual) < self::ETIQUETA) {
                    throw new RuntimeException('truncada');
                }
                $plano = openssl_decrypt(substr($actual, 0, -self::ETIQUETA), 'aes-256-gcm', $clave, OPENSSL_RAW_DATA, self::iv($n), substr($actual, -self::ETIQUETA), self::aad($n, $final));
                if ($plano === false) {
                    throw new RuntimeException('no coincide');
                }
                fwrite($out, $plano);
                $actual = $siguiente;
                $n++;
            } while (! $final);
        } catch (\Throwable $e) {
            fclose($in);
            fclose($out);
            @unlink($destino);
            throw new RuntimeException('La copia está dañada, incompleta, o la clave de cifrado no es la correcta.');
        }
        fclose($in);
        fclose($out);
    }

    private static function maestra(string $claveB64): string
    {
        $k = base64_decode(trim($claveB64), true);
        if ($k === false || strlen($k) !== 32) {
            throw new InvalidArgumentException('La clave de cifrado no es válida (tiene que ser de 32 bytes en base64).');
        }

        return $k;
    }

    /** 12 bytes: el número de trozo. */
    private static function iv(int $n): string
    {
        return "\0\0\0\0".pack('J', $n);
    }

    private static function aad(int $n, bool $final): string
    {
        return pack('J', $n).($final ? "\1" : "\0");
    }

    /** Lee hasta `$n` bytes: `fread` puede devolver menos aunque el archivo siga. */
    private static function leer($h, int $n): string
    {
        $b = '';
        while (strlen($b) < $n && ! feof($h)) {
            $p = fread($h, $n - strlen($b));
            if ($p === false || $p === '') {
                break;
            }
            $b .= $p;
        }

        return $b;
    }
}
