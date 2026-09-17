<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * El token de Sanctum, con lo que la sesión de este sistema necesita saber
 * además: desde qué sucursal se trabaja.
 */
class SesionToken extends PersonalAccessToken
{
    protected $table = 'personal_access_tokens';

    public function sucursal(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class);
    }
}
