<?php

namespace App\CopiasExternas;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\Services\RespaldosService;
use RuntimeException;

/**
 * LA COPIA DE LA BASE QUE SALE DEL SERVIDOR: se vuelca, se cifra, se sube a Google Drive y se poda lo viejo.
 *
 * Es del que opera el servicio, no del cliente: se hace para TODOS los clientes, también los Emprendedor (que por plan no tienen copia
 * diaria en el servidor), y no toca la copia diaria ni sus reglas. La configuración (credenciales, refresh token, clave de cifrado)
 * es una sola para toda la instalación: `clientes/_copias.json`, o `storage/app/copias-externas.json` en una instalación común.
 */
final class CopiaExterna
{
    /** Nombre de la carpeta de Drive donde van todas las copias. */
    public const CARPETA_RAIZ = 'CCS Respaldos';

    private const PATRON = '/-\d{4}-\d{2}-\d{2}-\d{4}\.sql\.gz\.enc$/';

    public static function archivoDeConfiguracion(): string
    {
        if ($f = config('checat.copias_archivo')) {
            return $f;
        }

        return Registro::raiz() !== null ? Registro::raiz().'/_copias.json' : storage_path('app/copias-externas.json');
    }

    /** @return array{clientId:string, clientSecret:string, refreshToken:string, claveCifrado:string, carpetaRaiz:string, retencion:int}|null */
    public static function configuracion(): ?array
    {
        $f = self::archivoDeConfiguracion();
        $c = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
        foreach (['clientId', 'clientSecret', 'refreshToken', 'claveCifrado', 'carpetaRaiz'] as $k) {
            if (! is_array($c) || empty($c[$k])) {
                return null;
            }
        }

        return $c + ['retencion' => 30];
    }

    public static function activa(): bool
    {
        return self::configuracion() !== null;
    }

    public static function guardar(array $cfg): void
    {
        $f = self::archivoDeConfiguracion();
        if (! is_dir(dirname($f))) {
            mkdir(dirname($f), 0750, true);
        }
        file_put_contents($f, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
        @chmod($f, 0600);
    }

    /** Nombre con el que se identifica esta base en Drive: el dominio del cliente. */
    public static function nombreDeEstaBase(): string
    {
        if ($n = SelectorDeCliente::nombre()) {
            return $n;
        }
        $host = parse_url((string) config('app.url'), PHP_URL_HOST);

        return SelectorDeCliente::normalizar($host ?: '') ?? 'instalacion';
    }

    public function __construct(private readonly ?GoogleDrive $drive = null) {}

    public function drive(): GoogleDrive
    {
        $c = self::configuracion() ?? throw new RuntimeException('Las copias externas no están configuradas. Corré: php artisan ccs:copias-configurar');

        // `apiUrl` y `oauthUrl` existen para probar contra un Google de mentira; en la práctica no se ponen.
        return $this->drive ?? new GoogleDrive($c, api: $c['apiUrl'] ?? 'https://www.googleapis.com', oauth: $c['oauthUrl'] ?? 'https://oauth2.googleapis.com');
    }

    /** @return array{archivo:string, bytes:int, resumen:string, podadas:int} */
    public function subir(string $nombre, RespaldosService $respaldos): array
    {
        $c = self::configuracion() ?? throw new RuntimeException('Las copias externas no están configuradas. Corré: php artisan ccs:copias-configurar');
        $drive = $this->drive();

        $tmp = storage_path('app/copia-externa');
        if (! is_dir($tmp) && ! @mkdir($tmp, 0700, true) && ! is_dir($tmp)) {
            throw new RuntimeException('No se pudo crear la carpeta temporal '.$tmp.'.');
        }
        $base = $nombre.'-'.now()->format('Y-m-d-Hi');
        $gz = $tmp.'/'.$base.'.sql.gz';
        $enc = $gz.'.enc';

        try {
            $volcado = $respaldos->volcarComprimidoEn($gz);
            Cifrado::cifrar($gz, $enc, $c['claveCifrado']);
            @unlink($gz);   // sin cifrar no debe quedar nada en disco más tiempo del necesario

            $carpeta = $drive->carpeta($nombre, $c['carpetaRaiz']);
            $subido = $drive->subir($enc, basename($enc), $carpeta);
            $podadas = $this->podar($drive, $carpeta, (int) $c['retencion']);
        } finally {
            @unlink($gz);
            @unlink($enc);
        }

        return ['archivo' => $subido['name'], 'bytes' => $subido['size'], 'resumen' => $volcado['resumen'], 'podadas' => $podadas];
    }

    /** Deja las últimas `$cuantas` copias de esa carpeta y borra el resto. Solo toca archivos con el nombre de una copia. */
    private function podar(GoogleDrive $drive, string $carpeta, int $cuantas): int
    {
        $copias = array_values(array_filter($drive->listar($carpeta), fn ($f) => preg_match(self::PATRON, $f['name']) === 1));
        $viejas = array_slice($copias, max(1, $cuantas));
        foreach ($viejas as $f) {
            $drive->borrar($f['id']);
        }

        return count($viejas);
    }

    /** Las copias de esa base que hay en Drive, de la más nueva a la más vieja. */
    public function copiasDe(string $nombre): array
    {
        $c = self::configuracion() ?? throw new RuntimeException('Las copias externas no están configuradas.');
        $drive = $this->drive();

        $carpeta = $drive->carpeta($nombre, $c['carpetaRaiz'], crear: false);

        return $carpeta === null ? [] : array_values(array_filter($drive->listar($carpeta), fn ($f) => preg_match(self::PATRON, $f['name']) === 1));
    }
}
