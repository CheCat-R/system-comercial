<?php

namespace App\Models;

use App\Enums\EstadoProducto;
use App\Enums\TipoProducto;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Producto extends Model
{
    protected $table = 'productos';

    protected $fillable = [
        'nombre', 'descripcion', 'codigo_propio', 'codigo_barras', 'dun', 'unidades_por_bulto',
        'etiqueta_marca', 'etiqueta_nombre', 'marca_id', 'categoria_id', 'subcategoria_id',
        'iva', 'tipo', 'estado', 'estado_desde', 'motivo_baja', 'solo_fraccionar', 'stock_min', 'redondeo',
        'publicado', 'id_externo', 'imagen_url', 'destacado', 'web_stock_min',
    ];

    protected $hidden = ['codigo_propio_unico', 'codigo_barras_unico', 'dun_unico'];

    protected function casts(): array
    {
        return [
            'tipo' => TipoProducto::class,
            'estado' => EstadoProducto::class,
            'estado_desde' => 'datetime',
            'solo_fraccionar' => 'boolean',
            'publicado' => 'boolean',
            'destacado' => 'boolean',
            'unidades_por_bulto' => 'float',
            'iva' => 'float',
            'stock_min' => 'float',
            'web_stock_min' => 'float',
        ];
    }

    /* ---------------- Relaciones ---------------- */

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class);
    }

    public function categoria(): BelongsTo
    {
        return $this->belongsTo(Categoria::class);
    }

    public function subcategoria(): BelongsTo
    {
        return $this->belongsTo(Subcategoria::class);
    }

    public function etiquetas(): BelongsToMany
    {
        return $this->belongsToMany(Etiqueta::class, 'producto_etiquetas');
    }

    /** Los tamaños fraccionados (sólo granel). */
    public function presentaciones(): HasMany
    {
        return $this->hasMany(Presentacion::class)->orderBy('tam_kg');
    }

    /** Los formatos de compra: cómo lo vende cada proveedor. */
    public function formatos(): HasMany
    {
        return $this->hasMany(ProductoProveedor::class);
    }

    /** El formato ACTIVO: el único que fija costo y precios. */
    public function formatoActivo(): HasOne
    {
        return $this->hasOne(ProductoProveedor::class)->where('usar_para_precio', true);
    }

    /** Markup / precio fijo por lista (producto entero y presentaciones). */
    public function listas(): HasMany
    {
        return $this->hasMany(ProductoLista::class);
    }

    public function stock(): HasMany
    {
        return $this->hasMany(Stock::class);
    }

    /* ---------------- Scopes ---------------- */

    /** Lo que se puede VENDER: activo o discontinuado (hasta agotar). */
    public function scopeVendible(Builder $q): Builder
    {
        return $q->whereIn('estado', [EstadoProducto::Activo->value, EstadoProducto::Discontinuado->value]);
    }

    /** Lo que se puede COMPRAR: sólo activo. */
    public function scopeComprable(Builder $q): Builder
    {
        return $q->where('estado', EstadoProducto::Activo->value);
    }

    /* ---------------- Helpers ---------------- */

    public function esGranel(): bool
    {
        return $this->tipo === TipoProducto::Granel;
    }

    /** Unidad en la que se cuenta el stock: kg para granel, u para entero. */
    public function unidad(): string
    {
        return $this->esGranel() ? 'kg' : 'u';
    }
}
