<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Los usuarios no se borran (están en los historiales): se desactivan.
 * Sin email: el login es por usuario elegido de una lista + contraseña.
 */
class Usuario extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'usuarios';

    protected $fillable = ['nombre', 'rol_id', 'password', 'activo', 'relevo_caja', 'pin'];

    // Ni el hash ni el PIN viajan jamás, ni siquiera hasheados.
    protected $hidden = ['password', 'pin'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'pin' => 'hashed',
            'activo' => 'boolean',
            'relevo_caja' => 'boolean',
        ];
    }

    public function rol(): BelongsTo
    {
        return $this->belongsTo(Rol::class);
    }

    public function tienePassword(): bool
    {
        return ! empty($this->password);
    }

    public function tienePin(): bool
    {
        return ! empty($this->pin);
    }

    /**
     * Cambiar la contraseña o desactivar a alguien tiene que ECHARLO de donde
     * ya está: si no, la contraseña nueva no sirve en el único caso en que se
     * cambia con urgencia.
     */
    public function cerrarTodasLasSesiones(): void
    {
        $this->tokens()->delete();
    }
}
