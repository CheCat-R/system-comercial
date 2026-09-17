<?php

namespace Tests;

use App\Models\Rol;
use App\Models\Sucursal;
use App\Models\Usuario;
use Database\Seeders\SeguridadSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    /** Los tests arrancan con la semilla real: sucursales, roles de sistema y el superadmin. */
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SeguridadSeeder::class);
    }

    protected function superadmin(): Usuario
    {
        return Usuario::query()->whereHas('rol', fn ($q) => $q->where('clave', 'superadmin'))->firstOrFail();
    }

    protected function rol(string $clave): Rol
    {
        return Rol::query()->where('clave', $clave)->firstOrFail();
    }

    protected function central(): Sucursal
    {
        return Sucursal::central();
    }

    protected function crearUsuario(string $nombre, string $rolClave, string $password = 'clave1234', bool $activo = true): Usuario
    {
        return Usuario::query()->create([
            'nombre' => $nombre,
            'rol_id' => $this->rol($rolClave)->id,
            'password' => $password,
            'activo' => $activo,
        ]);
    }

    /** Hace login por la API y devuelve el token en claro. */
    protected function loguear(Usuario $usuario, string $password = 'clave1234', ?int $sucursalId = null): string
    {
        $res = $this->postJson('/api/auth/login', [
            'usuarioId' => $usuario->id,
            'password' => $password,
            'sucursalId' => $sucursalId ?? $this->central()->id,
        ]);
        $res->assertOk();

        return $res->json('token');
    }

    protected function conToken(string $token): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /**
     * Varias requests en un mismo test comparten el contenedor: el guard
     * cachea el usuario resuelto y la `Sesion` es scoped. Se limpian antes de
     * cada request para que cada llamada se autentique de cero, como en producción.
     */
    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $this->app['auth']->forgetGuards();
        $this->app->forgetScopedInstances();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }
}
