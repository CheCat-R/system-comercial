<?php

namespace App\Services;

use App\Auth\Permisos;
use App\Auth\Sesion;
use App\Models\Rol;
use App\Models\Usuario;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * USUARIOS Y ROLES. Reglas:
 *  - superadmin: maneja todo (`['*']`). No se edita, no se borra, y siempre
 *    tiene que quedar al menos un usuario superadmin activo.
 *  - roles de sistema (admin, fraccionador, cajero): editables, no borrables.
 *  - usuarios: no se borran (están en historiales) — se desactivan.
 */
class UsuariosService
{
    /* ---------------- Roles ---------------- */

    public function listarRoles()
    {
        return Rol::query()->withCount('usuarios')->orderBy('id')->get();
    }

    /**
     * Las DOS reglas de repartir permisos, en un solo lugar.
     *  1. EL COMODÍN NO SE PIDE: si no, "superadmin en dos llamadas" (crear un
     *     rol con `*` y asignárselo).
     *  2. NO SE OTORGA LO QUE NO SE TIENE: sin esto, cerrar el comodín se
     *     esquiva armando el rol permiso por permiso. El superadmin queda
     *     exento porque los tiene todos por definición.
     */
    public function validarPermisos(array $permisos, Sesion $sesion): array
    {
        $limpios = array_values(array_unique(array_map('strval', $permisos)));

        if (in_array(Permisos::COMODIN, $limpios, true)) {
            throw ValidationException::withMessages(['permisos' => 'El comodín de superadmin no se asigna desde acá.']);
        }
        $raros = array_filter($limpios, fn ($p) => ! Permisos::esValida($p));
        if ($raros) {
            throw ValidationException::withMessages(['permisos' => 'Permisos desconocidos: '.implode(', ', $raros).'.']);
        }
        if (! $sesion->esSuperadmin()) {
            $propios = array_flip($sesion->permisos);
            $deMas = array_filter($limpios, fn ($p) => ! in_array($p, Permisos::LEGADAS, true) && ! isset($propios[$p]));
            if ($deMas) {
                throw ValidationException::withMessages([
                    'permisos' => 'No podés otorgar permisos que vos no tenés: '.implode(', ', $deMas).'.',
                ]);
            }
        }

        return $limpios;
    }

    /**
     * LA MISMA REGLA, POR LA PUERTA DE AL LADO: asignar un rol que ya existe ES
     * otorgar sus permisos, así que tiene exactamente el mismo límite.
     */
    public function exigirPuedeAsignarRol(Rol $rol, Sesion $sesion): void
    {
        if ($rol->esDeMando() && ! $sesion->esSuperadmin()) {
            throw new AccessDeniedHttpException('Solo el superadmin puede nombrar a otro superadmin.');
        }
        if ($sesion->esSuperadmin()) {
            return;
        }
        $propios = array_flip($sesion->permisos);
        $deMas = array_filter($rol->permisos ?? [], fn ($p) => ! in_array($p, Permisos::LEGADAS, true) && ! isset($propios[$p]));
        if ($deMas) {
            throw new AccessDeniedHttpException(
                'No podés asignar el rol "'.$rol->nombre.'": incluye permisos que vos no tenés ('.implode(', ', $deMas).').'
            );
        }
    }

    public function crearRol(array $datos, Sesion $sesion): Rol
    {
        $nombre = trim($datos['nombre']);
        $clave = Str::slug($nombre, '_');
        if ($clave === '') {
            throw ValidationException::withMessages(['nombre' => 'El nombre no genera una clave válida.']);
        }
        if (Rol::query()->where('clave', $clave)->exists()) {
            throw ValidationException::withMessages(['nombre' => 'Ya existe un rol con la clave "'.$clave.'".']);
        }

        return Rol::query()->create([
            'clave' => $clave,
            'nombre' => $nombre,
            'descripcion' => trim($datos['descripcion'] ?? ''),
            'permisos' => $this->validarPermisos($datos['permisos'] ?? ['ver'], $sesion),
            'es_sistema' => false,
        ]);
    }

    public function editarRol(Rol $rol, array $datos, Sesion $sesion): Rol
    {
        // Por PERMISOS y no sólo por la clave: el mando está en el comodín.
        if ($rol->esDeMando()) {
            throw ValidationException::withMessages(['rol' => 'El superadmin maneja todo: no se edita.']);
        }
        if (array_key_exists('nombre', $datos)) {
            $rol->nombre = trim($datos['nombre']);
        }
        if (array_key_exists('descripcion', $datos)) {
            $rol->descripcion = trim($datos['descripcion'] ?? '');
        }
        if (array_key_exists('permisos', $datos)) {
            $rol->permisos = $this->validarPermisos($datos['permisos'], $sesion);
        }
        $rol->save();

        return $rol;
    }

