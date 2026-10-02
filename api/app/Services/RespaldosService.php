<?php

namespace App\Services;

use App\Auth\PlanCatalogo;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * RESPALDOS (Sistema › Respaldos)
 * ============================================================================
 * La versión CHICA y honesta: los backups automáticos del hosting no son cosa
 * de esta pantalla. Lo que agrega es lo que el hosting solo no cubre:
 *
 *   1. LA COPIA EXTERNA: un botón que genera el volcado completo de la base y
 *      lo baja a la máquina del dueño. Si el servidor (o el proveedor) se cae
 *      con sus backups adentro, la copia de afuera es la que salva.
 *   2. EL RASTRO: cada descarga queda en `auditoria` (quién, cuándo, tamaño),
 *      y la pantalla muestra la última — "hace tres meses que nadie baja una
 *      copia" es un dato que tiene que estar a la vista.
 *
 * EL VOLCADO SE GENERA SIN `mysqldump` a propósito: en hosting compartido no
 * hay garantía de que el binario esté disponible ni de que `exec()` esté
 * habilitado. En su lugar se lee cada tabla fila por fila y se emiten
 * INSERTs con los valores citados por el driver (PDO::quote — lo mismo que
 * usa el propio Laravel al armar sus bindings). La restauración es: base con
 * el esquema ya migrado (`php artisan migrate`) + cargar este archivo con
 * `mysql base < archivo.sql` — las instrucciones van en el encabezado del
 * propio archivo, que es donde se las busca en la urgencia.
 */
class RespaldosService
{
    /** Días sin bajar una copia externa a partir de los cuales el panel avisa. */
    public const UMBRAL_AVISO_DIAS = 7;

    /** Clave de plan de la copia diaria automática (Pymes y Corporativo). */
    public const CLAVE_PLAN_AUTO = 'sistema.respaldos_auto';

    /** Horas sin una copia automática nueva a partir de las cuales se la da por caída (diaria + margen de un turno). */
    private const HORAS_AUTO_ATRASADA = 36;

    private const PATRON_AUTO = '/^respaldo-auto-\d{4}-\d{2}-\d{2}-\d{4}\.sql\.gz$/';

    public function __construct(
        private readonly AuditoriaService $audit,
        private readonly LicenciaService $licencia,
    ) {}

    /**
     * Tablas TRANSACCIONALES que se vacían al terminar el período de prueba.
     * Todo lo que es CATÁLOGO o IDENTIDAD se conserva: productos y sus
     * formatos, proveedores con percepciones y cuentas, clientes, listas y
     * precios (con su historial), ofertas, usuarios/roles/sesiones,
     * sucursales, terminales, configuración, chat y las plantillas de gastos
     * recurrentes.
     */
    private const TABLAS_PRACTICA = [
        // stock y su película
        'stock', 'movimientos',
        // almacén: conteos, transferencias, incidencias, vencimientos
        'conteos', 'conteo_items',
        'transferencias', 'transferencia_items', 'transferencia_hist',
        'incidencias',
        'vencimiento_sesiones', 'vencimientos',
        // compras: comprobantes (facturas, remitos, liquidaciones)
        'comprobantes', 'comprobante_items', 'comprobante_percepciones',
        // ventas: tickets, presupuestos, cobranzas y caja
        'ventas', 'venta_items', 'venta_extras', 'venta_pagos',
        'presupuestos', 'presupuesto_items',
        'cobranzas', 'cobranza_pagos', 'cobranza_imputaciones',
        'caja_sesiones', 'caja_movimientos', 'caja_controles',
        // proveedores: pagos (con su split multi-medio), compromisos, echeqs, ajustes
        'proveedor_pagos', 'pago_formas', 'proveedor_imputaciones',
        'proveedor_compromisos', 'proveedor_echeqs', 'proveedor_ajustes',
        'pedidos_proveedor',
        // gastos (los cargados; las plantillas recurrentes y los rubros quedan)
        'gastos', 'gasto_items', 'gasto_adjuntos',
        // el rastro de la práctica; el primer registro de la era nueva es la limpieza
        'auditoria',
    ];

