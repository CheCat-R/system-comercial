<?php

namespace App\Services;

use App\Enums\MedioPago;
use App\Exceptions\ErrorDeNegocio;
use App\Support\Fila;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * DESCUENTOS CON NOMBRE — los que el dueño autoriza de antemano ("Empleados",
 * "Atención por tardanza") y la cajera elige en el momento.
 *
 *  · `listaId` es OBLIGATORIO: el descuento cae sobre los renglones de SU
 *    lista. Uno por lista.
 *  · `sucursalId` NULO = todas.
 *  · `requiereAdmin`: su porcentaje saltea el tope del vendedor, así que sin
 *    esta bandera publicar un 25% sería subirle el tope a todo el mundo.
 *  · `vence` guarda el instante FINAL del día elegido en hora argentina: vale
 *    todo su último día y comparar contra `now()` alcanza.
 */
class DescuentosService
{
    public const ZONA = 'America/Argentina/Buenos_Aires';

    public function listar(): array
    {
        return Fila::camelTodos(DB::table('descuentos')->orderByDesc('activo')->orderBy('nombre')->get());
    }

    public function una(int $id): array
    {
        $d = DB::table('descuentos')->find($id);
        if (! $d) {
            throw new NotFoundHttpException('Ese descuento no existe.');
        }

        return Fila::camel($d);
    }

    /** 'AAAA-MM-DD' → fin de ese día en Argentina (en UTC para la base). Vacío = sin vencimiento. */
    public static function vencimientoDe(?string $v): ?Carbon
    {
        $s = trim((string) $v);
        if ($s === '') {
            return null;
        }
        if (! preg_match('/^\d{4}-\d{2}-\d{2}/', $s)) {
            throw new ErrorDeNegocio('El vencimiento va como AAAA-MM-DD.');
        }

        return Carbon::parse(substr($s, 0, 10).' 23:59:59', self::ZONA)->utc();
    }

    private function validar(array $d, ?int $id = null): array
    {
        $nombre = trim($d['nombre'] ?? '');
        if ($nombre === '') {
            throw new ErrorDeNegocio('Poné un nombre para el descuento (es el que ve la cajera).');
        }
        $ya = DB::table('descuentos')->where('nombre', $nombre)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists();
        if ($ya) {
            throw new ErrorDeNegocio('Ya existe un descuento llamado "'.$nombre.'".');
        }
        $listaId = (int) ($d['listaId'] ?? 0);
        if (! $listaId) {
            throw new ErrorDeNegocio('Elegí a qué lista de precios se aplica el descuento.');
        }
        if (! DB::table('listas_venta')->where('id', $listaId)->exists()) {
            throw new ErrorDeNegocio('Esa lista de precios no existe.');
        }
        if (! empty($d['sucursalId']) && ! DB::table('sucursales')->where('id', (int) $d['sucursalId'])->exists()) {
            throw new ErrorDeNegocio('Esa sucursal no existe.');
        }
        $porc = (float) ($d['porcentaje'] ?? 0);
        if ($porc < 0 || $porc > 100) {
            throw new ErrorDeNegocio('El porcentaje va de 0 a 100.');
        }
        $medio = $d['medioPago'] ?? null;
        if ($medio !== null && $medio !== '' && ! in_array($medio, MedioPago::valores(), true)) {
            throw new ErrorDeNegocio('Medio de pago inválido.');
        }

        return ['nombre' => $nombre, 'listaId' => $listaId];
    }

    public function crear(array $d): array
    {
        $v = $this->validar($d);
        $id = DB::table('descuentos')->insertGetId([
            'nombre' => $v['nombre'], 'porcentaje' => round((float) ($d['porcentaje'] ?? 0), 2),
            'vence' => self::vencimientoDe($d['vence'] ?? null), 'medio_pago' => ($d['medioPago'] ?? '') ?: null,
            'lista_id' => $v['listaId'], 'sucursal_id' => $d['sucursalId'] ?? null,
            'requiere_admin' => (bool) ($d['requiereAdmin'] ?? false), 'activo' => ! array_key_exists('activo', $d) || (bool) $d['activo'],
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->una($id);
    }

    public function editar(int $id, array $d): array
    {
        $actual = DB::table('descuentos')->find($id);
        if (! $actual) {
            throw new NotFoundHttpException('Ese descuento no existe.');
        }
        $v = $this->validar([...$d, 'nombre' => $d['nombre'] ?? $actual->nombre, 'listaId' => $d['listaId'] ?? $actual->lista_id], $id);
        DB::table('descuentos')->where('id', $id)->update([
            'nombre' => $v['nombre'],
            'porcentaje' => array_key_exists('porcentaje', $d) ? round((float) $d['porcentaje'], 2) : $actual->porcentaje,
            // `vence` distingue "no lo mandaron" de "cadena vacía": la vacía lo BORRA.
            'vence' => array_key_exists('vence', $d) ? self::vencimientoDe($d['vence']) : $actual->vence,
            'medio_pago' => array_key_exists('medioPago', $d) ? (($d['medioPago'] ?? '') ?: null) : $actual->medio_pago,
            'lista_id' => $v['listaId'],
            'sucursal_id' => array_key_exists('sucursalId', $d) ? $d['sucursalId'] : $actual->sucursal_id,
            'requiere_admin' => array_key_exists('requiereAdmin', $d) ? (bool) $d['requiereAdmin'] : (bool) $actual->requiere_admin,
            'activo' => array_key_exists('activo', $d) ? (bool) $d['activo'] : (bool) $actual->activo,
            'updated_at' => now(),
        ]);

        return $this->una($id);
    }

    /** Borrar solo si NUNCA se usó; con ventas atrás se da de baja. */
    public function borrar(int $id): array
    {
        $d = DB::table('descuentos')->find($id);
        if (! $d) {
            throw new NotFoundHttpException('Ese descuento no existe.');
        }
        $uso = DB::table('venta_items')->where('descuento_id', $id)->count();
        if ($uso > 0) {
            throw new ErrorDeNegocio('"'.$d->nombre.'" ya se aplicó en '.$uso.' renglón(es) de venta: no se borra, se desactiva para que deje de ofrecerse sin perder de dónde salió cada descuento hecho.');
        }
        DB::table('descuentos')->where('id', $id)->delete();

        return ['ok' => true];
    }
}
