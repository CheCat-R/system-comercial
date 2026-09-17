<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sucursal extends Model
{
    protected $table = 'sucursales';

    public const TIPO_DISTRIBUIDORA = 'distribuidora';
    public const TIPO_EXPRESS = 'express';
    public const TIPOS = [self::TIPO_DISTRIBUIDORA, self::TIPO_EXPRESS];

    protected $fillable = ['nombre', 'tipo', 'punto_venta', 'direccion'];

    // Las columnas generadas no viajan al cliente: son un detalle del índice.
    protected $hidden = ['punto_venta_unico', 'distribuidora_unica'];

    public function terminales(): HasMany
    {
        return $this->hasMany(Terminal::class);
    }

    /**
     * El punto de venta fiscal normalizado: sólo dígitos, sin ceros a la
     * izquierda, y completado a cinco. Vacío si no hay nada.
     */
    public static function normalizarPuntoVenta(mixed $v): string
    {
        $d = ltrim(preg_replace('/\D/', '', (string) ($v ?? '')), '0');

        return $d === '' ? '' : str_pad($d, 5, '0', STR_PAD_LEFT);
    }

    /** La central: la primera sucursal por id (el superadmin entra ahí si no elige). */
    public static function central(): ?self
    {
        return static::query()->orderBy('id')->first();
    }
}
