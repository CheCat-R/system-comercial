<?php

namespace App\CopiasExternas;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * LO MÍNIMO DE GOOGLE DRIVE que hace falta para guardar copias: autorizar una vez, crear carpetas, subir, listar, borrar y bajar.
 *
 * El permiso que se pide es `drive.file`: la aplicación solo ve los archivos QUE ELLA MISMA creó. No puede leer ni tocar nada más
 * del Drive, ni aunque alguien se hiciera con la credencial. Por eso no hay riesgo en usar la cuenta personal.
 *
 * Se autoriza con el flujo de "dispositivo" (se muestra un código y se aprueba desde cualquier navegador): sirve desde SSH, donde no
 * hay navegador. Después se guarda el `refresh_token` y la aplicación se autoriza sola cada vez que sube.
 */
final class GoogleDrive
{
    public const ALCANCE = 'https://www.googleapis.com/auth/drive.file';

    private ?string $acceso = null;

    private int $venceAcceso = 0;

    /**
     * @param  array{clientId:string, clientSecret:string, refreshToken:string}  $cfg
     * @param  int  $trozo  bytes por pedido al subir; Google exige múltiplos de 256 KiB
     */
    public function __construct(
        private readonly array $cfg,
        private readonly int $trozo = 8 * 1024 * 1024,
        private readonly string $api = 'https://www.googleapis.com',
        private readonly string $oauth = 'https://oauth2.googleapis.com',
    ) {}

    // ------------------------------------------------------------------ autorización (una sola vez)

    /** @return array{device_code:string, user_code:string, verification_url:string, expires_in:int, interval:int} */
    public static function iniciarAutorizacion(string $clientId, string $oauth = 'https://oauth2.googleapis.com'): array
    {
        $r = Http::asForm()->timeout(30)->post($oauth.'/device/code', ['client_id' => $clientId, 'scope' => self::ALCANCE]);
        if (! $r->successful() || ! $r->json('device_code')) {
            throw new RuntimeException('Google no aceptó el pedido de autorización: '.self::motivo($r->json(), $r->status()).'. ¿El tipo de credencial es "TV y dispositivos de entrada limitada"?');
        }

        return $r->json();
    }

    /**
     * Espera a que el usuario apruebe el código y devuelve el `refresh_token`.
     *
     * @param  callable(int):void|null  $dormir  segundos a esperar entre consultas (se reemplaza en las pruebas)
     */
    public static function esperarAutorizacion(array $dispositivo, string $clientId, string $clientSecret, ?callable $dormir = null, string $oauth = 'https://oauth2.googleapis.com'): string
    {
        $dormir ??= fn (int $s) => sleep($s);
        $espera = max(1, (int) ($dispositivo['interval'] ?? 5));
        $limite = time() + (int) ($dispositivo['expires_in'] ?? 1800);

        while (time() < $limite) {
            $dormir($espera);
            $r = Http::asForm()->timeout(30)->post($oauth.'/token', [
                'client_id' => $clientId, 'client_secret' => $clientSecret, 'device_code' => $dispositivo['device_code'],
                'grant_type' => 'urn:ietf:params:oauth:grant-type:device_code',
            ]);
            if ($r->successful() && $r->json('refresh_token')) {
                return $r->json('refresh_token');
            }
            switch ($r->json('error')) {
                case 'authorization_pending':
                    break;
                case 'slow_down':
                    $espera += 5;
                    break;
                case 'access_denied':
                    throw new RuntimeException('Se rechazó el permiso en la pantalla de Google.');
                case 'expired_token':
                    throw new RuntimeException('El código venció antes de que lo aprobaras. Volvé a empezar.');
                default:
                    throw new RuntimeException('Google devolvió un error al autorizar: '.self::motivo($r->json(), $r->status()).'.');
            }
        }

        throw new RuntimeException('Pasó el tiempo sin que se aprobara el código. Volvé a empezar.');
    }

    // ------------------------------------------------------------------ operaciones

    /** Busca una carpeta por nombre dentro de otra (o en la raíz del Drive) y, con `$crear`, la crea si no está. Devuelve su id (null si no está y no se crea). */
    public function carpeta(string $nombre, ?string $padre = null, bool $crear = true): ?string
    {
        $q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='".str_replace(['\\', "'"], ['\\\\', "\\'"], $nombre)."'"
            .($padre ? " and '".$padre."' in parents" : " and 'root' in parents");
        $r = $this->http()->get($this->api.'/drive/v3/files', ['q' => $q, 'fields' => 'files(id,name)', 'pageSize' => 1]);
        $this->exigir($r, 'buscar la carpeta "'.$nombre.'"');
        if ($id = $r->json('files.0.id')) {
            return $id;
        }
        if (! $crear) {
            return null;
        }

        $c = $this->http()->post($this->api.'/drive/v3/files?fields=id', ['name' => $nombre, 'mimeType' => 'application/vnd.google-apps.folder', 'parents' => $padre ? [$padre] : ['root']]);
        $this->exigir($c, 'crear la carpeta "'.$nombre.'"');

        return $c->json('id');
    }

