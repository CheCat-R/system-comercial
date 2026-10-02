<?php

namespace App\Licencias;

use App\Services\LicenciaService;
use Carbon\Carbon;

/**
 * UNA LICENCIA: lo que CCS le firma a UNA instalación — qué plan y hasta cuándo.
 *
 * Viaja como una clave de activación de una sola línea que el dueño pega en
 * Sistema › Licencia:
 *
 *     CCS1.<datos en base64url>.<firma en base64url>
 *
 * Los datos son un JSON chico (instalación, cliente, plan, emitida, vence,
 * modalidad). Como están FIRMADOS, nadie puede cambiarles el plan ni alargarles
 * el vencimiento sin la clave privada — ni editando el archivo, ni la base.
 * Y como llevan el ID de la instalación, una clave sirve en UN solo servidor.
 */
final class Licencia
{
    private const PREFIJO = 'CCS1';

    public const MODALIDADES = ['mensual', 'anual', 'otra'];

    public function __construct(
        public readonly string $instalacion,
        public readonly string $cliente,
        public readonly string $plan,
        /** Fecha (Y-m-d) en que se emitió. */
        public readonly string $emitida,
        /** Último día (Y-m-d, inclusive) en que la licencia vale. */
        public readonly string $vence,
        public readonly string $modalidad,
    ) {}

    /**
     * Arma y FIRMA la clave de activación. Solo la corre quien tiene la clave
     * privada (`php artisan licencia:emitir`).
     *
     * @param array{instalacion:string, cliente:string, plan:string, vence:string, modalidad?:string, emitida?:string} $datos
     */
    public static function emitir(array $datos, string $privadaPem): string
    {
        $lic = new self(
            instalacion: trim((string) ($datos['instalacion'] ?? '')),
            cliente: trim((string) ($datos['cliente'] ?? '')),
            plan: (string) ($datos['plan'] ?? ''),
            emitida: (string) ($datos['emitida'] ?? now(config('licencia.zona'))->toDateString()),
            vence: (string) ($datos['vence'] ?? ''),
            modalidad: (string) ($datos['modalidad'] ?? 'otra'),
        );
        $lic->validar();

        $datosB64 = Firma::b64((string) json_encode([
            'instalacion' => $lic->instalacion, 'cliente' => $lic->cliente, 'plan' => $lic->plan,
            'emitida' => $lic->emitida, 'vence' => $lic->vence, 'modalidad' => $lic->modalidad,
        ], JSON_UNESCAPED_UNICODE));
        $firmado = self::PREFIJO.'.'.$datosB64;

        return $firmado.'.'.Firma::b64(Firma::firmar($firmado, $privadaPem));
    }

    /**
     * Lee una clave de activación y comprueba su firma.
     *
     * @throws LicenciaInvalida si no es una clave nuestra o fue alterada
     */
    public static function leer(string $clave, string $publicaPem): self
    {
        // Pegar una clave larga suele meterle saltos de línea o espacios: se ignoran.
        $limpia = preg_replace('/\s+/', '', $clave) ?? '';
        $partes = explode('.', $limpia);
        if (count($partes) !== 3 || $partes[0] !== self::PREFIJO) {
            throw new LicenciaInvalida('Eso no parece una clave de activación. Copiala completa, tal como te la pasaron (empieza con "'.self::PREFIJO.'.").');
        }

        $firma = Firma::deB64($partes[2]);
        if ($firma === false || ! Firma::verificar($partes[0].'.'.$partes[1], $firma, $publicaPem)) {
            throw new LicenciaInvalida('La clave no es válida: está incompleta, tiene un error de copiado o no la emitió CCS. Pedila de nuevo.');
        }

        $json = Firma::deB64($partes[1]);
        $d = $json === false ? null : json_decode($json, true);
        if (! is_array($d)) {
            throw new LicenciaInvalida('La clave no se pudo leer. Pedila de nuevo.');
        }

        $lic = new self(
            (string) ($d['instalacion'] ?? ''), (string) ($d['cliente'] ?? ''), (string) ($d['plan'] ?? ''),
            (string) ($d['emitida'] ?? ''), (string) ($d['vence'] ?? ''), (string) ($d['modalidad'] ?? 'otra'),
        );
        $lic->validar();

        return $lic;
    }

    /** La clave de una sola línea, sin espacios, tal como se guarda y se muestra. */
    public static function compactar(string $clave): string
    {
        return preg_replace('/\s+/', '', $clave) ?? '';
    }

    private function validar(): void
    {
        if ($this->instalacion === '') {
            throw new LicenciaInvalida('Falta el ID de la instalación.');
        }
        if ($this->cliente === '') {
            throw new LicenciaInvalida('Falta el nombre del cliente.');
        }
        if (! in_array($this->plan, LicenciaService::PLANES, true)) {
            throw new LicenciaInvalida('El plan "'.$this->plan.'" no existe.');
        }
        if (! in_array($this->modalidad, self::MODALIDADES, true)) {
            throw new LicenciaInvalida('La modalidad "'.$this->modalidad.'" no es válida.');
        }
        foreach (['emitida' => $this->emitida, 'vence' => $this->vence] as $campo => $fecha) {
            if (Carbon::hasFormat($fecha, 'Y-m-d') === false) {
                throw new LicenciaInvalida('La fecha de '.$campo.' no es válida ("'.$fecha.'").');
            }
        }
        if ($this->vence < $this->emitida) {
            throw new LicenciaInvalida('La licencia vence antes de emitirse.');
        }
    }
}
