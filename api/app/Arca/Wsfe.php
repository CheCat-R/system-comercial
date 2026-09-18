<?php

namespace App\Arca;

use Illuminate\Support\Facades\Http;

/**
 * WSFE — el webservice de facturación. Cuatro llamadas SOAP con plantillas XML
 * fijas y extracción por expresión regular (sin cliente SOAP genérico).
 *
 *   FEDummy                 ¿el servicio está vivo? (sin credenciales)
 *   FECompUltimoAutorizado  el último número emitido → el próximo es +1
 *   FECAESolicitar          emitir y obtener el CAE
 *   FECompConsultar         ¿este número ya salió? → recuperación tras un corte
 */
final class Wsfe
{
    private const NS = 'http://ar.gov.afip.dif.FEV1/';

    private static function esc(mixed $v): string
    {
        return htmlspecialchars((string) $v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private static function tag(string $xml, string $t): string
    {
        return preg_match('/<(?:\w+:)?'.$t.'>([\s\S]*?)<\/(?:\w+:)?'.$t.'>/', $xml, $m) ? trim($m[1]) : '';
    }

    private static function todos(string $xml, string $t): array
    {
        preg_match_all('/<(?:\w+:)?'.$t.'>([\s\S]*?)<\/(?:\w+:)?'.$t.'>/', $xml, $m);

        return $m[1] ?? [];
    }

    /** Los `<Err>` y `<Obs>` de la respuesta, legibles. */
    private static function mensajesDe(string $xml, string $contenedor): array
    {
        $bloque = self::tag($xml, $contenedor);
        if ($bloque === '') {
            return [];
        }
        $out = [];
        foreach (self::todos($bloque, $contenedor === 'Errors' ? 'Err' : 'Obs') as $e) {
            $code = self::tag($e, 'Code');
            $msg = html_entity_decode(self::tag($e, 'Msg'));
            $out[] = $code !== '' ? '['.$code.'] '.$msg : $msg;
        }

        return array_values(array_filter($out));
    }

    private static function llamar(string $metodo, string $cuerpo): string
    {
        $sobre = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="'.self::NS.'">'
            .'<soap:Header/><soap:Body><ar:'.$metodo.'>'.$cuerpo.'</ar:'.$metodo.'></soap:Body></soap:Envelope>';
        try {
            $res = Http::timeout((int) ceil(Config::timeoutSeg()))
                ->withHeaders(['Content-Type' => 'text/xml; charset=utf-8', 'SOAPAction' => self::NS.$metodo])
                ->withBody($sobre, 'text/xml')->post(Config::wsfeUrl());
        } catch (\Throwable $e) {
            throw new ErrorArca('No se pudo contactar a ARCA ('.$e->getMessage().').', true);
        }
        $xml = $res->body();
        $fault = self::tag($xml, 'faultstring');
        if ($fault !== '') {
            throw new ErrorArca('ARCA devolvió un error de servicio: '.html_entity_decode($fault), true);
        }
        if (! $res->ok()) {
            throw new ErrorArca('ARCA respondió HTTP '.$res->status().'.', true);
        }

        return $xml;
    }

    private static function auth(): string
    {
        $ta = Wsaa::obtenerTicket('wsfe');

        return '<ar:Auth><ar:Token>'.$ta['token'].'</ar:Token><ar:Sign>'.$ta['sign'].'</ar:Sign><ar:Cuit>'.Config::cuit().'</ar:Cuit></ar:Auth>';
    }

    private static function pv(?int $ptoVta): int
    {
        return $ptoVta ?: Config::ptoVta();
    }

    /** ¿El servicio está vivo? No pide credenciales. */
    public static function dummy(): array
    {
        $xml = self::llamar('FEDummy', '');
        $e = ['appServer' => self::tag($xml, 'AppServer') ?: '?', 'dbServer' => self::tag($xml, 'DbServer') ?: '?', 'authServer' => self::tag($xml, 'AuthServer') ?: '?'];
        $e['ok'] = strtoupper($e['appServer']) === 'OK' && strtoupper($e['dbServer']) === 'OK' && strtoupper($e['authServer']) === 'OK';

        return $e;
    }

    /** El último número autorizado para (punto de venta, tipo). 0 si nunca se emitió nada. */
    public static function ultimoAutorizado(int $cbteTipo, ?int $ptoVta = null): int
    {
        $xml = self::llamar('FECompUltimoAutorizado', self::auth().'<ar:PtoVta>'.self::pv($ptoVta).'</ar:PtoVta><ar:CbteTipo>'.$cbteTipo.'</ar:CbteTipo>');
        $errores = self::mensajesDe($xml, 'Errors');
        if ($errores) {
            throw new ErrorArca(implode(' · ', $errores), false);
        }

        return (int) self::tag($xml, 'CbteNro');
    }

    /**
     * EMITE EL COMPROBANTE Y DEVUELVE EL CAE. Concepto 1 = Productos (fecha
     * dentro de ±5 días). Importes en pesos con dos decimales.
     *
     * @param array{cbteTipo:int, cbteNro:int, ptoVta?:?int, fecha?:mixed, docTipo:int, docNro:string, condIvaReceptorId:int, impNeto:float, impIva:float, impTotal:float, alicuotas:array, asociado?:?array} $p
     */
    public static function solicitarCae(array $p): array
    {
        $m = fn ($n) => number_format(round((float) $n, 2), 2, '.', '');
        $fecha = Fecha::comprobante($p['fecha'] ?? null);
        $bloqueIva = '';
        if (! empty($p['alicuotas'])) {
            $bloqueIva = '<ar:Iva>'.implode('', array_map(fn ($a) => '<ar:AlicIva><ar:Id>'.$a['id'].'</ar:Id><ar:BaseImp>'.$m($a['baseImp']).'</ar:BaseImp><ar:Importe>'.$m($a['importe']).'</ar:Importe></ar:AlicIva>', $p['alicuotas'])).'</ar:Iva>';
        }
        $bloqueAsoc = '';
        if (! empty($p['asociado'])) {
            $a = $p['asociado'];
            $bloqueAsoc = '<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>'.$a['tipo'].'</ar:Tipo><ar:PtoVta>'.$a['ptoVta'].'</ar:PtoVta><ar:Nro>'.$a['nro'].'</ar:Nro></ar:CbteAsoc></ar:CbtesAsoc>';
        }
        $detalle = '<ar:FECAEDetRequest><ar:Concepto>1</ar:Concepto>'
            .'<ar:DocTipo>'.$p['docTipo'].'</ar:DocTipo><ar:DocNro>'.self::esc($p['docNro']).'</ar:DocNro>'
            .'<ar:CbteDesde>'.$p['cbteNro'].'</ar:CbteDesde><ar:CbteHasta>'.$p['cbteNro'].'</ar:CbteHasta><ar:CbteFch>'.$fecha.'</ar:CbteFch>'
            .'<ar:ImpTotal>'.$m($p['impTotal']).'</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>'.$m($p['impNeto']).'</ar:ImpNeto>'
            .'<ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>'.$m($p['impIva']).'</ar:ImpIVA>'
            .'<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>'
            .'<ar:CondicionIVAReceptorId>'.$p['condIvaReceptorId'].'</ar:CondicionIVAReceptorId>'
            .$bloqueAsoc.$bloqueIva.'</ar:FECAEDetRequest>';
        $cuerpo = self::auth().'<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>'.self::pv($p['ptoVta'] ?? null).'</ar:PtoVta><ar:CbteTipo>'.$p['cbteTipo'].'</ar:CbteTipo></ar:FeCabReq>'
            .'<ar:FeDetReq>'.$detalle.'</ar:FeDetReq></ar:FeCAEReq>';

        $xml = self::llamar('FECAESolicitar', $cuerpo);
        $errores = self::mensajesDe($xml, 'Errors');
        $resultado = self::tag($xml, 'Resultado');
        $observaciones = self::mensajesDe($xml, 'Observations');
        if ($resultado === 'R') {
            // Rechazado = los datos están mal. El número quedó LIBRE.
            throw new ErrorArca(implode(' · ', [...$errores, ...$observaciones]) ?: 'ARCA rechazó el comprobante sin detalle.', false);
        }
        if ($errores && $resultado !== 'A') {
            throw new ErrorArca(implode(' · ', $errores), true);
        }
        $cae = self::tag($xml, 'CAE');
        if ($cae === '') {
            throw new ErrorArca(implode(' · ', [...$errores, ...$observaciones]) ?: 'ARCA aceptó pero no devolvió el CAE.', true);
        }

        return ['cae' => $cae, 'caeVencimiento' => self::tag($xml, 'CAEFchVto'), 'cbteNro' => (int) self::tag($xml, 'CbteDesde') ?: $p['cbteNro'], 'observaciones' => $observaciones];
    }

    /** ¿ESTE NÚMERO YA SE EMITIÓ? La pieza de la recuperación. null = quedó libre. */
    public static function consultarComprobante(int $cbteTipo, int $cbteNro, ?int $ptoVta = null): ?array
    {
        $xml = self::llamar('FECompConsultar', self::auth().'<ar:FeCompConsReq><ar:CbteTipo>'.$cbteTipo.'</ar:CbteTipo><ar:CbteNro>'.$cbteNro.'</ar:CbteNro><ar:PtoVta>'.self::pv($ptoVta).'</ar:PtoVta></ar:FeCompConsReq>');
        $errores = self::mensajesDe($xml, 'Errors');
        if ($errores) {
            // 602 = "no existe en los registros": es la respuesta, no un error.
            foreach ($errores as $e) {
                if (str_contains($e, '[602]')) {
                    return null;
                }
            }
            throw new ErrorArca(implode(' · ', $errores), true);
        }
        $cae = self::tag($xml, 'CodAutorizacion');
        if ($cae === '') {
            return null;
        }

        return [
            'cbteNro' => (int) self::tag($xml, 'CbteDesde') ?: $cbteNro, 'cae' => $cae, 'caeVencimiento' => self::tag($xml, 'FchVto'),
            'impTotal' => (float) self::tag($xml, 'ImpTotal'), 'docTipo' => (int) self::tag($xml, 'DocTipo'), 'docNro' => self::tag($xml, 'DocNro'), 'fecha' => self::tag($xml, 'CbteFch'),
        ];
    }
}