    /** Tablas del schema activo, orden alfabético. `migrations` queda afuera: es bookkeeping del framework, no datos del negocio. */
    private function tablas(): array
    {
        return DB::table('information_schema.tables')
            ->where('table_schema', DB::connection()->getDatabaseName())
            ->where('table_name', '!=', 'migrations')
            ->orderBy('table_name')
            ->pluck('table_name')
            ->all();
    }

    private function tamanoPretty(): string
    {
        $bytes = (float) DB::table('information_schema.tables')
            ->where('table_schema', DB::connection()->getDatabaseName())
            ->sum(DB::raw('data_length + index_length'));

        return $this->legible($bytes);
    }

    /** ¿Esta instalación tiene la copia diaria automática? (Pymes y Corporativo; Emprendedor no.) */
    public function automaticoIncluido(): bool
    {
        return PlanCatalogo::incluye($this->licencia->plan(), self::CLAVE_PLAN_AUTO);
    }

    /**
     * EL AVISO DE LA COPIA EXTERNA (todos los planes). La copia automática vive
     * en el mismo servidor que la base, así que no reemplaza a la de afuera:
     * lo que se vigila es cuánto hace que alguien se llevó un archivo.
     *
     * Una instalación recién armada, sin nada cargado, no tiene qué proteger
     * todavía: el primer día no se la molesta. Apenas hay ventas o compras,
     * "nunca bajaste una copia" pasa a ser un aviso.
     *
     * @return array{ultimaDescarga:?string, dias:?int, avisar:bool}
     */
    public function avisoCopiaExterna(): array
    {
        $fecha = DB::table('auditoria')->where('entidad', 'sistema')->where('ambito', 'Respaldos')
            ->where('campo', 'Descarga del respaldo')->max('fecha');

        if ($fecha === null) {
            $hayDatos = DB::table('ventas')->exists() || DB::table('comprobantes')->exists();

            return ['ultimaDescarga' => null, 'dias' => null, 'avisar' => $hayDatos];
        }
        $ultima = Carbon::parse($fecha);
        $dias = (int) floor($ultima->diffInDays(now(), true));

        return ['ultimaDescarga' => $ultima->toIso8601String(), 'dias' => $dias, 'avisar' => $dias >= self::UMBRAL_AVISO_DIAS];
    }

    /**
     * Lo mínimo para la insignia del menú: cuántas cosas del respaldo piden
     * atención. Devuelve ceros a quien no tiene el permiso (la insignia no
     * debe filtrar nada ni dar 403 en cada pantalla de quien no es dueño).
     */
    public function estado(bool $puedeVer): array
    {
        if (! $puedeVer) {
            return ['avisar' => false, 'automaticoFalla' => false, 'problemas' => 0];
        }
        $avisar = $this->avisoCopiaExterna()['avisar'];
        $falla = $this->automaticoIncluido() && $this->automatico()['problema'];

        return ['avisar' => $avisar, 'automaticoFalla' => $falla, 'problemas' => (int) $avisar + (int) $falla];
    }

    // ------------------------------------------------------------------
    // COPIA DIARIA AUTOMÁTICA (Pymes y Corporativo)
    // ------------------------------------------------------------------

    /** Carpeta de las copias automáticas: en el servidor, fuera de `public/` (no se sirve por la web). */
    public function carpetaAutomaticos(): string
    {
        return config('checat.respaldos.carpeta') ?: storage_path('app/respaldos');
    }

    private function retencion(): int
    {
        return max(1, (int) config('checat.respaldos.retencion', 14));
    }

