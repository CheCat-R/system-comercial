<?php

namespace App\Auth;

use App\Models\SesionToken;
use App\Models\Usuario;

/**
 * Lo que la autenticación resolvió para ESTA request: quién es, con qué rol y
 * permisos, y desde qué sucursal. Es la única fuente válida de "quién es" y
 * "desde qué sucursal" — nada de esto vuelve a leerse del body.
 *
 * Los controladores la reciben por inyección: `public function x(Sesion $sesion)`.
 */
final class Sesion
{
    public function __construct(
        public readonly int $tokenId,
        public readonly int $usuarioId,
        public readonly string $nombre,
        public readonly int $rolId,
        public readonly string $rolClave,
        public readonly string $rolNombre,
        /** @var string[] */
        public readonly array $permisos,
        public readonly int $sucursalId,
        public readonly string $sucursalNombre,
    ) {}

    public static function desde(Usuario $usuario, SesionToken $token): self
    {
        $usuario->loadMissing('rol');
        $token->loadMissing('sucursal');

        return new self(
            tokenId: $token->id,
            usuarioId: $usuario->id,
            nombre: $usuario->nombre,
            rolId: $usuario->rol->id,
            rolClave: $usuario->rol->clave,
            rolNombre: $usuario->rol->nombre,
            permisos: $usuario->rol->permisos ?? [],
            sucursalId: (int) $token->sucursal_id,
            sucursalNombre: $token->sucursal?->nombre ?? '',
        );
    }

    public function esSuperadmin(): bool
    {
        return in_array(Permisos::COMODIN, $this->permisos, true);
    }

    /**
     * QUIÉN PUEDE OPERAR EN OTRA SUCURSAL. El cajero está clavado a la suya; el
     * jefe cruza. Va por ROL y no por una clave nueva: "atravesar sucursales"
     * no es una pantalla ni una acción del negocio.
     */
    public function esJefe(): bool
    {
        return $this->esSuperadmin() || in_array($this->rolClave, ['admin', 'superadmin'], true);
    }

    public function puede(string ...$claves): bool
    {
        return Permisos::tiene($this->permisos, $claves);
    }

    /**
     * La sucursal con la que se GRABA una operación de mostrador (venta,
     * cobranza, apertura de caja): la pedida si es jefe, la propia si no.
     */
    public function sucursalDeOperacion(?int $pedida = null): int
    {
        return ($this->esJefe() && $pedida) ? $pedida : $this->sucursalId;
    }

    /**
     * La sucursal a la que está limitado lo que esta sesión puede TOCAR de lo
     * que ya existe. `null` = sin límite (el jefe).
     */
    public function soloSuSucursal(): ?int
    {
        return $this->esJefe() ? null : $this->sucursalId;
    }

    /** La forma con que viaja al panel: los mismos campos que devuelve el login. */
    public function usuarioPublico(): array
    {
        return [
            'id' => $this->usuarioId,
            'nombre' => $this->nombre,
            'rolId' => $this->rolId,
            'rolClave' => $this->rolClave,
            'rolNombre' => $this->rolNombre,
            'permisos' => $this->permisos,
            'activo' => true,
        ];
    }

    public function sucursalPublica(): array
    {
        return ['id' => $this->sucursalId, 'nombre' => $this->sucursalNombre];
    }
}
