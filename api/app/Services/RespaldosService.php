<?php

namespace App\Services;

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
    public function __construct(private readonly AuditoriaService $audit) {}

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
        if ($bytes <= 0) {
            return '0 B';
        }
        $unidades = ['B', 'kB', 'MB', 'GB', 'TB'];
        $i = (int) floor(log($bytes, 1024));
        $i = min($i, count($unidades) - 1);

        return round($bytes / (1024 ** $i), $i ? 1 : 0).' '.$unidades[$i];
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
        ];
    }

    /**
     * Devuelve un callable listo para `response()->streamDownload()`: escribe
     * el volcado completo directo a la salida, sin acumularlo en memoria.
     */
    public function volcar(?int $usuarioId): callable
    {
        return function () use ($usuarioId) {
            $tablas = $this->tablas();
            $fecha = now();
            $bytes = 0;
            $filasTotal = 0;
            $escribir = function (string $s) use (&$bytes) {
                $bytes += strlen($s);
                echo $s;
            };

            $escribir(implode("\n", [
                '-- Respaldo de CheCAT — '.$fecha->toIso8601String(),
                '-- '.count($tablas).' tablas. Generado desde Sistema › Respaldos.',
                '--',
                '-- CÓMO SE RESTAURA (en una base NUEVA):',
                '--   1. Crear la base y correr las migraciones del sistema:  php artisan migrate',
                '--   2. Cargar este archivo:                                 mysql -u usuario -p base < archivo.sql',
                '-- El archivo vacía las tablas y las vuelve a llenar; corre con las claves',
                '-- foráneas apagadas, así que el orden de las tablas no importa.',
                '',
                'SET FOREIGN_KEY_CHECKS=0;',
                '',
            ]));

            $pdo = DB::connection()->getPdo();
            foreach ($tablas as $t) {
                $escribir("TRUNCATE TABLE `{$t}`;\n");
                // No todas tienen `id` (ej. `arca_tokens`, con `service` como PK): se ordena solo cuando existe.
                $q = DB::table($t);
                if (Schema::hasColumn($t, 'id')) {
                    $q->orderBy('id');
                }
                $filas = $q->get();
                if ($filas->isEmpty()) {
                    continue;
                }
                $cols = array_keys((array) $filas->first());
                $colsSql = implode(', ', array_map(fn ($c) => "`{$c}`", $cols));
                $escribir("-- {$t}: {$filas->count()} fila(s)\n");
                foreach ($filas->chunk(200) as $lote) {
                    $valores = $lote->map(function ($fila) use ($cols, $pdo) {
                        $fila = (array) $fila;
                        $vals = array_map(fn ($c) => $fila[$c] === null ? 'NULL' : $pdo->quote((string) $fila[$c]), $cols);

                        return '('.implode(', ', $vals).')';
                    })->implode(",\n");
                    $escribir("INSERT INTO `{$t}` ({$colsSql}) VALUES\n{$valores};\n");
                }
                $filasTotal += $filas->count();
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

            // El rastro se registra DESPUÉS de terminar de escribir: un fallo acá no le corta la descarga a quien la está bajando.
            $mb = number_format($bytes / 1024 / 1024, 1);
            $this->audit->registrar([[
                'entidad' => 'sistema', 'entidadId' => 0, 'ambito' => 'Respaldos',
                'campo' => 'Descarga del respaldo', 'usuarioId' => $usuarioId,
                'despues' => count($tablas)." tablas · ".number_format($filasTotal, 0, ',', '.')." filas · {$mb} MB",
            ]]);
        };
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