    /**
     * Genera la copia del día: el MISMO volcado de la descarga manual, pero
     * comprimido y guardado en el servidor. Se escribe a un archivo `.parcial`
     * y recién se renombra al terminar, así un corte a mitad de camino nunca
     * deja un archivo trunco que parezca una copia buena.
     *
     * Después poda: se conservan las últimas N copias (por cantidad, no por
     * antigüedad — si el servidor estuvo apagado una semana, no se borra todo
     * lo que había al volver).
     *
     * @return array{archivo:string, bytes:int, resumen:string}
     */
    public function generarAutomatico(): array
    {
        $carpeta = $this->carpetaAutomaticos();
        if (! is_dir($carpeta) && ! @mkdir($carpeta, 0750, true) && ! is_dir($carpeta)) {
            $this->anotarIntento(false, "No se pudo crear la carpeta de copias ({$carpeta}).");
            throw new \RuntimeException("No se pudo crear la carpeta de copias: {$carpeta}");
        }

        $archivo = 'respaldo-auto-'.now()->format('Y-m-d-Hi').'.sql.gz';
        $final = $carpeta.DIRECTORY_SEPARATOR.$archivo;
        $parcial = $final.'.parcial';

        $gz = @gzopen($parcial, 'wb6');
        if ($gz === false) {
            $this->anotarIntento(false, "No se pudo escribir en {$carpeta}.");
            throw new \RuntimeException("No se pudo escribir en la carpeta de copias: {$carpeta}");
        }
        try {
            $r = $this->escribirVolcado(function (string $s) use ($gz) {
                gzwrite($gz, $s);
            });
        } catch (\Throwable $e) {
            gzclose($gz);
            @unlink($parcial);
            $this->anotarIntento(false, $e->getMessage());
            throw $e;
        }
        gzclose($gz);
        rename($parcial, $final);

        $this->podarAutomaticos();
        $bytes = (int) filesize($final);
        $this->anotarIntento(true, $r['resumen'].' · comprimido '.$this->legible($bytes));

        return ['archivo' => $archivo, 'bytes' => $bytes, 'resumen' => $r['resumen']];
    }

    private function podarAutomaticos(): void
    {
        $viejos = array_slice($this->archivosAutomaticos(), $this->retencion());
        foreach ($viejos as $a) {
            @unlink($this->carpetaAutomaticos().DIRECTORY_SEPARATOR.$a);
        }
    }

    /** Nombres de las copias automáticas, de la más nueva a la más vieja (el nombre lleva la fecha). */
    private function archivosAutomaticos(): array
    {
        $carpeta = $this->carpetaAutomaticos();
        if (! is_dir($carpeta)) {
            return [];
        }
        $nombres = array_values(array_filter(scandir($carpeta) ?: [], fn ($n) => preg_match(self::PATRON_AUTO, $n) === 1));
        rsort($nombres);

        return $nombres;
    }

    /** El resultado del último intento queda en un archivito aparte: una copia por día no tiene que ensuciar la auditoría de gerencia. */
    private function anotarIntento(bool $ok, string $mensaje): void
    {
        $carpeta = $this->carpetaAutomaticos();
        if (is_dir($carpeta)) {
            @file_put_contents($carpeta.DIRECTORY_SEPARATOR.'ultimo-intento.json', json_encode([
                'fecha' => now()->toIso8601String(), 'ok' => $ok, 'mensaje' => $mensaje,
            ], JSON_UNESCAPED_UNICODE));
        }
    }

