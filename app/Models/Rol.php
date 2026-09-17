<?php

namespace App\Models;

use App\Auth\Permisos;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Rol extends Model
{
    protected $table = 'roles';

    protected $fillable = ['clave', 'nombre', 'descripcion', 'permisos', 'es_sistema'];

    protected function casts(): array
    {
        return [
            'permisos' => 'array',
            'es_sistema' => 'boolean',
        ];
    }

    public function usuarios(): HasMany
    {
        return $this->hasMany(Usuario::class);
    }

    /**
     * ¿Este rol es de MANDO? Se mira por sus permisos y no sólo por la clave:
     * el poder está en el comodín, y preguntar por el nombre dejaría pasar
     * cualquier rol que lo tuviera guardado de antes.
     */
    public function esDeMando(): bool
    {
        return $this->clave === 'superadmin' || in_array(Permisos::COMODIN, $this->permisos ?? [], true);
    }
}
