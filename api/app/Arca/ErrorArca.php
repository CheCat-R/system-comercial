<?php

namespace App\Arca;

/**
 * DOS TIPOS DE FALLO, y se tratan al revés: red/timeout/SOAP Fault es
 * transitorio (reintentar sirve); `Resultado: 'R'` es un rechazo de datos
 * (con los mismos datos va a fallar siempre, y el número NO se consumió).
 */
class ErrorArca extends \RuntimeException
{
    public function __construct(string $message, public readonly bool $reintentable = true)
    {
        parent::__construct($message);
    }
}
