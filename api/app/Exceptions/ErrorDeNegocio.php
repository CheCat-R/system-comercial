<?php

namespace App\Exceptions;

use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Una regla del negocio rechazó la operación (stock insuficiente, estado
 * inválido, dato incoherente). Es un 400 con un mensaje en castellano de
 * mostrador: el panel lo muestra tal cual.
 */
class ErrorDeNegocio extends HttpException
{
    public function __construct(string $mensaje)
    {
        parent::__construct(400, $mensaje);
    }
}
