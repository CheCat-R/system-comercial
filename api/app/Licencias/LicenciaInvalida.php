<?php

namespace App\Licencias;

use RuntimeException;

/**
 * Una clave de activación que no sirve. El mensaje está escrito para quien la
 * pegó (el dueño del comercio): dice qué pasó y qué hacer, no un error técnico.
 */
class LicenciaInvalida extends RuntimeException {}
