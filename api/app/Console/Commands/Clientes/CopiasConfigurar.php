<?php

namespace App\Console\Commands\Clientes;

use App\CopiasExternas\Cifrado;
use App\CopiasExternas\CopiaExterna;
use App\CopiasExternas\GoogleDrive;
use Illuminate\Console\Command;
use Throwable;

/**
 * CONFIGURA LAS COPIAS EN GOOGLE DRIVE, una sola vez para toda la instalación.
 *
 * Antes, en Google Cloud (ver deploy/COPIAS_EXTERNAS.md): un proyecto con la API de Drive activada y una credencial OAuth de tipo
 * "TV y dispositivos de entrada limitada". De ahí salen el ID y el secreto que pide este comando. Después se muestra un código para
 * aprobar desde cualquier navegador (no hace falta navegador en el servidor).
 */
class CopiasConfigurar extends Command
{
    protected $signature = 'ccs:copias-configurar
        {--client-id= : ID de cliente OAuth}
        {--client-secret= : secreto del cliente OAuth (si se omite, se pregunta)}
        {--retencion=30 : cuántas copias se conservan por cliente en Drive}
        {--clave-cifrado= : usar esta clave de cifrado (al reconfigurar; si se omite se conserva la actual o se crea una)}';

    protected $description = 'Conecta las copias externas con Google Drive (una sola vez) y crea la clave de cifrado';

    public function handle(): int
    {
        $actual = $this->leerActual();
        $clientId = (string) ($this->option('client-id') ?: ($this->input->isInteractive() ? $this->ask('ID de cliente OAuth', $actual['clientId'] ?? null) : ''));
        $secreto = (string) ($this->option('client-secret') ?: ($this->input->isInteractive() ? $this->secret('Secreto del cliente OAuth') : ''));
        if ($clientId === '' || $secreto === '') {
            $this->error('Faltan el ID y el secreto del cliente OAuth (--client-id y --client-secret).');

            return self::FAILURE;
        }
        $retencion = max(1, (int) $this->option('retencion'));

        $clave = (string) ($this->option('clave-cifrado') ?: ($actual['claveCifrado'] ?? ''));
        $claveNueva = $clave === '';
        if ($claveNueva) {
            $clave = Cifrado::nuevaClave();
        } elseif (! Cifrado::claveValida($clave)) {
            $this->error('La clave de cifrado no es válida (32 bytes en base64).');

            return self::FAILURE;
        }

        try {
            $d = GoogleDrive::iniciarAutorizacion($clientId);
            $this->newLine();
            $this->line('Abrí  '.$d['verification_url'].'  en cualquier navegador, iniciá sesión con la cuenta de Google donde querés guardar las copias');
            $this->line('y escribí este código:   '.$d['user_code']);
            $this->line('Esperando que lo apruebes…');
            $refresh = GoogleDrive::esperarAutorizacion($d, $clientId, $secreto);

            $cfg = ['clientId' => $clientId, 'clientSecret' => $secreto, 'refreshToken' => $refresh, 'claveCifrado' => $clave, 'retencion' => $retencion, 'autorizadoEn' => now()->toIso8601String()];
            $cfg['carpetaRaiz'] = (new GoogleDrive($cfg))->carpeta(CopiaExterna::CARPETA_RAIZ);
            CopiaExterna::guardar($cfg);
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Listo: las copias se van a guardar en tu Drive, en la carpeta "'.CopiaExterna::CARPETA_RAIZ.'".');
        if ($claveNueva) {
            $this->newLine();
            $this->warn('CLAVE DE CIFRADO — guardala AHORA en tu gestor de contraseñas, fuera de este servidor:');
            $this->line('   '.$clave);
            $this->warn('Sin ella, las copias de Drive NO se pueden abrir: si el servidor se pierde, esta clave es lo único que las rescata. No se vuelve a mostrar.');
        }
        $this->line('Configuración guardada en '.CopiaExterna::archivoDeConfiguracion().' (solo el dueño la puede leer).');
        $this->line('Probala con:  php artisan ccs:copias-subir');

        return self::SUCCESS;
    }

    private function leerActual(): array
    {
        $f = CopiaExterna::archivoDeConfiguracion();

        return is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    }
}