    /**
     * Estado de la copia diaria: qué copias hay, cuál fue la última y si el
     * programador del servidor las está generando. `problema` es lo que prende
     * la insignia: o el último intento falló, o pasaron más de 36 h sin una
     * copia nueva habiendo existido antes (señal típica de que el servidor
     * dejó de ejecutar las tareas programadas).
     */
    public function automatico(): array
    {
        $carpeta = $this->carpetaAutomaticos();
        $copias = array_map(function ($nombre) use ($carpeta) {
            $ruta = $carpeta.DIRECTORY_SEPARATOR.$nombre;
            $bytes = (int) @filesize($ruta);

            // La fecha sale del NOMBRE, no del archivo en disco: al copiar o restaurar la carpeta el sistema operativo cambia la fecha del archivo, el nombre no.
            $fecha = Carbon::createFromFormat('Y-m-d-Hi', substr($nombre, strlen('respaldo-auto-'), 15));

            return [
                'archivo' => $nombre,
                'fecha' => $fecha->toIso8601String(),
                'bytes' => $bytes,
                'tamano' => $this->legible($bytes),
            ];
        }, $this->archivosAutomaticos());

        $intento = null;
        $json = $carpeta.DIRECTORY_SEPARATOR.'ultimo-intento.json';
        if (is_file($json)) {
            $intento = json_decode((string) file_get_contents($json), true) ?: null;
        }

        $ultima = $copias[0]['fecha'] ?? null;
        $atrasada = $ultima !== null && Carbon::parse($ultima)->diffInHours(now(), true) >= self::HORAS_AUTO_ATRASADA;
        $fallo = $intento !== null && ! ($intento['ok'] ?? true);

        return [
            'copias' => $copias,
            'retencion' => $this->retencion(),
            'ultimoIntento' => $intento,
            'atrasada' => $atrasada,
            'fallo' => $fallo,
            'problema' => $atrasada || $fallo,
        ];
    }

    /** Ruta de una copia automática por su nombre, o `null` si el nombre no es de una copia nuestra (nada de rutas libres). */
    public function rutaAutomatico(string $archivo): ?string
    {
        if (preg_match(self::PATRON_AUTO, $archivo) !== 1) {
            return null;
        }
        $ruta = $this->carpetaAutomaticos().DIRECTORY_SEPARATOR.$archivo;

        return is_file($ruta) ? $ruta : null;
    }

    /** Bajar una copia automática es llevarse una copia afuera: cuenta para el aviso igual que la descarga manual. */
    public function registrarDescargaAutomatico(string $archivo, ?int $usuarioId): void
    {
        $ruta = $this->rutaAutomatico($archivo);
        $this->audit->registrar([[
            'entidad' => 'sistema', 'entidadId' => 0, 'ambito' => 'Respaldos',
            'campo' => 'Descarga del respaldo', 'usuarioId' => $usuarioId,
            'despues' => 'Copia automática '.$archivo.' · '.$this->legible($ruta ? (int) filesize($ruta) : 0),
        ]]);
    }

    public function info(): array
    {
        $descargas = DB::table('auditoria as a')
            ->leftJoin('usuarios as u', 'u.id', '=', 'a.usuario_id')
            ->where('a.entidad', 'sistema')->where('a.ambito', 'Respaldos')
            ->orderByDesc('a.id')->limit(10)
            ->get(['a.fecha', 'a.despues as detalle', DB::raw("coalesce(u.nombre, '') as usuario")]);

        return [
            'tamano' => $this->tamanoPretty(),
            'tablas' => count($this->tablas()),
            'resumen' => [
                'productos' => DB::table('productos')->count(),
                'ventas' => DB::table('ventas')->count(),
                'comprobantes' => DB::table('comprobantes')->count(),
                'clientes' => DB::table('clientes')->count(),
            ],
            'descargas' => $descargas->all(),
            'aviso' => $this->avisoCopiaExterna(),
            // `null` en Emprendedor: el panel no muestra la sección ni la menciona.
            'automatico' => $this->automaticoIncluido() ? $this->automatico() : null,
        ];
    }

