<?php

namespace App\Http\Controllers\Api;

use App\Auth\FrenoLogin;
use App\Auth\NombreUsuario;
use App\Auth\PlanCatalogo;
use App\Auth\Sesion;
use App\Auth\Sesiones;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\CambiarPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UsuarioResource;
use App\Models\Sucursal;
use App\Models\Terminal;
use App\Models\Usuario;
use App\Services\LicenciaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

class AuthController extends Controller
{
    public function __construct(private readonly LicenciaService $licencia) {}

    /**
     * El plan tal como lo necesita el panel: el id (para mostrar/depurar) y la
     * lista de claves que incluye — `null` en Corporativo, que no enumera
     * nada (ver PlanCatalogo). Así el frontend nunca porta la matriz de
     * planes a JS: solo pregunta "¿mi lista (o `null`) incluye esta clave?".
     */
    private function planPublico(): array
    {
        $plan = $this->licencia->plan();

        return ['id' => $plan, 'claves' => PlanCatalogo::claves($plan), 'licencia' => $this->licencia->resumenPublico()];
    }
    /**
     * Lo mínimo para la pantalla de login, y nada más: las sucursales, para
     * poder elegir donde hay más de una. Es público por necesidad.
     *
     * YA NO DEVUELVE LOS USUARIOS. El login tenía un desplegable con todos los
     * nombres, o sea que cualquiera que abriera la URL leía quién tiene cuenta
     * en este negocio. Ahora el usuario se ESCRIBE: la lista no hace falta y no
     * se publica.
     */
    public function opciones(): JsonResponse
    {
        return response()->json([
            'sucursales' => Sucursal::query()->orderBy('id')->get(['id', 'nombre']),
        ]);
    }

    /** Un hash cualquiera, para gastar el mismo tiempo cuando el usuario no existe (ver `resolverUsuario`). */
    private const HASH_DE_RELLENO = '$2y$12$S5sZA.m7.ro564Bbk1C/FOVrCYwLlEaQtIaJuexew6Dvjx9XZS/gG';

    /**
     * QUIÉN ES el que escribió ese nombre y esa contraseña.
     *
     * NO SE DICE QUÉ FALLÓ. "No existe ese usuario" y "contraseña incorrecta"
     * devuelven lo mismo: con un campo de texto libre, la diferencia entre los
     * dos mensajes sería una herramienta para descubrir qué nombres tienen
     * cuenta. Y cuando el nombre no existe se hace igual un `Hash::check`
     * contra un hash de relleno: sin eso, el login de un nombre inexistente
     * contesta en milisegundos y el de uno real en 50 — misma pista, por el
     * reloj.
     *
     * "Desactivado" SOLO se avisa a quien acertó la contraseña: a esa persona
     * sí hay que explicarle por qué no entra, y ya demostró ser quien dice.
     */
    private function resolverUsuario(string $claveNombre, string $password, string $ip): Usuario
    {
        $candidatos = $claveNombre === ''
            ? collect()
            : Usuario::query()->with('rol')->get()->filter(fn (Usuario $u) => NombreUsuario::normalizar($u->nombre) === $claveNombre);

        if ($candidatos->isEmpty()) {
            Hash::check($password, self::HASH_DE_RELLENO);
        }

        // Dos usuarios con el mismo nombre normalizado no se pueden dar de alta, pero uno viejo pudo haber quedado: gana el que acierta la contraseña.
        $acertaron = $candidatos->filter(fn (Usuario $u) => $u->tienePassword() && Hash::check($password, $u->password));
        $activo = $acertaron->first(fn (Usuario $u) => $u->activo);
        if ($activo) {
            return $activo;
        }
        if ($acertaron->isNotEmpty()) {
            throw new UnauthorizedHttpException('Bearer', 'Ese usuario está desactivado — hablá con el superadmin.');
        }

        // Este fallo GASTA INTENTO: si no, sondear nombres sería gratis.
        FrenoLogin::fallo($claveNombre, $ip);
        throw new UnauthorizedHttpException('Bearer', 'Usuario o contraseña incorrectos.');
    }

    /**
     * Entrada al sistema: usuario + contraseña + LA SUCURSAL con la que se va a
     * operar (es el contexto de trabajo de toda la sesión).
     */
    public function login(LoginRequest $request): JsonResponse
    {
        // La fecha más alta vista: atrasar el reloj del servidor no estira una licencia.
        $this->licencia->registrarReloj();

        // El freno cuenta por NOMBRE NORMALIZADO: "Maria", "MARÍA" y " maria " son el mismo cupo, no tres.
        $claveNombre = NombreUsuario::normalizar((string) $request->input('usuario'));
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
        FrenoLogin::revisar($claveNombre, $ip);

        $usuario = $this->resolverUsuario($claveNombre, (string) $request->input('password'), $ip);
        FrenoLogin::exito($claveNombre, $ip);

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
            'plan' => $this->planPublico(),
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
            'plan' => $this->planPublico(),
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

    /**
     * CADA USUARIO CAMBIA LA SUYA, sin permiso de gerencia — es su propia
     * cuenta, no la de otro. Pide la contraseña ACTUAL (a diferencia del PATCH
     * de gerencia.usuarios, que la pisa sin pedirla: ahí la autoridad es el
     * permiso del admin; acá, que quien pide el cambio de verdad es el dueño
     * de la sesión). Mismo criterio que el resto del sistema: cambiar la
     * contraseña echa al usuario de TODAS sus sesiones, esta incluida — entra
     * de nuevo con la nueva.
     */
    public function cambiarPassword(CambiarPasswordRequest $request, Sesion $sesion): JsonResponse
    {
        $usuario = Usuario::query()->findOrFail($sesion->usuarioId);
        if (! Hash::check((string) $request->input('passwordActual'), $usuario->password)) {
            throw ValidationException::withMessages(['passwordActual' => 'La contraseña actual no coincide.']);
        }
        $usuario->password = $request->input('password');
        // Eligió la suya: se apaga la marca de "debe cambiarla".
        $usuario->debe_cambiar_password = false;
        $usuario->save();
        $usuario->cerrarTodasLasSesiones();

        return response()->json(['ok' => true]);
    }
}
