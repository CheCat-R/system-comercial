<?php

/*
 * CORS de la API. El panel vive en otro (sub)dominio, así que los orígenes se
 * declaran explícitamente en `CORS_ALLOWED_ORIGINS` (.env), separados por coma.
 * `supports_credentials` queda en false: la autenticación viaja en el header
 * `Authorization: Bearer`, no en cookies.
 */
return [

    'paths' => ['api/*', 'up'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
