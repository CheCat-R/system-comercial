<?php

namespace App\Arca;

use App\Exceptions\ErrorDeNegocio;
use Illuminate\Support\Carbon;

/**
 * EL TRÁMITE DEL CERTIFICADO, desde el panel: generar la clave y el pedido
 * (.csr) y después instalar el .crt que devuelve ARCA. La clave privada NUNCA
 * viaja en una respuesta: se escribe en el servidor y se queda ahí.
 */
final class Certificado
{
    private static function exigirRuta(string $ruta, string $cual, string $variable): void
    {
        if ($ruta === '') {
            throw new ErrorDeNegocio('Falta '.$variable.': la ruta donde va '.$cual.' en el servidor. Cargala en el .env y recargá.');
        }
        $dir = dirname($ruta);
        if (! is_dir($dir)) {
            throw new ErrorDeNegocio('La carpeta '.$dir.' no existe en el servidor. Crearla FUERA de public_html y volver a intentar.');
        }
        if (! is_writable($dir)) {
            throw new ErrorDeNegocio('La carpeta '.$dir.' no tiene permiso de escritura para la API.');
        }
    }

    /**
     * Genera la clave (si no está) y devuelve el pedido. Si la clave YA existe
     * se REUSA: pisarla dejaría muerto al certificado en uso.
     */
    public static function generarPedido(string $razonSocial, string $alias): array
    {
        self::exigirRuta(Config::keyPath(), 'la clave privada', 'ARCA_KEY_PATH');
        $cuit = Config::cuit();
        if (strlen($cuit) !== 11) {
            throw new ErrorDeNegocio('Falta ARCA_CUIT, o no tiene 11 dígitos. El pedido lleva el CUIT adentro y tiene que ser exactamente el del contribuyente que va a facturar.');
        }
        $razonSocial = trim($razonSocial);
        if ($razonSocial === '') {
            throw new ErrorDeNegocio('Poné la razón social, como figura en ARCA.');
        }
        $alias = preg_replace('/[^A-Za-z0-9._-]/', '', trim($alias));
        if ($alias === '') {
            throw new ErrorDeNegocio('Poné un alias (letras, números, guiones).');
        }

        $claveNueva = false;
        if (is_file(Config::keyPath())) {
            $clave = openssl_pkey_get_private('file://'.Config::keyPath());
            if (! $clave) {
                throw new ErrorDeNegocio('Ya hay un archivo en '.Config::keyPath().' pero no es una clave privada legible. Revisalo antes de seguir: si es la clave de un certificado en uso, reemplazarla lo dejaría inservible.');
            }
        } else {
            $clave = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
            if (! $clave || ! openssl_pkey_export($clave, $pem)) {
                throw new ErrorDeNegocio('No se pudo generar la clave privada: '.(openssl_error_string() ?: 'OpenSSL no está disponible.'));
            }
            file_put_contents(Config::keyPath(), $pem);
            @chmod(Config::keyPath(), 0600);
            $claveNueva = true;
        }

        $dn = ['countryName' => 'AR', 'organizationName' => $razonSocial, 'commonName' => $alias, 'serialNumber' => 'CUIT '.$cuit];
        $csr = openssl_csr_new($dn, $clave, ['digest_alg' => 'sha256']);
        if (! $csr || ! openssl_csr_export($csr, $csrPem)) {
            throw new ErrorDeNegocio('No se pudo armar el pedido de certificado: '.(openssl_error_string() ?: 'error de OpenSSL.'));
        }

        return [
            'csr' => $csrPem, 'claveNueva' => $claveNueva,
            'subject' => 'C=AR, O='.$razonSocial.', CN='.$alias.', serialNumber=CUIT '.$cuit, 'keyPath' => Config::keyPath(),
        ];
    }

