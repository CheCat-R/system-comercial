<?php

namespace App\Arca;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * ARCA — la bisagra entre el protocolo y el negocio. Recibe los números de una
 * venta, emite, y devuelve un resultado que el POS entiende sin conocer ARCA.
 *
 *  1. LA NUMERACIÓN LA LLEVA ARCA: antes de cada comprobante se pregunta el
 *     último y se pide el siguiente.
 *  2. DOS CAJAS NO PUEDEN PEDIR EL MISMO NÚMERO: se serializa con un lock por
 *     (punto de venta, tipo). En PHP no hay proceso persistente, así que el
 *     lock vive en el cache (atómico también en hosting compartido).
 *  3. LA RESPUESTA QUE SE PIERDE: si el pedido falla por red, se consulta el
 *     número; y la venta guardó el número reservado, así el reintento
 *     consulta antes de emitir.
 *
 * `emitir()` NUNCA lanza por un problema de ARCA: devuelve `ok: false` con el
 * motivo, y el POS saca el ticket provisorio.
 */
class ArcaService
{
    public function disponible(): bool
    {
        return Config::disponible();
    }

    public function motivo(): ?string
    {
        return Config::motivoNoDisponible();
    }

    /**
     * @param array{tipo:string, receptor:array, renglones:array, neto:float, iva:float, total:float, ptoVta?:?int, fecha?:mixed, asociado?:?array, reservado?:?array, reservar?:?callable} $p
     */
    public function emitir(array $p): array
    {
        $vacio = ['ok' => true, 'conCae' => false, 'cae' => '', 'caeVencimiento' => null, 'cbteNro' => null, 'puntoVenta' => null, 'observaciones' => []];
        if (! Comprobante::esFiscal($p['tipo']) || ! Config::disponible()) {
            return $vacio;
        }
        $cbteTipo = Comprobante::CBTE_TIPO[$p['tipo']];
        $letra = Comprobante::letraDe($p['tipo']);
        try {
            $receptor = Comprobante::armarReceptor($letra, $p['receptor'], (float) $p['total']);
            $alicuotas = Comprobante::armarAlicuotas($p['renglones'], (float) $p['neto'], (float) $p['iva']);
        } catch (\RuntimeException $e) {
            return ['ok' => false, 'motivo' => $e->getMessage(), 'reintentable' => false];
        }
        $ptoVta = (int) ($p['ptoVta'] ?? 0) ?: Config::ptoVta();
        $asociado = ! empty($p['asociado']) ? [
            'tipo' => Comprobante::CBTE_TIPO[$p['asociado']['tipo']] ?? 0,
            'ptoVta' => (int) preg_replace('/\D/', '', (string) $p['asociado']['ptoVta']) ?: $ptoVta,
            'nro' => (int) $p['asociado']['numero'],
        ] : null;

        $lock = Cache::lock('arca:'.$ptoVta.':'.$cbteTipo, 60);
        try {
            return $lock->block(30, function () use ($p, $cbteTipo, $receptor, $alicuotas, $ptoVta, $asociado) {
                try {
                    /* 1. ¿Quedó algo en vuelo de un intento anterior? */
                    if (! empty($p['reservado']) && (int) $p['reservado']['cbteTipo'] === $cbteTipo) {
                        $previo = $this->adoptarSiExiste((int) $p['reservado']['cbteNro'], $cbteTipo, (float) $p['total'], $receptor['docNro'], $ptoVta);
                        if ($previo) {
                            return $previo;
                        }
                    }
                    /* 2. El número lo dice ARCA. */
                    $numero = Wsfe::ultimoAutorizado($cbteTipo, $ptoVta) + 1;
                    if (! empty($p['reservar'])) {
                        ($p['reservar'])($numero, $cbteTipo);
                    }
                    /* 3. Emitir. */
                    $pedido = [
                        'cbteTipo' => $cbteTipo, 'cbteNro' => $numero, 'ptoVta' => $ptoVta, 'fecha' => $p['fecha'] ?? null,
                        'docTipo' => $receptor['docTipo'], 'docNro' => $receptor['docNro'], 'condIvaReceptorId' => $receptor['condIvaReceptorId'],
                        'impNeto' => $p['neto'], 'impIva' => $p['iva'], 'impTotal' => $p['total'], 'alicuotas' => $alicuotas, 'asociado' => $asociado,
                    ];
                    try {
                        $r = Wsfe::solicitarCae($pedido);

                        return $this->exito($r['cae'], $r['caeVencimiento'], $r['cbteNro'], $r['observaciones'], $ptoVta);
                    } catch (ErrorArca $e) {
                        // 10016: alguien tomó ese número en el medio. Se reintenta UNA vez.
                        if (preg_match('/10016|no se corresponde con el pr[oó]ximo/i', $e->getMessage())) {
                            $numero = Wsfe::ultimoAutorizado($cbteTipo, $ptoVta) + 1;
                            if (! empty($p['reservar'])) {
                                ($p['reservar'])($numero, $cbteTipo);
                            }
                            $r = Wsfe::solicitarCae([...$pedido, 'cbteNro' => $numero]);

                            return $this->exito($r['cae'], $r['caeVencimiento'], $r['cbteNro'], $r['observaciones'], $ptoVta);
                        }
                        // Fallo de red con el pedido en vuelo: ¿ARCA emitió igual?
                        if ($e->reintentable) {
                            try {
                                $rescatado = $this->adoptarSiExiste($numero, $cbteTipo, (float) $p['total'], $receptor['docNro'], $ptoVta);
                                if ($rescatado) {
                                    return $rescatado;
                                }
                            } catch (\Throwable) {
                            }
                        }

                        return ['ok' => false, 'motivo' => $e->getMessage(), 'reintentable' => $e->reintentable];
                    }
                } catch (ErrorArca $e) {
                    return ['ok' => false, 'motivo' => $e->getMessage(), 'reintentable' => $e->reintentable];
                } catch (\Throwable $e) {
                    return ['ok' => false, 'motivo' => $e->getMessage(), 'reintentable' => true];
                }
            });
        } catch (\Illuminate\Contracts\Cache\LockTimeoutException) {
            return ['ok' => false, 'motivo' => 'Otra caja está facturando en este momento y no liberó el turno de ARCA. Reintentá en unos segundos.', 'reintentable' => true];
        }
    }