    /**
     * Devuelve un callable listo para `response()->streamDownload()`: escribe
     * el volcado completo directo a la salida, sin acumularlo en memoria.
     */
    public function volcar(?int $usuarioId): callable
    {
        return function () use ($usuarioId) {
            $r = $this->escribirVolcado(function (string $s) {
                echo $s;
            });

            // El rastro se registra DESPUÉS de terminar de escribir: un fallo acá no le corta la descarga a quien la está bajando.
            $this->audit->registrar([[
                'entidad' => 'sistema', 'entidadId' => 0, 'ambito' => 'Respaldos',
                'campo' => 'Descarga del respaldo', 'usuarioId' => $usuarioId,
                'despues' => $r['resumen'],
            ]]);
        };
    }

    /**
     * Escribe el volcado completo llamando a `$salida` con cada trozo. Lo usan
     * tanto la descarga manual (la salida es el navegador) como la copia
     * automática (la salida es un archivo comprimido en el servidor): un solo
     * generador, así lo que se prueba en uno vale para el otro.
     *
     * TODO bajo UNA transacción de lectura: MySQL fija la foto de la base en la
     * primera lectura, y las demás tablas se leen contra esa misma foto. Sin
     * eso, una venta que entra mientras el volcado recorre las tablas queda en
     * `ventas` pero no en `venta_items` (o al revés) y el respaldo sale
     * incoherente — sobre todo a la hora de una copia programada, que no
     * espera a que el local deje de vender.
     *
     * @return array{tablas:int, filas:int, bytes:int, resumen:string}
     */
    private function escribirVolcado(callable $salida): array
    {
        $bytes = 0;
        $filasTotal = 0;
        $escribir = function (string $s) use (&$bytes, $salida) {
            $bytes += strlen($s);
            $salida($s);
        };

        DB::beginTransaction();
        try {
            $tablas = $this->tablas();
            $fecha = now();

            $escribir(implode("\n", [
                '-- Respaldo de CheCAT — '.$fecha->toIso8601String(),
                '-- '.count($tablas).' tablas. Generado desde Sistema › Respaldos.',
                '--',
                '-- CÓMO SE RESTAURA (en una base NUEVA):',
                '--   1. Crear la base y correr las migraciones del sistema:  php artisan migrate',
                '--   2. Cargar este archivo:                                 mysql -u usuario -p base < archivo.sql',
                '--      (si termina en .gz, descomprimirlo antes: gunzip archivo.sql.gz)',
                '-- El archivo vacía las tablas y las vuelve a llenar; corre con las claves',
                '-- foráneas apagadas, así que el orden de las tablas no importa.',
                '',
                'SET FOREIGN_KEY_CHECKS=0;',
                '',
            ]));

            $pdo = DB::connection()->getPdo();
            foreach ($tablas as $t) {
                $escribir("TRUNCATE TABLE `{$t}`;\n");
                $total = DB::table($t)->count();
                if ($total === 0) {
                    continue;
                }
                $escribir("-- {$t}: {$total} fila(s)\n");

                /*
                 * DE A TANDAS, nunca la tabla entera: `get()` carga todas las
                 * filas en memoria de PHP, y con unas cientos de miles (un año de
                 * movimientos o auditoría) el respaldo moría por memoria justo
                 * cuando más hacía falta. `chunkById` mantiene el pico plano sin
                 * importar el tamaño. Solo `arca_tokens` no tiene `id` (su PK es
                 * `service`) y es de un puñado de filas: esa va entera.
                 */
                $cols = null;
                $emitir = function ($lote) use ($t, $pdo, &$cols, $escribir) {
                    $cols ??= array_keys((array) $lote->first());
                    $colsSql = implode(', ', array_map(fn ($c) => "`{$c}`", $cols));
                    $valores = $lote->map(function ($fila) use ($cols, $pdo) {
                        $fila = (array) $fila;
                        $vals = array_map(fn ($c) => $fila[$c] === null ? 'NULL' : $pdo->quote((string) $fila[$c]), $cols);

                        return '('.implode(', ', $vals).')';
                    })->implode(",\n");
                    $escribir("INSERT INTO `{$t}` ({$colsSql}) VALUES\n{$valores};\n");
                };
                if (Schema::hasColumn($t, 'id')) {
                    DB::table($t)->chunkById(500, $emitir, 'id');
                } else {
                    foreach (DB::table($t)->get()->chunk(200) as $lote) {
                        $emitir($lote);
                    }
                }
                $filasTotal += $total;
            }

            // Los auto_increment arrancan después del último id insertado, tabla por tabla.
            $escribir("\n-- Contadores al día\n");
            foreach ($tablas as $t) {
                if (! Schema::hasColumn($t, 'id')) {
                    continue;
                }
                $max = DB::table($t)->max('id');
                if ($max !== null) {
                    $escribir("ALTER TABLE `{$t}` AUTO_INCREMENT = ".((int) $max + 1).";\n");
                }
            }
            $escribir("\nSET FOREIGN_KEY_CHECKS=1;\n");
        } finally {
            // Solo se leyó: no hay nada que confirmar, se suelta la foto.
            DB::rollBack();
        }

        return [
            'tablas' => count($tablas),
            'filas' => $filasTotal,
            'bytes' => $bytes,
            'resumen' => count($tablas).' tablas · '.number_format($filasTotal, 0, ',', '.').' filas · '.$this->legible($bytes),
        ];
    }

