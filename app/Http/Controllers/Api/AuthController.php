<?php

namespace App\Http\Controllers\Api;

use App\Auth\FrenoLogin;
use App\Auth\Sesion;
use App\Auth\Sesiones;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UsuarioResource;
use App\Models\Sucursal;
use App\Models\Terminal;
use App\Models\Usuario;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

class AuthController extends Controller
{
    /**
     * Lo mínimo para poder ELEGIR en la pantalla de login, y nada más. Es
     * público por necesidad, así que devuelve lo justo: ni permisos, ni quién
     * es superadmin, ni qué cuentas están sin contraseña.
     */
    public function opciones(): JsonResponse
    {
        return response()->json([
            'usuarios' => Usuario::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
            'sucursales' => Sucursal::query()->orderBy('id')->get(['id', 'nombre']),
        ]);
    }

    /**
     * Entrada al sistema: usuario + contraseña + LA SUCURSAL con la que se va a
     * operar (es el contexto de trabajo de toda la sesión).
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $usuarioId = (int) $request->input('usuarioId');
        $ip = (string) $request->ip();
        $userAgent = (string) $request->userAgent();

        /*
         * LA SUCURSAL LA PONE EL EQUIPO, NO LA PERSONA. Si este navegador está
         * registrado como terminal, la sucursal sale de ahí y lo que venga en el
         * body se ignora — también para el jefe, que cruza sucursales con el
         * selector del encabezado (`POST /auth/sucursal`).
         */
        $terminal = Terminal::porToken($request->input('terminalToken'));
        $sucursalId = $terminal ? $terminal->sucursal_id : (int) $request->input('sucursalId');

        // El freno va ANTES de mirar la contraseña.
        FrenoLogin::revisar($usuarioId, $ip);

        $usuario = Usuario::query()->with('rol')->find($usuarioId);
        // Estas ramas también GASTAN INTENTO: si no, sondear cuentas sería gratis.
        if (! $usuario) {
            FrenoLogin::fallo($usuarioId, $ip);
            throw new UnauthorizedHttpException('Bearer', 'Elegí un usuario válido.');
        }
        if (! $usuario->activo) {
            FrenoLogin::fallo($usuarioId, $ip);
            throw new UnauthorizedHttpException('Bearer', 'Ese usuario está desactivado — hablá con el superadmin.');
        }
        if (! $usuario->tienePassword()) {
            FrenoLogin::fallo($usuarioId, $ip);
            throw new UnauthorizedHttpException('Bearer', $usuario->nombre.' no tiene contraseña definida — el superadmin se la asigna desde Seguridad.');
        }
        if (! Hash::check((string) $request->input('password'), $usuario->password)) {
            FrenoLogin::fallo($usuarioId, $ip);
            throw new UnauthorizedHttpException('Bearer', 'Contraseña incorrecta.');
        }
        FrenoLogin::exito($usuarioId, $ip);

        /*
         * EL SUPERADMIN ENTRA SIN ELEGIR SUCURSAL: opera sobre todo el negocio
         * desde cualquier máquina. Si la omite, queda parado en LA CENTRAL y la
         * cambia cuando quiera desde el encabezado. Para el resto es obligatoria.
         */
        if ($sucursalId <= 0) {
            if (! $usuario->rol->esDeMando()) {
                throw new UnauthorizedHttpException('Bearer', 'Elegí la sucursal con la que vas a operar.');
            }
            $central = Sucursal::central();
            if (! $central) {
                throw new UnauthorizedHttpException('Bearer', 'No hay sucursales cargadas.');
            }
            $sucursalId = $central->id;
        }
        $sucursal = Sucursal::query()->find($sucursalId);
        if (! $sucursal) {
            throw new UnauthorizedHttpException('Bearer', 'Elegí la sucursal con la que vas a operar.');
        }

        // ACÁ NACE LA CREDENCIAL.
        $token = Sesiones::crear($usuario, $sucursal, $userAgent);
        // Barrido oportunista de vencidas: una vez por login es la frecuencia que hace falta.
        Sesiones::limpiarVencidas();
        // Recién con el login YA aceptado, para que `ultimo_uso` no cuente intentos fallidos.
        $terminal?->marcarUso($userAgent);

        return response()->json([
            'ok' => true,
            'token' => $token,
            'usuario' => new UsuarioResource($usuario),
            'sucursal' => ['id' => $sucursal->id, 'nombre' => $sucursal->nombre],
            'terminal' => $terminal ? ['id' => $terminal->id, 'nombre' => $terminal->nombre] : null,
        ]);
    }

    /**
     * QUIÉN SOY, según el servidor. El panel lo llama al arrancar: le dice si el
     * token guardado todavía vale y trae permisos y sucursal FRESCOS.
     */
    public function yo(Sesion $sesion): JsonResponse
    {
        return response()->json([
            'usuario' => $sesion->usuarioPublico(),
            'sucursal' => $sesion->sucursalPublica(),
        ]);
    }

    /**
     * CAMBIAR LA SUCURSAL DEL TURNO, del lado del servidor. Sólo el jefe: es el
     * mismo criterio con el que todo el sistema decide quién atraviesa
     * sucursales. Al cajero la sucursal se la sigue dando el login.
     */
    public function cambiarSucursal(Request $request, Sesion $sesion): JsonResponse
    {
        if (! $sesion->esJefe()) {
            throw new AccessDeniedHttpException('Tu usuario opera en la sucursal con la que entró.');
        }
        $id = (int) $request->input('sucursalId');
        if ($id <= 0) {
            throw ValidationException::withMessages(['sucursalId' => 'Elegí una sucursal válida.']);
        }
        $sucursal = Sucursal::query()->find($id);
        if (! $sucursal) {
            throw new NotFoundHttpException('Sucursal inexistente.');
        }
        Sesiones::moverSucursal($sesion->tokenId, $sucursal->id);

        return response()->json(['ok' => true, 'sucursal' => ['id' => $sucursal->id, 'nombre' => $sucursal->nombre]]);
    }

    /** Cierra SOLO esta sesión: la tablet del local sigue trabajando. */
    public function salir(Sesion $sesion): JsonResponse
    {
        Sesiones::cerrar($sesion->tokenId);

        return response()->json(['ok' => true]);
    }
}
