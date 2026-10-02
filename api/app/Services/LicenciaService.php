<?php

namespace App\Services;

use App\Licencias\Licencia;
use App\Licencias\LicenciaInvalida;
use App\Models\Configuracion;
use Carbon\Carbon;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * EL PLAN COMERCIAL de esta instalación (Emprendedor/Pymes/Corporativo) y CUÁNTO
 * TIEMPO PUEDE USARSE — lo define CCS, no el cliente. A propósito vive separado
 * de `ConfiguracionService`: esa clase expone cada área por HTTP a quien tenga
 * el permiso de esa área (ver `ConfiguracionController::DUENO_DE_AREA`, que
 * además cae a `gerencia.configuracion` — el permiso que el Administrador del
 * cliente SÍ tiene — para cualquier clave no listada), así que si el plan
 * viviera ahí, el propio cliente podría subirse de plan solo con un PUT. Por
 * eso esta clase no pasa por esa puerta.
 *
 * DOS FUENTES DEL PLAN:
 *  - La LICENCIA FIRMADA (clave de activación que emite CCS, ver
 *    `App\Licencias\Licencia`): trae el plan y el vencimiento. Es la que manda
 *    cuando se exige licencia (producción).
 *  - El plan "a mano" (`licencia:plan`): para desarrollo y para el alta de una
 *    instalación. No da permiso a nada por sí solo en producción: sin licencia
 *    vigente la instalación queda en solo lectura (ver `ExigirLicencia`).
 *
 * Guarda en la tabla `configuracion` (ya existente): `licencia` (plan a mano),
 * `licencia_firmada` (la clave activada), `instalacion` (el ID de este
 * servidor) y `licencia_reloj` (la última fecha vista, contra el reloj atrasado).
 */
class LicenciaService
{
    public const PLANES = ['emprendedor', 'pymes', 'corporativo'];

    private const CLAVE = 'licencia';

    private const CLAVE_FIRMADA = 'licencia_firmada';

    private const CLAVE_INSTALACION = 'instalacion';

    private const CLAVE_RELOJ = 'licencia_reloj';

    /**
     * Una instalación sin plan fijado, SIN exigir licencia, se comporta como
     * Corporativo: falla ABIERTA. Ninguna instalación existente (la de desarrollo)
     * se queda sin funciones el día que se despliega esto sin que alguien lo haya
     * decidido a propósito con el comando de abajo.
     */
    private const PLAN_POR_DEFECTO = 'corporativo';

    /** Con licencia exigida y ninguna vigente, lo mínimo (de todos modos queda en solo lectura). */
    private const PLAN_MINIMO = 'emprendedor';

    public function exigida(): bool
    {
        return (bool) config('licencia.exigida');
    }

    /**
     * A PROPÓSITO sin cache de instancia. Son unas pocas filas chicas: releerlas
     * no cuesta nada, y cachearlas tiene una trampa real — el Router de Laravel
     * reutiliza el controller ya resuelto (y con él, esta instancia) entre
     * requests simulados dentro de un mismo test, así que un `fijar()` a mitad de
     * test quedaría invisible para el siguiente `postJson`. En producción cada
     * request arranca de cero, pero bajo un servidor de procesos largos
     * (Octane) el mismo riesgo aplica de verdad.
     */
    public function plan(): string
    {
        $datos = $this->cargar();
        if ($datos['licencia'] !== null) {
            return $datos['licencia']->plan;
        }

        $valor = $datos['filas'][self::CLAVE]->valor ?? null;
        $plan = is_array($valor) ? ($valor['plan'] ?? null) : null;
        if (in_array($plan, self::PLANES, true)) {
            return $plan;
        }

        return $this->exigida() ? self::PLAN_MINIMO : self::PLAN_POR_DEFECTO;
    }

    public function fijar(string $plan): string
    {
        if (! in_array($plan, self::PLANES, true)) {
            throw new InvalidArgumentException(
                'Plan inválido: "'.$plan.'". Válidos: '.implode(', ', self::PLANES).'.'
            );
        }
        Configuracion::query()->updateOrCreate(
            ['clave' => self::CLAVE],
            ['valor' => ['plan' => $plan, 'activadoEn' => now()->toIso8601String()]],
        );

        return $plan;
    }