    public function borrarRol(Rol $rol): void
    {
        if ($rol->es_sistema) {
            throw ValidationException::withMessages(['rol' => 'Los roles del sistema no se borran.']);
        }
        if ($rol->usuarios()->exists()) {
            throw ValidationException::withMessages(['rol' => 'Hay usuarios con ese rol: reasignalos primero.']);
        }
        $rol->delete();
    }

    /* ---------------- Usuarios ---------------- */

    public function listarUsuarios()
    {
        return Usuario::query()->with('rol')->orderBy('id')->get();
    }

    public function crearUsuario(array $datos, Sesion $sesion): Usuario
    {
        $rol = Rol::query()->find($datos['rolId']);
        if (! $rol) {
            throw ValidationException::withMessages(['rolId' => 'Elegí un rol válido.']);
        }
        // La tercera puerta al mismo lugar: dar de alta un usuario NUEVO con un rol más fuerte.
        $this->exigirPuedeAsignarRol($rol, $sesion);

        $pin = (string) ($datos['pin'] ?? '');
        $relevoCaja = (bool) ($datos['relevoCaja'] ?? false);
        if ($relevoCaja && $pin === '') {
            throw ValidationException::withMessages(['pin' => 'Para habilitarlo como relevo de caja definile un PIN.']);
        }

        return Usuario::query()->create([
            'nombre' => trim($datos['nombre']),
            'rol_id' => $rol->id,
            'password' => $datos['password'],
            'activo' => $datos['activo'] ?? true,
            'relevo_caja' => $relevoCaja,
            'pin' => $pin !== '' ? $pin : null,
        ]);
    }

    public function editarUsuario(Usuario $usuario, array $datos, Sesion $sesion): Usuario
    {
        $usuario->loadMissing('rol');
        $rolActual = $usuario->rol;

        /*
         * AL DUEÑO NO SE LO TOCA DESDE AFUERA: con `gerencia.usuarios` alcanzaba
         * un PATCH con `password` para entrar como él.
         */
        if ($rolActual->esDeMando() && ! $sesion->esSuperadmin()) {
            throw new AccessDeniedHttpException('Ese usuario es superadmin: solo él puede editarse.');
        }

        $echar = false;

        if (array_key_exists('nombre', $datos)) {
            $usuario->nombre = trim($datos['nombre']);
        }
        if (isset($datos['rolId']) && (int) $datos['rolId'] !== $usuario->rol_id) {
            $rol = Rol::query()->find($datos['rolId']);
            if (! $rol) {
                throw ValidationException::withMessages(['rolId' => 'Elegí un rol válido.']);
            }
            // Promover a alguien es la misma llave que crearlo de cero con ese rol.
            $this->exigirPuedeAsignarRol($rol, $sesion);
            if ($this->esUltimoSuperadmin($usuario)) {
                throw ValidationException::withMessages(['rolId' => 'Es el último superadmin activo: primero nombrá otro.']);
            }
            $usuario->rol_id = $rol->id;
        }
        if (array_key_exists('activo', $datos) && (bool) $datos['activo'] !== $usuario->activo) {
            if (! $datos['activo'] && $this->esUltimoSuperadmin($usuario)) {
                throw ValidationException::withMessages(['activo' => 'Es el último superadmin activo: primero nombrá otro.']);
            }
            $usuario->activo = (bool) $datos['activo'];
            $echar = $echar || ! $usuario->activo;
        }
        if (! empty($datos['password'])) {
            $usuario->password = $datos['password'];
            $echar = true;
        }
        /*
         * El PIN es corto a propósito (se tipea con un cliente esperando) — la
         * defensa está en el freno de intentos del verificador (F2). La marca
         * no se puede prender sin un PIN existente o nuevo.
         */
        if (! empty($datos['pin'])) {
            $usuario->pin = $datos['pin'];
        }
        if (array_key_exists('relevoCaja', $datos) && (bool) $datos['relevoCaja'] !== $usuario->relevo_caja) {
            if ($datos['relevoCaja'] && ! $usuario->tienePin()) {
                throw ValidationException::withMessages(['pin' => 'Para habilitarlo como relevo de caja definile un PIN.']);
            }
            $usuario->relevo_caja = (bool) $datos['relevoCaja'];
        }

        $usuario->save();

        // Cambiar la contraseña o desactivar tiene que ECHARLO de donde ya está.
        if ($echar) {
            $usuario->cerrarTodasLasSesiones();
        }

        return $usuario->refresh()->load('rol');
    }

    /** Nunca puede quedar el sistema sin UN superadmin activo: sería quedarse afuera. */
    private function esUltimoSuperadmin(Usuario $usuario): bool
    {
        if ($usuario->rol?->clave !== 'superadmin') {
            return false;
        }

        return ! Usuario::query()
            ->whereKeyNot($usuario->id)
            ->where('activo', true)
            ->whereHas('rol', fn ($q) => $q->where('clave', 'superadmin'))
            ->exists();
    }
}
