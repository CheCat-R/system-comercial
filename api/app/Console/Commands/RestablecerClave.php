<?php

namespace App\Console\Commands;

use App\Auth\NombreUsuario;
use App\Models\Usuario;
use App\Services\AuditoriaService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * RESTABLECER LA CONTRASEÑA DESDE LA CONSOLA DEL SERVIDOR.
 *
 * Para el caso que ninguna pantalla puede resolver: el dueño (superadmin) se
 * olvidó de la suya, o la cuenta está bloqueada. Dentro del sistema, un
 * administrador ya puede restablecer la de cualquier otro usuario desde
 * Gerencia › Usuarios — pero al superadmin solo lo toca él mismo, así que si
 * se la olvida no hay a quién pedírsela. Esta puerta existe porque quien tiene
 * acceso a la consola del servidor ya tiene acceso a todo: no abre nada nuevo.
 *
 * Genera una contraseña TEMPORAL, la muestra una sola vez y deja al usuario
 * obligado a elegir la suya en el próximo ingreso. Cierra sus sesiones.
 *
 * Uso:  php artisan usuario:restablecer-clave "Administrador"
 *       php artisan usuario:restablecer-clave "Lucas Pérez" --clave="otra-clave-temporal"
 */
class RestablecerClave extends Command
{
    protected $signature = 'usuario:restablecer-clave {usuario : El nombre con el que entra} {--clave= : Contraseña temporal (si se omite, se genera una)}';

    protected $description = 'Restablece la contraseña de un usuario con una temporal y lo obliga a elegir la suya al entrar';

    /** Sin letras que se confunden al dictarlas o leerlas (0/O, 1/l/I). */
    private const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function handle(AuditoriaService $audit): int
    {
        $clave = NombreUsuario::normalizar((string) $this->argument('usuario'));
        $usuario = Usuario::query()->get()->first(fn (Usuario $u) => NombreUsuario::normalizar($u->nombre) === $clave);

        if (! $usuario) {
            $this->error('No hay ningún usuario llamado "'.$this->argument('usuario').'".');
            $this->line('Usuarios de esta instalación: '.Usuario::query()->orderBy('nombre')->pluck('nombre')->implode(', '));

            return self::FAILURE;
        }

        $temporal = (string) ($this->option('clave') ?: '');
        $minimo = (int) config('checat.min_password', 8);
        if ($temporal !== '' && mb_strlen($temporal) < $minimo) {
            $this->error('La contraseña temporal necesita al menos '.$minimo.' caracteres.');

            return self::FAILURE;
        }
        if ($temporal === '') {
            $temporal = '';
            for ($i = 0; $i < 12; $i++) {
                $temporal .= self::ALFABETO[random_int(0, strlen(self::ALFABETO) - 1)];
            }
        }

        $usuario->password = $temporal;
        $usuario->debe_cambiar_password = true;
        $usuario->save();
        $usuario->cerrarTodasLasSesiones();

        $audit->registrar([[
            'entidad' => 'usuarios', 'entidadId' => $usuario->id, 'ambito' => 'Seguridad',
            'detalle' => $usuario->nombre, 'campo' => 'Contraseña restablecida por consola',
            'despues' => 'Debe elegir una nueva al entrar',
        ]]);

        $this->info('Listo: se restableció la contraseña de "'.$usuario->nombre.'".');
        if (! $usuario->activo) {
            $this->warn('Ojo: ese usuario está DESACTIVADO, así que igual no va a poder entrar hasta que se lo reactive.');
        }
        $this->newLine();
        $this->line('  Contraseña temporal:  '.$temporal);
        $this->newLine();
        $this->line('Anotala ahora: no se vuelve a mostrar. Al entrar con ella, el sistema le pide elegir una propia.');
        $this->line('Si hubo muchos intentos fallidos, el bloqueo del login se levanta solo a los '.config('checat.login.espera_minutos', 5).' minutos.');

        return self::SUCCESS;
    }
}
