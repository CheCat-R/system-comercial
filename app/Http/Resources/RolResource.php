<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RolResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'clave' => $this->clave,
            'nombre' => $this->nombre,
            'descripcion' => $this->descripcion,
            'permisos' => $this->permisos ?? [],
            'esSistema' => $this->es_sistema,
            'usuarios' => $this->whenCounted('usuarios'),
        ];
    }
}
