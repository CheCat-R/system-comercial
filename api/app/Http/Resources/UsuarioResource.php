<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Usuario sin secretos, con su rol resuelto: lo que viaja al panel. Los
 * mismos campos que `Sesion::usuarioPublico()` (el panel reemplaza el usuario
 * con `/auth/yo` en cada arranque: un campo que falte acá desaparece en el F5).
 */
class UsuarioResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'activo' => $this->activo,
            'rolId' => $this->rol_id,
            'rolClave' => $this->rol?->clave ?? '',
            'rolNombre' => $this->rol?->nombre ?? '',
            'permisos' => $this->rol?->permisos ?? [],
            'tienePassword' => $this->tienePassword(),
            // La marca y si YA tiene PIN — el PIN mismo jamás viaja.
            'relevoCaja' => $this->relevo_caja,
            'tienePin' => $this->tienePin(),
        ];
    }
}
