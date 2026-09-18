<?php

namespace App\Arca;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * WSAA — el ticket de acceso (token + sign). Se consigue firmando un XML con
 * el certificado en CMS/PKCS#7 y mandándolo por SOAP. Dura ~12 horas.
 *
 *  1. Se firma con `openssl_pkcs7_sign` (extensión OpenSSL de PHP, presente en
 *     cualquier hosting): no hace falta el binario `openssl`.
 *  2. El cache en `arca_tokens` es OBLIGATORIO: ARCA rechaza pedir un ticket
 *     nuevo mientras haya otro vigente.
 *  3. La clave del cache lleva el entorno: un ticket de homologación no sirve
 *     en producción.
 */
final class Wsaa
{
    /** Margen para no usar nunca uno a punto de vencer en medio de una emisión. */
    private const MARGEN_SEG = 120;

    private static array $enMemoria = [];

    private static function claveCache(string $service): string
    {
        return Config::produccion() ? $service.'@prod' : $service;
    }

    private static function vigente(?array $t): bool
    {
        return $t && $t['expiresAt']->getTimestamp() > time() + self::MARGEN_SEG;
    }

    private static function entreTags(string $xml, string $tag): string
    {
        return preg_match('/<(?:\w+:)?'.$tag.'>([\s\S]*?)<\/(?:\w+:)?'.$tag.'>/', $xml, $m) ? trim($m[1]) : '';
    }

    /** El `loginTicketRequest` firmado en CMS y en base64 (sin cabeceras MIME). */
    private static function armarCms(string $service): string
    {
        $ahora = time();
        $tra = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<loginTicketRequest version="1.0"><header>'
            .'<uniqueId>'.$ahora.'</uniqueId>'
            .'<generationTime>'.Fecha::selloWsaa(Carbon::createFromTimestamp($ahora - 600)).'</generationTime>'
            .'<expirationTime>'.Fecha::selloWsaa(Carbon::createFromTimestamp($ahora + 600)).'</expirationTime>'
            .'</header><service>'.$service.'</service></loginTicketRequest>';

        $dir = sys_get_temp_dir();
        $in = tempnam($dir, 'tra');
        $out = tempnam($dir, 'cms');
        file_put_contents($in, $tra);
        $cert = 'file://'.Config::certPath();
        $key = 'file://'.Config::keyPath();
        $ok = openssl_pkcs7_sign($in, $out, $cert, $key, [], PKCS7_BINARY | PKCS7_NOATTR);
        @unlink($in);
        if (! $ok) {
            @unlink($out);
            throw new ErrorArca('No se pudo firmar el pedido de acceso: '.(openssl_error_string() ?: 'revisá el certificado y la clave.'), false);
        }
        $smime = file_get_contents($out);
        @unlink($out);
        // Sale como S/MIME: cabeceras, línea vacía, y el CMS en base64. Nos quedamos con el cuerpo.
        $partes = preg_split("/\r?\n\r?\n/", $smime, 2);

        return preg_replace('/\s+/', '', $partes[1] ?? '');
    }

    private static function pedirTicket(string $service): array
    {
        $cms = self::armarCms($service);
        $sobre = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">'
            .'<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>'.$cms.'</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>';

        try {
            $res = Http::timeout((int) ceil(Config::timeoutSeg()))->withHeaders(['Content-Type' => 'text/xml; charset=utf-8', 'SOAPAction' => ''])
                ->withBody($sobre, 'text/xml')->post(Config::wsaaUrl());
        } catch (\Throwable $e) {
            throw new ErrorArca('No se pudo contactar al WSAA ('.$e->getMessage().').', true);
        }
        $xml = $res->body();
        $fault = self::entreTags($xml, 'faultstring');
        if ($fault !== '') {
            throw new ErrorArca('WSAA rechazó el pedido: '.html_entity_decode($fault), false);
        }
        if (! $res->ok()) {
            throw new ErrorArca('WSAA respondió HTTP '.$res->status().'.', true);
        }
        $interno = html_entity_decode(self::entreTags($xml, 'loginCmsReturn'));
        $token = self::entreTags($interno, 'token');
        $sign = self::entreTags($interno, 'sign');
        $expira = self::entreTags($interno, 'expirationTime');
        if ($token === '' || $sign === '') {
            throw new ErrorArca('WSAA contestó sin token: revisá el certificado y su autorización al servicio.', false);
        }

        return ['token' => $token, 'sign' => $sign, 'expiresAt' => $expira ? Carbon::parse($expira)->utc() : Carbon::now()->addHours(11)];
    }

    /** El ticket vigente: memoria → base → ARCA. */
    public static function obtenerTicket(string $service = 'wsfe'): array
    {
        if (! Config::disponible()) {
            throw new ErrorArca(Config::motivoNoDisponible() ?? 'ARCA no está configurado.', false);
        }
        $clave = self::claveCache($service);
        if (self::vigente(self::$enMemoria[$clave] ?? null)) {
            return self::$enMemoria[$clave];
        }
        $g = DB::table('arca_tokens')->where('service', $clave)->first();
        $guardado = $g ? ['token' => $g->token, 'sign' => $g->sign, 'expiresAt' => Carbon::parse($g->expires_at)] : null;
        if (self::vigente($guardado)) {
            return self::$enMemoria[$clave] = $guardado;
        }
        try {
            $nuevo = self::pedirTicket($service);
            DB::table('arca_tokens')->updateOrInsert(['service' => $clave], [
                'token' => $nuevo['token'], 'sign' => $nuevo['sign'], 'expires_at' => $nuevo['expiresAt'], 'updated_at' => now(), 'created_at' => now(),
            ]);

            return self::$enMemoria[$clave] = $nuevo;
        } catch (ErrorArca $e) {
            /* "Ya posee un TA válido": ARCA no da otro hasta que venza. Si tenemos
             * la copia guardada, ESA es la única que va a aceptar. */
            if ($guardado && preg_match('/ya posee un ta v[aá]lido|alreadyAuthenticated/i', $e->getMessage())) {
                return self::$enMemoria[$clave] = $guardado;
            }
            throw $e;
        }
    }
}
