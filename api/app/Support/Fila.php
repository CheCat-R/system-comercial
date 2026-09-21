<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Filas del query builder tal como viajan al panel: claves en camelCase y
 * fechas en ISO 8601 (UTC), igual que serializa Eloquent. Un solo lugar para
 * que ninguna tabla nueva salga con `fecha` como "2026-09-18 12:20:33" (sin
 * zona) mientras las demás salen con "Z".
 */
final class Fila
{
    /** Columnas booleanas: MariaDB las devuelve como 0/1. */
    private const BOOLEANOS = [
        'activo', 'activa', 'es_consumidor_final', 'cta_cte_habilitada', 'facturar_pendiente', 'reservado', 'requiere_admin',
        'incluye_fraccionados', 'relevo_caja', 'es_sistema', 'publicado', 'destacado', 'solo_fraccionar', 'usar_para_precio', 'ciego',
        'recepcion', 'es_flete', 'es_echeq', 'pedido_enviado', 'provee_mercaderia', 'provee_gastos',
    ];

    /** Columnas que son instantes. Todo lo demás viaja tal cual. */
    private const FECHAS = [
        'fecha', 'apertura', 'cierre', 'vence', 'desde', 'hasta', 'vencimiento', 'vencimiento_pago',
        'cae_vencimiento', 'anulado_en', 'created_at', 'updated_at', 'expires_at', 'estado_desde',
        'fecha_carga', 'fecha_emision', 'fecha_venc', 'fecha_alta', 'fecha_pedido', 'fecha_recepcion', 'revisado_at', 'subido_en',
        'conciliado_hasta', 'conciliado_at',
    ];

    public static function camel(object|array|null $fila): ?array
    {
        if ($fila === null) {
            return null;
        }
        $out = [];
        foreach ((array) $fila as $k => $v) {
            $out[Str::camel((string) $k)] = self::valor((string) $k, $v);
        }

        return $out;
    }

    /** @return array<int, array> */
    public static function camelTodos(iterable $filas): array
    {
        $out = [];
        foreach ($filas as $f) {
            $out[] = self::camel($f);
        }

        return $out;
    }

    public static function iso(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if ($v instanceof \DateTimeInterface) {
            return Carbon::instance($v)->toIso8601String();
        }

        return Carbon::parse((string) $v)->toIso8601String();
    }

    private static function valor(string $k, mixed $v): mixed
    {
        if (in_array($k, self::FECHAS, true)) {
            return self::iso($v);
        }
        if (in_array($k, self::BOOLEANOS, true) && $v !== null) {
            return (bool) $v;
        }

        return $v;
    }
}
