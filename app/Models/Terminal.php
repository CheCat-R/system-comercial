<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Terminal extends Model
{
    protected $table = 'terminales';

    protected $fillable = ['nombre', 'sucursal_id', 'token_hash', 'activa', 'creada_por', 'ultimo_uso', 'ultimo_agente'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
            'ultimo_uso' => 'datetime',
        ];
    }

    public function sucursal(): BelongsTo
    {
        return $this->belongsTo(Sucursal::class);
    }

    public static function hashDe(string $token): string
    {
        return hash('sha256', $token);
    }

    /** Genera un token nuevo en claro (la única vez que existe) y devuelve [token, hash]. */
    public static function nuevoToken(): array
    {
        $token = Str::random(48);

        return [$token, static::hashDe($token)];
    }

    /** La terminal ACTIVA a la que corresponde un token del navegador, o null. */
    public static function porToken(mixed $token): ?self
    {
        $t = trim((string) ($token ?? ''));
        if ($t === '') {
            return null;
        }
        $terminal = static::query()->with('sucursal')->where('token_hash', static::hashDe($t))->first();

        return $terminal && $terminal->activa ? $terminal : null;
    }

    /**
     * Se marca recién con el login YA aceptado: si contara los intentos
     * fallidos, `ultimo_uso` dejaría de servir para reconocer qué equipos están
     * realmente en uso.
     */
    public function marcarUso(string $userAgent = ''): void
    {
        $this->forceFill([
            'ultimo_uso' => now(),
            'ultimo_agente' => Str::limit($userAgent, 300, ''),
        ])->save();
    }
}
