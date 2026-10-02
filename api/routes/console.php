<?php

use App\Services\LicenciaService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Mientras no exista el canal de control de CheCAT (ver memoria del proyecto:
 * "proyecto-planes-comerciales"), el plan de esta instalación se fija a mano acá.
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
 */
// La zona se pone a propósito: la app corre en UTC, y sin ella "las 3:00" serían las 0:00 de Argentina.
Schedule::command('respaldos:automatico')->dailyAt('03:00')->timezone('America/Argentina/Buenos_Aires')->withoutOverlapping();