    /** Guarda el .crt de ARCA después de tres controles: clave, CUIT y vigencia. */
    public static function instalar(string $pem): array
    {
        self::exigirRuta(Config::certPath(), 'el certificado', 'ARCA_CERT_PATH');
        if (! is_file(Config::keyPath())) {
            throw new ErrorDeNegocio('Todavía no hay clave privada en el servidor. Generá primero la clave y el pedido: el certificado no sirve de nada sin la clave con la que se pidió.');
        }
        $texto = trim($pem);
        if (! str_contains($texto, '-----BEGIN CERTIFICATE-----')) {
            throw new ErrorDeNegocio('Eso no parece un certificado. Tiene que empezar con "-----BEGIN CERTIFICATE-----" y terminar con "-----END CERTIFICATE-----" — abrí el .crt con el Bloc de notas y copiá todo, esas dos líneas incluidas.');
        }
        $cert = openssl_x509_read($texto);
        if (! $cert) {
            throw new ErrorDeNegocio('El certificado no se pudo leer: '.(openssl_error_string() ?: 'formato inválido.'));
        }
        $clave = openssl_pkey_get_private('file://'.Config::keyPath());
        if (! $clave || ! openssl_x509_check_private_key($cert, $clave)) {
            throw new ErrorDeNegocio('Este certificado NO se corresponde con la clave privada del servidor: se pidió con otra. Suele pasar al mezclar homologación con producción, o al pegar el certificado de un pedido anterior. Generá el pedido de nuevo y subí a ARCA ESE .csr.');
        }
        $info = openssl_x509_parse($cert);
        $serial = (string) ($info['subject']['serialNumber'] ?? '');
        $cuitDelCert = preg_replace('/\D/', '', $serial);
        if ($cuitDelCert !== '' && Config::cuit() !== '' && $cuitDelCert !== Config::cuit()) {
            throw new ErrorDeNegocio('El certificado es del CUIT '.$cuitDelCert.' y acá se factura con el '.Config::cuit().'. ARCA compara los dos y rechaza todo si no coinciden.');
        }
        $hasta = Carbon::createFromTimestamp((int) $info['validTo_time_t']);
        $desde = Carbon::createFromTimestamp((int) $info['validFrom_time_t']);
        if ($hasta->isPast()) {
            throw new ErrorDeNegocio('Este certificado venció el '.$hasta->format('d/m/Y').'. Hay que pedir uno nuevo en ARCA con un pedido nuevo.');
        }
        if ($desde->isFuture()) {
            throw new ErrorDeNegocio('Este certificado recién empieza a valer el '.$desde->format('d/m/Y').'.');
        }
        file_put_contents(Config::certPath(), $texto."\n");
        Config::resetDisponible();
        $nombre = fn (array $attrs) => implode(' · ', array_filter([$attrs['CN'] ?? null, $attrs['O'] ?? null])) ?: '—';

        return ['vence' => $hasta->toIso8601String(), 'emisor' => $nombre($info['issuer'] ?? []), 'subject' => $nombre($info['subject'] ?? []), 'certPath' => Config::certPath()];
    }

    /** Lo que la pantalla necesita saber del certificado instalado. */
    public static function instalado(): ?array
    {
        if (Config::certPath() === '' || ! is_file(Config::certPath())) {
            return null;
        }
        $info = @openssl_x509_parse(file_get_contents(Config::certPath()));
        if (! $info) {
            return ['ilegible' => true];
        }
        $hasta = Carbon::createFromTimestamp((int) $info['validTo_time_t']);

        return [
            'vence' => $hasta->toIso8601String(), 'diasParaVencer' => (int) floor(($hasta->getTimestamp() - time()) / 86400),
            'subject' => implode(' · ', array_filter([$info['subject']['CN'] ?? null, $info['subject']['O'] ?? null])),
        ];
    }

    /** ¿Hay clave privada en el servidor? (nunca se devuelve su contenido) */
    public static function hayClave(): ?array
    {
        if (Config::keyPath() === '' || ! is_file(Config::keyPath())) {
            return null;
        }

        return ['desde' => Carbon::createFromTimestamp(filemtime(Config::keyPath()))->toIso8601String(), 'ruta' => Config::keyPath()];
    }

    /**
     * "Que la carpeta exista" NO alcanza, y esto se aprendió perdiendo un
     * certificado: la imagen del contenedor crea la carpeta para que un
     * volumen nuevo herede el dueño, y con eso `is_dir()` da `true` aunque no
     * haya ningún volumen montado. La clave se genera contra el disco del
     * contenedor, el trámite sale perfecto, y el próximo deploy se la lleva.
     *
     * La pregunta correcta es si esa carpeta es un PUNTO DE MONTAJE. Se lee
     * de `/proc/self/mountinfo` (campo 5 = destino de cada montaje): si la
     * carpeta —o algún padre que no sea `/`— figura ahí, sobrevive al deploy.
     *
     * Solo importa DENTRO de un contenedor: en un servidor común, una carpeta
     * del disco raíz persiste sola. `null` = no se puede saber (Windows, sin
     * `/proc`, o no es un contenedor) y ahí no se avisa nada, que es lo correcto.
     */
    public static function volumenPersistente(): ?bool
    {
        $ruta = Config::keyPath();
        if ($ruta === '' || ! is_file('/proc/self/mountinfo')) {
            return null;
        }
        $carpeta = dirname($ruta);
        $montajes = @file('/proc/self/mountinfo', FILE_IGNORE_NEW_LINES);
        if ($montajes === false) {
            return null;
        }
        $destinos = [];
        $raizOverlay = false;
        foreach ($montajes as $linea) {
            $campos = explode(' - ', $linea, 2);
            $izq = explode(' ', $campos[0]);
            $destino = $izq[4] ?? null;
            if ($destino === null || $destino === '/') {
                if ($destino === '/' && preg_match('/^\s*(overlay|aufs)\b/', $campos[1] ?? '')) {
                    $raizOverlay = true;
                }
                continue;
            }
            $destinos[] = $destino;
        }
        if (! is_file('/.dockerenv') && ! $raizOverlay) {
            return null;
        }

        foreach ($destinos as $d) {
            if ($carpeta === $d || str_starts_with($carpeta, $d.'/')) {
                return true;
            }
        }

        return false;
    }
}