    // ------------------------------------------------------------------
    // LA LICENCIA FIRMADA
    // ------------------------------------------------------------------

    /**
     * EL ID DE ESTA INSTALACIÓN: el dato que se le pasa a CCS para que emita la
     * clave. Se genera la primera vez que se pide y queda fijo (viaja con la
     * base, así que una restauración o una mudanza de servidor lo conserva).
     */
    public function instalacionId(): string
    {
        $fila = Configuracion::query()->where('clave', self::CLAVE_INSTALACION)->first();
        $id = is_array($fila?->valor) ? ($fila->valor['id'] ?? null) : null;
        if (is_string($id) && $id !== '') {
            return $id;
        }
        $id = (string) Str::uuid();
        Configuracion::query()->updateOrCreate(['clave' => self::CLAVE_INSTALACION], ['valor' => ['id' => $id]]);

        return $id;
    }

    /** La clave pública con la que se verifican las licencias. */
    private function clavePublica(): string
    {
        $pem = (string) config('licencia.clave_publica');
        if ($pem === '') {
            $archivo = (string) config('licencia.clave_publica_archivo');
            $pem = is_file($archivo) ? (string) file_get_contents($archivo) : '';
        }
        if (trim($pem) === '') {
            throw new LicenciaInvalida('Esta instalación no tiene cargada la clave pública de licencias (config/licencia.pub).');
        }

        return $pem;
    }

    /**
     * Activa una clave de activación: comprueba la firma, que sea de ESTA
     * instalación y que no esté vencida, y la guarda.
     *
     * @throws LicenciaInvalida con un mensaje para quien la pegó
     */
    public function activar(string $clave): array
    {
        $lic = Licencia::leer($clave, $this->clavePublica());

        if ($lic->instalacion !== $this->instalacionId()) {
            throw new LicenciaInvalida('Esa clave es de otra instalación. Pedí una nueva indicando el ID de esta: '.$this->instalacionId());
        }
        if ($lic->vence < $this->hoy(null)->toDateString()) {
            throw new LicenciaInvalida('Esa clave ya venció el '.Carbon::parse($lic->vence)->format('d/m/Y').'. Pedí una vigente.');
        }

        Configuracion::query()->updateOrCreate(
            ['clave' => self::CLAVE_FIRMADA],
            ['valor' => ['token' => Licencia::compactar($clave), 'activadoEn' => now()->toIso8601String()]],
        );
        $this->registrarReloj();

        return $this->estado();
    }

    /**
     * La fecha de HOY para contar días: la de Argentina, y nunca anterior a la
     * última que este sistema vio. Atrasar el reloj del servidor no estira una
     * licencia: se sigue contando desde la fecha más alta que ya se registró.
     */
    private function hoy(?Configuracion $reloj): Carbon
    {
        $real = Carbon::now(config('licencia.zona'))->startOfDay();
        $visto = is_array($reloj?->valor) ? ($reloj->valor['visto'] ?? null) : null;
        if (is_string($visto) && Carbon::hasFormat($visto, 'Y-m-d')) {
            $vistoDia = Carbon::parse($visto, config('licencia.zona'))->startOfDay();
            if ($vistoDia->greaterThan($real)) {
                return $vistoDia;
            }
        }

        return $real;
    }

    /** Anota la fecha de hoy como "la más alta vista". Se llama al entrar y al activar. */
    public function registrarReloj(): void
    {
        if (! $this->exigida()) {
            return;
        }
        $hoy = $this->hoy(Configuracion::query()->where('clave', self::CLAVE_RELOJ)->first())->toDateString();
        Configuracion::query()->updateOrCreate(['clave' => self::CLAVE_RELOJ], ['valor' => ['visto' => $hoy]]);
    }

