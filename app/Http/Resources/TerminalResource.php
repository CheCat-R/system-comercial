<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TerminalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'activa' => $this->activa,
            'creadaEn' => $this->created_at?->toIso8601String(),
            'ultimoUso' => $this->ultimo_uso?->toIso8601String(),
            'ultimoAgente' => $this->ultimo_agente,
            'sucursalId' => $this->sucursal_id,
            'sucursalNombre' => $this->sucursal?->nombre ?? '',
        ];
    }
}
