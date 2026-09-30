<?php

use App\Services\LicenciaService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

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
