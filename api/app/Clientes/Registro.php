<?php

namespace App\Clientes;

/**
 * LA LISTA DE CLIENTES, que es la carpeta `clientes/`: un cliente existe si tiene su carpeta con un `.env`.
 *
 * No hay otra tabla ni otro archivo central que pueda quedar desparejo de la realidad. Lo que sobra (nombre, plan, fecha de alta)
 * va en la ficha `cliente.json` de cada carpeta; que un cliente esté suspendido, en el archivo `.suspendido`.
 */
final class Registro
{
    /** Donde estaría la carpeta de clientes, exista o no. */
    public static function raizPrevista(): string
    {
        return str_replace('\\', '/', getenv('CCS_CLIENTES') ?: dirname(base_path()).'/clientes');
    }

    /** La carpeta de clientes, o null si esta instalación no es multi-cliente. */
    public static function raiz(): ?string
    {
        return SelectorDeCliente::carpetaDeClientes(base_path());
    }

    /** @return list<string> dominios de los clientes, ordenados */
    public static function nombres(): array
    {
        $raiz = self::raiz();
        if ($raiz === null) {
            return [];
        }
        $out = [];
        foreach (scandir($raiz) ?: [] as $n) {
            if (SelectorDeCliente::normalizar($n) === $n && is_file($raiz.'/'.$n.'/.env')) {
                $out[] = $n;
            }
        }
        sort($out);

        return $out;
    }

    public static function existe(string $nombre): bool
    {
        return in_array($nombre, self::nombres(), true);
    }

    public static function carpeta(string $nombre): string
    {
        return (self::raiz() ?? self::raizPrevista()).'/'.$nombre;
    }

    public static function ficha(string $nombre): array
    {
        $f = self::carpeta($nombre).'/cliente.json';

        return is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    }

    public static function guardarFicha(string $nombre, array $ficha): void
    {
        file_put_contents(self::carpeta($nombre).'/cliente.json', json_encode($ficha, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
    }

    /** @return array{desde:string, motivo:string}|null */
    public static function suspension(string $nombre): ?array
    {
        $f = self::carpeta($nombre).'/.suspendido';
        if (! is_file($f)) {
            return null;
        }

        return (json_decode((string) file_get_contents($f), true) ?: []) + ['desde' => date('c', (int) filemtime($f)), 'motivo' => ''];
    }

    /** Las claves del `.env` del cliente (lectura simple: lo que hace falta para listar, sin interpretar variables). */
    public static function entorno(string $nombre): array
    {
        $out = [];
        foreach (file(self::carpeta($nombre).'/.env', FILE_IGNORE_NEW_LINES) ?: [] as $linea) {
            if (preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/', $linea, $m) === 1) {
                $out[$m[1]] = trim($m[2], "\"'");
            }
        }

        return $out;
    }

    /** Borra una carpeta entera (sin seguir enlaces simbólicos). */
    public static function borrarCarpeta(string $dir): void
    {
        foreach (scandir($dir) ?: [] as $f) {
            if ($f === '.' || $f === '..') {
                continue;
            }
            $ruta = $dir.'/'.$f;
            is_dir($ruta) && ! is_link($ruta) ? self::borrarCarpeta($ruta) : @unlink($ruta);
        }
        @rmdir($dir);
    }
}