    /**
     * Sube un archivo en trozos (subida "reanudable": un corte a mitad de camino no obliga a empezar de cero) y comprueba que Google
     * guardó exactamente los bytes enviados.
     *
     * @return array{id:string, name:string, size:int}
     */
    public function subir(string $ruta, string $nombre, string $carpetaId): array
    {
        $total = (int) filesize($ruta);
        $inicio = $this->http()->withHeaders(['X-Upload-Content-Type' => 'application/octet-stream', 'X-Upload-Content-Length' => (string) $total])
            ->post($this->api.'/upload/drive/v3/files?uploadType=resumable&fields=id,name,size', ['name' => $nombre, 'parents' => [$carpetaId]]);
        $this->exigir($inicio, 'iniciar la subida de "'.$nombre.'"');
        $sesion = $inicio->header('Location');
        if ($sesion === '') {
            throw new RuntimeException('Google no devolvió dónde subir "'.$nombre.'".');
        }

        $h = fopen($ruta, 'rb');
        try {
            $desde = 0;
            do {
                $datos = (string) fread($h, $this->trozo);
                $hasta = $desde + strlen($datos) - 1;
                $rango = $total === 0 ? 'bytes */0' : 'bytes '.$desde.'-'.$hasta.'/'.$total;
                $r = $this->subirTrozo($sesion, $datos, $rango);
                $desde = $hasta + 1;
            } while ($desde < $total);
        } finally {
            fclose($h);
        }

        if (! $r->successful() || ! $r->json('id')) {
            throw new RuntimeException('Google no confirmó la subida de "'.$nombre.'" (respondió '.$r->status().').');
        }
        if ((int) $r->json('size') !== $total) {
            $this->borrar($r->json('id'));
            throw new RuntimeException('Google guardó '.$r->json('size').' bytes de "'.$nombre.'" y se enviaron '.$total.'. Se borró la copia incompleta.');
        }

        return ['id' => $r->json('id'), 'name' => $r->json('name'), 'size' => $total];
    }

    /** Un trozo, con hasta 3 intentos si el servidor o la conexión fallan a mitad de camino. */
    private function subirTrozo(string $sesion, string $datos, string $rango)
    {
        $ultimo = null;
        for ($i = 1; $i <= 3; $i++) {
            try {
                $r = Http::timeout(300)->withOptions(['allow_redirects' => false])->withHeaders(['Content-Range' => $rango])
                    ->withBody($datos, 'application/octet-stream')->put($sesion);
            } catch (ConnectionException $e) {
                $ultimo = $e->getMessage();
                usleep(300000 * $i);

                continue;
            }
            if ($r->successful() || $r->status() === 308) {
                return $r;
            }
            if ($r->status() < 500) {
                throw new RuntimeException('Google rechazó un trozo de la subida: '.self::motivo($r->json(), $r->status()).'.');
            }
            $ultimo = 'respondió '.$r->status();
            usleep(300000 * $i);
        }

        throw new RuntimeException('Se cortó la subida después de 3 intentos ('.$ultimo.').');
    }

    /** @return list<array{id:string, name:string, size:int, createdTime:string}> de la más nueva a la más vieja */
    public function listar(string $carpetaId): array
    {
        $out = [];
        $pagina = null;
        do {
            $r = $this->http()->get($this->api.'/drive/v3/files', array_filter([
                'q' => "'".$carpetaId."' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'",
                'fields' => 'nextPageToken,files(id,name,size,createdTime)', 'orderBy' => 'createdTime desc', 'pageSize' => 200, 'pageToken' => $pagina,
            ]));
            $this->exigir($r, 'listar las copias');
            foreach ($r->json('files', []) as $f) {
                $out[] = ['id' => $f['id'], 'name' => $f['name'], 'size' => (int) ($f['size'] ?? 0), 'createdTime' => $f['createdTime'] ?? ''];
            }
            $pagina = $r->json('nextPageToken');
        } while ($pagina);

        return $out;
    }

    /** Borra del todo (no a la papelera): la papelera también ocupa lugar en el Drive. */
    public function borrar(string $id): void
    {
        $r = $this->http()->delete($this->api.'/drive/v3/files/'.$id);
        if ($r->status() !== 404) {   // ya no estaba: da igual
            $this->exigir($r, 'borrar un archivo');
        }
    }

    public function descargar(string $id, string $destino): void
    {
        $r = $this->http()->timeout(300)->sink($destino)->get($this->api.'/drive/v3/files/'.$id, ['alt' => 'media']);
        if (! $r->successful()) {
            @unlink($destino);
            $this->exigir($r, 'descargar la copia');
        }
    }

    // ------------------------------------------------------------------ internos

    private function http(): PendingRequest
    {
        return Http::withToken($this->token())->timeout(60)->acceptJson();
    }

    private function token(): string
    {
        if ($this->acceso !== null && time() < $this->venceAcceso - 60) {
            return $this->acceso;
        }
        $r = Http::asForm()->timeout(30)->post($this->oauth.'/token', [
            'client_id' => $this->cfg['clientId'], 'client_secret' => $this->cfg['clientSecret'],
            'refresh_token' => $this->cfg['refreshToken'], 'grant_type' => 'refresh_token',
        ]);
        if (! $r->successful() || ! $r->json('access_token')) {
            if ($r->json('error') === 'invalid_grant') {
                throw new RuntimeException('Google ya no acepta la autorización de las copias (la revocaron o venció). Volvé a correr ccs:copias-configurar. Si la pantalla de consentimiento de tu proyecto está en modo "Prueba", el permiso vence a los 7 días: pasala a "En producción".');
            }
            throw new RuntimeException('No se pudo pedir acceso a Google: '.self::motivo($r->json(), $r->status()).'.');
        }
        $this->venceAcceso = time() + (int) $r->json('expires_in', 3600);

        return $this->acceso = $r->json('access_token');
    }

    private function exigir($r, string $que): void
    {
        if (! $r->successful()) {
            throw new RuntimeException('Google no dejó '.$que.': '.self::motivo($r->json(), $r->status()).'.');
        }
    }

    private static function motivo(?array $json, int $status): string
    {
        $m = $json['error_description'] ?? $json['error']['message'] ?? (is_string($json['error'] ?? null) ? $json['error'] : null);

        return ($m ?: 'sin detalle').' (HTTP '.$status.')';
    }
}
