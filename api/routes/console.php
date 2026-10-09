<?php

use App\Clientes\Registro;
use App\CopiasExternas\CopiaExterna;
use App\Services\LicenciaService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * El plan de una instalación que NO exige licencia (demo, desarrollo) se fija a mano acá. Donde se exige licencia,
 * el plan lo define la clave firmada (`licencia:activar`, o `ccs:plan` en una instalación con varios clientes).
 * Sin argumento, muestra el plan actual.
 */
Artisan::command('licencia:plan {plan?}', function (LicenciaService $svc, ?string $plan = null) {
    if ($plan === null) {
        $this->info('Plan actual: '.$svc->plan());

        return;
    }
    try {
        $svc->fijar($plan);
        $this->info('Plan fijado: '.$plan);
    } catch (InvalidArgumentException $e) {
        $this->error($e->getMessage());
    }
})->purpose('Consultar o fijar el plan comercial de esta instalación (emprendedor|pymes|corporativo)');

/*
 * Copia diaria automática de la base (Pymes y Corporativo; en Emprendedor el
 * comando sale sin hacer nada). De madrugada, cuando el local no vende. Corre
 * solo si el servidor tiene el cron del programador activo:
 *     * * * * * cd /ruta/api && php artisan schedule:run >> /dev/null 2>&1
 *
 * Eso vale para una instalación de UN cliente. En una con varios clientes no se usa el programador: un solo cron diario
 * corre `php artisan ccs:cron`, que hace la copia de cada uno y después sube las de afuera a Google Drive
 * (ver `deploy/CLIENTES.md` y `deploy/COPIAS_EXTERNAS.md`).
 */
// La zona se pone a propósito: la app corre en UTC, y sin ella "las 3:00" serían las 0:00 de Argentina.
Schedule::command('respaldos:automatico')->dailyAt('03:00')->timezone('America/Argentina/Buenos_Aires')->withoutOverlapping();

// Copia externa (Google Drive, cifrada) de una instalación de un solo cliente, si está configurada. En una con varios clientes
// la dispara `ccs:cron`.
Schedule::command('ccs:copia-externa')->dailyAt('03:30')->timezone('America/Argentina/Buenos_Aires')->withoutOverlapping()
    ->when(fn () => CopiaExterna::activa() && Registro::raiz() === null);
