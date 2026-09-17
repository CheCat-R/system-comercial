<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Base de todos los Form Requests de la API. La autorización de acceso la
 * resuelven `auth:sanctum` y `permiso:` en las rutas, no cada request.
 */
abstract class ApiRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
}
