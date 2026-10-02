<?php

/*
 * Parámetros propios del sistema. Lo que depende del entorno sale del `.env`.
 */
return [

    /*
     * Inactividad que tolera una sesión antes de caducar. Vence por INACTIVIDAD
     * y se corre hacia adelante con el uso: un vencimiento absoluto corto deja
     * al cajero afuera en mitad del turno, y uno largo deja la caja abierta toda
     * la noche en una máquina compartida.
     */
    'sesion_inactividad_horas' => (int) env('SESION_INACTIVIDAD_HORAS', 12),

    /*
     * Freno de intentos del login: dos contadores porque son dos ataques
     * distintos (alguien machacando UNA cuenta, y alguien probando una clave
     * contra TODAS las cuentas desde la misma IP).
     */
    'login' => [
        'tope_usuario' => 5,   // fallos tolerados por usuario+IP
        'tope_ip' => 20,       // por IP: más alto porque una sucursal entera sale por la misma IP
        'espera_minutos' => 5, // cuánto dura el castigo y la ventana de acumulación
    ],

    /*
     * Copia diaria automática de la base (planes Pymes y Corporativo).
     * `carpeta`: vacía = `storage/app/respaldos` (fuera de `public/`).
     * `retencion`: cuántas copias se conservan; las más viejas se borran.
     * Es una copia EN EL MISMO SERVIDOR: no reemplaza a la descarga manual.
     */
    'respaldos' => [
        'carpeta' => env('RESPALDOS_CARPETA'),
        'retencion' => (int) env('RESPALDOS_RETENCION', 14),
    ],

    /** Largo mínimo de contraseña para contraseñas NUEVAS. */
    'min_password' => 8,

];
