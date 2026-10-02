<?php

namespace App\Console\Commands;

use App\Licencias\Licencia;
use App\Licencias\LicenciaInvalida;
use Carbon\Carbon;
use Illuminate\Console\Command;
use RuntimeException;

/**
 * EMITE LA CLAVE DE ACTIVACIÓN de un cliente. Es lo que corrés vos, en tu
 * máquina, cuando el cliente paga: le pasás la clave y él la pega en
 * Sistema › Licencia.
 *
 *   php artisan licencia:emitir --cliente="Almacén Don Pepe" --plan=pymes \
 *       --instalacion=<ID que muestra su sistema> --meses=1 --privada=<tu clave privada>
 *   php artisan licencia:emitir ... --anual
 *
 * El vencimiento se cuenta desde HOY. Renovar es emitir otra clave (con el
 * mismo ID de instalación) y que el cliente la cargue.
 */
class LicenciaEmitir extends Command
{
    protected $signature = 'licencia:emitir
        {--cliente= : Nombre del cliente}
        {--plan= : emprendedor|pymes|corporativo}
        {--instalacion= : El ID de instalación que muestra Sistema › Licencia del cliente}
        {--meses= : Cuántos meses dura (por defecto 1)}
        {--anual : Dura un año}
        {--vence= : Fecha exacta de vencimiento (AAAA-MM-DD), en vez de --meses/--anual}
        {--privada= : Archivo con tu clave privada (o la variable LICENCIA_CLAVE_PRIVADA)}';

    protected $description = 'Emite la clave de activación de un cliente (se corre en la máquina de quien tiene la clave privada)';

    public function handle(): int
    {
        $faltan = array_filter(['cliente', 'plan', 'instalacion'], fn ($o) => trim((string) $this->option($o)) === '');
        if ($faltan) {
            $this->error('Faltan: --'.implode(', --', $faltan));

            return self::FAILURE;
        }

        $archivo = (string) ($this->option('privada') ?: env('LICENCIA_CLAVE_PRIVADA', ''));
        if ($archivo === '' || ! is_file($archivo)) {
            $this->error('No encuentro tu clave privada. Pasá --privada="ruta/al/archivo.pem" (la que creó licencia:generar-claves).');

            return self::FAILURE;
        }

        $hoy = Carbon::now(config('licencia.zona'))->startOfDay();
        if ($this->option('vence')) {
            $vence = (string) $this->option('vence');
            $modalidad = 'otra';
        } elseif ($this->option('anual')) {
            $vence = $hoy->copy()->addYear()->toDateString();
            $modalidad = 'anual';
        } else {
            $meses = max(1, (int) ($this->option('meses') ?: 1));
            $vence = $hoy->copy()->addMonthsNoOverflow($meses)->toDateString();
            $modalidad = 'mensual';
        }

        try {
            $clave = Licencia::emitir([
                'instalacion' => (string) $this->option('instalacion'),
                'cliente' => (string) $this->option('cliente'),
                'plan' => (string) $this->option('plan'),
                'vence' => $vence,
                'modalidad' => $modalidad,
                'emitida' => $hoy->toDateString(),
            ], (string) file_get_contents($archivo));
        } catch (LicenciaInvalida|RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('Clave emitida para "'.$this->option('cliente').'" — plan '.$this->option('plan').', '.$modalidad.', vence el '.Carbon::parse($vence)->format('d/m/Y').'.');
        $this->newLine();
        $this->line($clave);
        $this->newLine();
        $this->line('Pasasela al cliente: la pega en Sistema › Licencia. Sirve solo para la instalación '.$this->option('instalacion').'.');

        return self::SUCCESS;
    }
}