    /**
     * Las filas de configuración que usa este servicio y la licencia ya leída y
     * verificada (o `null` con el motivo). UNA consulta para todo.
     *
     * @return array{filas:\Illuminate\Support\Collection, licencia:?Licencia, motivo:?string}
     */
    private function cargar(): array
    {
        $filas = Configuracion::query()
            ->whereIn('clave', [self::CLAVE, self::CLAVE_FIRMADA, self::CLAVE_RELOJ])
            ->get()->keyBy('clave');

        $licencia = null;
        $motivo = null;
        if ($this->exigida()) {
            $clave = is_array($filas[self::CLAVE_FIRMADA]->valor ?? null) ? ($filas[self::CLAVE_FIRMADA]->valor['token'] ?? '') : '';
            if ($clave === '') {
                $motivo = 'Todavía no se cargó ninguna clave de activación.';
            } else {
                try {
                    $licencia = Licencia::leer($clave, $this->clavePublica());
                    if ($licencia->instalacion !== $this->instalacionId()) {
                        $licencia = null;
                        $motivo = 'La clave cargada es de otra instalación.';
                    }
                } catch (LicenciaInvalida $e) {
                    $motivo = $e->getMessage();
                }
            }
        }

        return ['filas' => $filas, 'licencia' => $licencia, 'motivo' => $motivo];
    }

    /**
     * EL ESTADO DE LA LICENCIA, con días:
     *   no_exigida  — desarrollo, tests o una demo: no hay nada que vencer
     *   sin_licencia / invalida — no hay una clave que sirva: solo lectura
     *   activa      — más de `dias_aviso` días por delante
     *   por_vencer  — le quedan `dias_aviso` días o menos (aviso al dueño)
     *   en_gracia   — venció hace `dias_gracia` días o menos: funciona, con aviso fuerte
     *   vencida     — pasó la gracia: solo lectura
     *
     * @return array{exigida:bool, estado:string, plan:string, cliente:?string, vence:?string, diasRestantes:?int, modalidad:?string, motivo:?string, restringido:bool}
     */
    public function estado(): array
    {
        if (! $this->exigida()) {
            return [
                'exigida' => false, 'estado' => 'no_exigida', 'plan' => $this->plan(), 'cliente' => null,
                'vence' => null, 'diasRestantes' => null, 'modalidad' => null, 'motivo' => null, 'restringido' => false,
            ];
        }

        $datos = $this->cargar();
        $lic = $datos['licencia'];
        if ($lic === null) {
            $sinClave = str_starts_with((string) $datos['motivo'], 'Todavía');

            return [
                'exigida' => true, 'estado' => $sinClave ? 'sin_licencia' : 'invalida', 'plan' => $this->plan(),
                'cliente' => null, 'vence' => null, 'diasRestantes' => null, 'modalidad' => null,
                'motivo' => $datos['motivo'], 'restringido' => true,
            ];
        }

        $hoy = $this->hoy($datos['filas'][self::CLAVE_RELOJ] ?? null);
        $dias = (int) round($hoy->diffInDays(Carbon::parse($lic->vence, config('licencia.zona'))->startOfDay(), false));
        $estado = match (true) {
            $dias > (int) config('licencia.dias_aviso') => 'activa',
            $dias >= 0 => 'por_vencer',
            $dias >= -((int) config('licencia.dias_gracia')) => 'en_gracia',
            default => 'vencida',
        };

        return [
            'exigida' => true, 'estado' => $estado, 'plan' => $lic->plan, 'cliente' => $lic->cliente,
            'vence' => $lic->vence, 'diasRestantes' => $dias, 'modalidad' => $lic->modalidad,
            'motivo' => null, 'restringido' => $estado === 'vencida',
        ];
    }

    /** ¿El sistema está en SOLO LECTURA? (exigida y sin licencia que sirva, o vencida pasada la gracia). */
    public function restringido(): bool
    {
        return $this->estado()['restringido'];
    }

    /** Lo que ve cualquier usuario del panel (para el aviso): sin el ID de instalación. */
    public function resumenPublico(): array
    {
        $e = $this->estado();

        return [
            'exigida' => $e['exigida'], 'estado' => $e['estado'], 'vence' => $e['vence'],
            'diasRestantes' => $e['diasRestantes'], 'modalidad' => $e['modalidad'], 'restringido' => $e['restringido'],
            // Por dónde pedir la clave (texto libre de LICENCIA_CONTACTO); `null` si no se configuró.
            'contacto' => config('licencia.contacto') ?: null,
        ];
    }
}