    /** "812 kB", "4,6 MB": el tamaño con la unidad que corresponde (antes todo se mostraba en MB y una base chica decía "0,0 MB"). */
    private function legible(float $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }
        $unidades = ['B', 'kB', 'MB', 'GB', 'TB'];
        $i = min((int) floor(log($bytes, 1024)), count($unidades) - 1);

        return str_replace('.', ',', (string) round($bytes / (1024 ** $i), $i ? 1 : 0)).' '.$unidades[$i];
    }

    /** El ensayo de la limpieza: cuántas filas se irían, tabla por tabla. */
    public function ensayoLimpieza(): array
    {
        $detalle = [];
        $total = 0;
        foreach (self::TABLAS_PRACTICA as $t) {
            $n = DB::table($t)->count();
            if ($n > 0) {
                $detalle[] = ['tabla' => $t, 'filas' => $n];
            }
            $total += $n;
        }

        return ['tablas' => count(self::TABLAS_PRACTICA), 'total' => $total, 'detalle' => $detalle];
    }

    /**
     * LA LIMPIEZA. A diferencia de Postgres, `TRUNCATE` en MySQL/InnoDB hace
     * commit implícito — no es transaccional. Por eso acá se borra con
     * `DELETE` (que sí respeta la transacción: o entra todo, o no entra
     * nada) y el reinicio de los contadores de autoincremento va DESPUÉS,
     * como paso cosmético aparte: si ese paso fallara, el borrado ya está
     * confirmado y correcto, solo el próximo id no arrancaría exactamente en 1.
     */
    public function limpiarPractica(?int $usuarioId): array
    {
        $antes = $this->ensayoLimpieza();

        DB::transaction(function () {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
            foreach (self::TABLAS_PRACTICA as $t) {
                DB::table($t)->delete();
            }
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        });
        foreach (self::TABLAS_PRACTICA as $t) {
            DB::statement("ALTER TABLE `{$t}` AUTO_INCREMENT = 1");
        }

        $this->audit->registrar([[
            'entidad' => 'sistema', 'entidadId' => 0, 'ambito' => 'Limpieza',
            'campo' => 'Fin del período de prueba', 'usuarioId' => $usuarioId,
            'despues' => 'Se vaciaron '.number_format($antes['total'], 0, ',', '.').' filas de '.count($antes['detalle'])." tablas (stock, ventas, compras, caja, cobranzas y demás operatoria de práctica). "
                .'El catálogo, los proveedores, los clientes y la configuración quedaron intactos.',
        ]]);

        return ['ok' => true, 'borradas' => $antes['total'], 'detalle' => $antes['detalle']];
    }
}