    private function exito(string $cae, string $vto, int $nro, array $obs, int $ptoVta): array
    {
        return ['ok' => true, 'conCae' => true, 'cae' => $cae, 'caeVencimiento' => Fecha::parsearArca($vto), 'cbteNro' => $nro, 'puntoVenta' => Config::puntoVenta($ptoVta), 'observaciones' => $obs];
    }

    /** ¿Ese número ya salió, y es nuestro? Importe y documento tienen que coincidir. */
    private function adoptarSiExiste(int $cbteNro, int $cbteTipo, float $total, string $docNro, int $ptoVta): ?array
    {
        $previo = Wsfe::consultarComprobante($cbteTipo, $cbteNro, $ptoVta);
        if (! $previo) {
            return null;
        }
        if (abs($previo['impTotal'] - $total) > 0.01 || (string) ($previo['docNro'] ?: '0') !== (string) ($docNro ?: '0')) {
            return null;
        }

        return [...$this->exito($previo['cae'], $previo['caeVencimiento'], $previo['cbteNro'], [], $ptoVta), 'adoptado' => true];
    }

    /* ------------------------- Diagnóstico ------------------------- */

    public function estado(): array
    {
        Config::resetDisponible();

        return [
            'produccion' => Config::produccion(), 'cuit' => Config::cuit(), 'puntoVenta' => Config::ptoVta() ? Config::puntoVenta() : '',
            'disponible' => Config::disponible(), 'motivo' => Config::motivoNoDisponible(),
            'certPath' => Config::certPath(), 'keyPath' => Config::keyPath(), 'timeoutMs' => (int) config('arca.timeout_ms'), 'wsfeUrl' => Config::wsfeUrl(),
        ];
    }

    /** Los puntos de venta en uso, uno por sucursal; los que no tienen caen al del .env. */
    private function puntosDeVenta(): array
    {
        $salida = [];
        $sinPropio = [];
        foreach (DB::table('sucursales')->orderBy('id')->get(['id', 'nombre', 'punto_venta']) as $f) {
            $numero = (int) preg_replace('/\D/', '', (string) $f->punto_venta);
            if ($numero) {
                $salida[] = ['sucursalId' => $f->id, 'sucursal' => $f->nombre, 'puntoVenta' => Config::puntoVenta($numero), 'numero' => $numero, 'propio' => true];
            } else {
                $sinPropio[] = $f->nombre;
            }
        }
        if ($sinPropio && Config::ptoVta()) {
            $salida[] = ['sucursalId' => null, 'sucursal' => implode(', ', $sinPropio), 'puntoVenta' => Config::puntoVenta(), 'numero' => Config::ptoVta(), 'propio' => false];
        }

        return $salida;
    }

