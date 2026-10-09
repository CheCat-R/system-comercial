<?php

/*
 * LICENCIAS FIRMADAS — cuánto tiempo puede usar el cliente el sistema.
 *
 * El plan y el vencimiento de una instalación llegan en una CLAVE DE ACTIVACIÓN
 * firmada por CCS (ver `App\Licencias\Licencia`). La instalación solo verifica
 * la firma con la clave PÚBLICA; la privada vive únicamente en la máquina de
 * quien emite las claves y NO está en este repositorio.
 */
return [

    /*
     * ¿Se exige licencia? Por defecto SOLO en producción: en desarrollo y en los
     * tests no hay nada que activar. `LICENCIA_EXIGIDA=false` la apaga a mano
     * (para una instalación de DEMO) y `=true` la prende en desarrollo (para
     * probar los estados).
     */
    'exigida' => env('LICENCIA_EXIGIDA') !== null
        ? filter_var(env('LICENCIA_EXIGIDA'), FILTER_VALIDATE_BOOLEAN)
        : env('APP_ENV') === 'production',

    /*
     * La clave PÚBLICA con la que se verifican las claves de activación, en
     * formato PEM. Se lee de `config/licencia.pub` (la escribe
     * `php artisan licencia:generar-claves`); `LICENCIA_CLAVE_PUBLICA` permite
     * pasarla inline, que es lo que usan los tests.
     */
    'clave_publica' => env('LICENCIA_CLAVE_PUBLICA'),
    'clave_publica_archivo' => __DIR__.'/licencia.pub',

    /*
     * POR DÓNDE PEDIR LA CLAVE: el texto que ven los avisos de licencia para saber a quién
     * escribirle (un WhatsApp, un mail, lo que uses). Va en el `.env` de cada instalación:
     * `LICENCIA_CONTACTO="WhatsApp +54 9 11 1234-5678 · soporte@tu-dominio.com"`.
     * Vacío = los avisos no mencionan ningún contacto.
     */
    'contacto' => trim((string) env('LICENCIA_CONTACTO', '')),

    /** Días antes del vencimiento en que el dueño empieza a ver el aviso. */
    'dias_aviso' => 15,

    /**
     * Días de gracia después del vencimiento: el sistema sigue funcionando con un
     * aviso fuerte. Pasados, queda en SOLO LECTURA (los datos y los respaldos
     * siguen disponibles; no se registran ventas ni compras nuevas).
     */
    'dias_gracia' => 10,

    /**
     * Cuántos días puede estar el reloj del servidor por DETRÁS de la última fecha que el sistema vio antes de
     * considerarlo manipulado. Un reloj que se atrasa un año "congela" la licencia: el sistema creería que sigue
     * siendo el mismo día. Pasada la tolerancia el sistema queda en solo lectura hasta corregir la fecha o
     * cargar una clave de renovación.
     */
    'tolerancia_reloj_dias' => 3,

    /** Zona con la que se cuentan los días: el comercio vive en Argentina, no en UTC. */
    'zona' => 'America/Argentina/Buenos_Aires',
];