    /** Las tres preguntas en orden: ¿ARCA vive? ¿nos reconoce el certificado? ¿el punto de venta está autorizado? */
    public function diagnostico(): array
    {
        $base = $this->estado();
        $inicio = microtime(true);
        $pasos = [];
        $paso = function (string $clave, string $titulo, callable $fn) use (&$pasos): bool {
            $t0 = microtime(true);
            try {
                $pasos[] = ['clave' => $clave, 'titulo' => $titulo, 'ok' => true, 'detalle' => $fn(), 'ms' => (int) ((microtime(true) - $t0) * 1000)];

                return true;
            } catch (\Throwable $e) {
                $pasos[] = ['clave' => $clave, 'titulo' => $titulo, 'ok' => false, 'detalle' => $e->getMessage(), 'ms' => (int) ((microtime(true) - $t0) * 1000)];

                return false;
            }
        };
        $vivo = $paso('servicio', 'El servicio de ARCA responde', function () {
            $d = Wsfe::dummy();
            if (! $d['ok']) {
                throw new \RuntimeException('ARCA contesta pero se declara caído ('.json_encode($d).').');
            }

            return 'appserver, dbserver y authserver en OK.';
        });
        if (! $base['disponible']) {
            $pasos[] = ['clave' => 'config', 'titulo' => 'La configuración está completa', 'ok' => false, 'detalle' => $base['motivo'], 'ms' => 0];

            return [...$base, 'pasos' => $pasos, 'numeracion' => [], 'ms' => (int) ((microtime(true) - $inicio) * 1000),
                'veredicto' => $vivo ? 'ARCA está funcionando; lo que falta es de este lado. '.$base['motivo'] : $base['motivo'].' Y además ARCA no está contestando.'];
        }
        $autenticado = $vivo && $paso('ticket', 'El certificado autentica (WSAA)', function () {
            $ta = Wsaa::obtenerTicket('wsfe');

            return 'Ticket de acceso vigente hasta '.$ta['expiresAt']->setTimezone(Fecha::ZONA)->format('d/m/Y H:i').'.';
        });
        $numeracion = [];
        if ($autenticado) {
            $puntos = $this->puntosDeVenta();
            $paso('numeracion', count($puntos) > 1 ? 'Los '.count($puntos).' puntos de venta están autorizados' : 'El punto de venta '.($puntos[0]['puntoVenta'] ?? $base['puntoVenta']).' está autorizado', function () use ($puntos, &$numeracion) {
                foreach ($puntos as $p) {
                    $tipos = [];
                    foreach (['factura_a', 'factura_b'] as $tipo) {
                        try {
                            $tipos[] = ['tipo' => $tipo, 'ultimo' => Wsfe::ultimoAutorizado(Comprobante::CBTE_TIPO[$tipo], $p['numero'])];
                        } catch (\Throwable $e) {
                            $tipos[] = ['tipo' => $tipo, 'ultimo' => null, 'error' => $e->getMessage()];
                        }
                    }
                    $numeracion[] = [...$p, 'tipos' => $tipos];
                }
                $mudos = array_values(array_filter($numeracion, fn ($n) => ! array_filter($n['tipos'], fn ($t) => empty($t['error']))));
                if ($numeracion && count($mudos) === count($numeracion)) {
                    throw new \RuntimeException($mudos[0]['tipos'][0]['error']);
                }
                if ($mudos) {
                    return (count($numeracion) - count($mudos)).' de '.count($numeracion).' contestan. Sin autorizar: '.implode(', ', array_map(fn ($m) => $m['sucursal'].' ('.$m['puntoVenta'].')', $mudos)).'.';
                }

                return count($numeracion) === 1 ? 'Los comprobantes contestan con su último número.' : 'Los '.count($numeracion).' contestan con su último número.';
            });
        }
        $roto = collect($pasos)->firstWhere('ok', false);

        return [...$base, 'pasos' => $pasos, 'numeracion' => $numeracion, 'ms' => (int) ((microtime(true) - $inicio) * 1000),
            'veredicto' => $roto ? $roto['titulo'].': NO. '.$roto['detalle'] : 'Todo en orden: se puede facturar contra '.(Config::produccion() ? 'PRODUCCIÓN' : 'homologación').'.'];
    }
}
