<?php

namespace App\Services;

use App\Enums\CondicionIva;
use App\Enums\TipoDoc;
use App\Exceptions\ErrorDeNegocio;
use App\Models\Cliente;
use App\Support\Fila;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * CLIENTES. No es una agenda: concentra las reglas que la venta consulta
 * después (letra del comprobante, listas, crédito).
 *
 *  1. Existe SIEMPRE un "Consumidor Final" genérico. Se autocrea; no se borra
 *     ni se desactiva.
 *  2. Un cliente con historial NUNCA se borra: baja lógica.
 *  3. Habilitar cuenta corriente y fijar el límite es OTORGAR CRÉDITO: pide la
 *     llave `cta_cte`, a nivel campo (el resto de la ficha se guarda igual).
 */
class ClientesService
{
    /** Longitud exigida por tipo de documento (0 = sin validación). */
    private const LARGO_DOC = ['cuit' => 11, 'cuil' => 11, 'dni' => 0, 'sin_identificar' => 0];

    public const SIN_LLAVE_CREDITO = 'Habilitar la cuenta corriente y fijar su límite pide la llave "Cuenta corriente" (Gerencia › Usuarios y roles). El resto de la ficha se guarda igual si no tocás esos campos.';

    /* ------------------------------ Lectura ------------------------------ */

    public function listar(?bool $activo = null): array
    {
        $q = Cliente::query()->orderBy('nombre');
        if ($activo !== null) {
            $q->where('activo', $activo);
        }
        $clientes = $q->get();
        $listas = DB::table('cliente_listas')->whereIn('cliente_id', $clientes->pluck('id'))->get()->groupBy('cliente_id');

        return $clientes->map(fn (Cliente $c) => $this->publico($c, $listas->get($c->id)?->pluck('lista_id')->map(fn ($x) => (int) $x)->all() ?? []))->all();
    }

    public function get(int $id): Cliente
    {
        $c = Cliente::query()->find($id);
        if (! $c) {
            throw new NotFoundHttpException('Cliente inexistente.');
        }

        return $c;
    }

    public function publico(Cliente $c, ?array $listas = null): array
    {
        $listas ??= DB::table('cliente_listas')->where('cliente_id', $c->id)->pluck('lista_id')->map(fn ($x) => (int) $x)->all();

        return [...Fila::camel($c->getAttributes()), 'listas' => $listas];
    }

    /** Consumidor Final genérico: se autocrea la primera vez que se lo pide. */
    public function consumidorFinal(): Cliente
    {
        $c = Cliente::query()->where('es_consumidor_final', true)->first();
        if ($c) {
            return $c;
        }

        return Cliente::query()->create([
            'nombre' => 'Consumidor Final', 'tipo_doc' => 'sin_identificar', 'condicion_iva' => 'consumidor_final',
            'es_consumidor_final' => true, 'cta_cte_habilitada' => false, 'activo' => true,
        ]);
    }

    /* ------------------------------ Escritura ------------------------------ */

    private static function soloDigitos(?string $v): string
    {
        return preg_replace('/\D/', '', (string) $v);
    }

    /** Un mismo CUIT/DNI cargado dos veces termina en dos cuentas corrientes paralelas. */
    private function validarDocumento(array $d, ?int $excluirId = null): array
    {
        $tipoDoc = $d['tipoDoc'] ?? 'dni';
        if (! in_array($tipoDoc, TipoDoc::valores(), true)) {
            throw new ErrorDeNegocio('Tipo de documento inválido.');
        }
        $numeroDoc = self::soloDigitos($d['numeroDoc'] ?? '');
        if ($numeroDoc === '') {
            return ['tipoDoc' => $tipoDoc, 'numeroDoc' => ''];
        }
        $largo = self::LARGO_DOC[$tipoDoc] ?? 0;
        if ($largo && strlen($numeroDoc) !== $largo) {
            throw new ErrorDeNegocio('El '.strtoupper($tipoDoc).' debe tener '.$largo.' dígitos.');
        }
        $dup = Cliente::query()->where('tipo_doc', $tipoDoc)->where('numero_doc', $numeroDoc)
            ->when($excluirId, fn ($q) => $q->where('id', '!=', $excluirId))->first();
        if ($dup) {
            throw new ErrorDeNegocio('Ese documento ya está registrado en "'.$dup->nombre.'".');
        }

        return ['tipoDoc' => $tipoDoc, 'numeroDoc' => $numeroDoc];
    }

    private function valores(array $d, array $doc): array
    {
        $cond = $d['condicionIva'] ?? 'consumidor_final';
        if (! in_array($cond, CondicionIva::valores(), true)) {
            throw new ErrorDeNegocio('Condición frente al IVA inválida.');
        }
        $descuento = (float) ($d['descuento'] ?? 0);
        if ($descuento < 0 || $descuento > 100) {
            throw new ErrorDeNegocio('El descuento del cliente va de 0 a 100.');
        }

        return [
            'nombre' => trim($d['nombre']), 'nombre_fantasia' => trim($d['nombreFantasia'] ?? ''),
            'tipo_doc' => $doc['tipoDoc'], 'numero_doc' => $doc['numeroDoc'], 'condicion_iva' => $cond,
            'direccion' => trim($d['direccion'] ?? ''), 'localidad' => trim($d['localidad'] ?? ''),
            'telefono' => trim($d['telefono'] ?? ''), 'email' => trim($d['email'] ?? ''),
            'descuento' => $descuento,
            'vendedor_id' => $d['vendedorId'] ?? null, 'sucursal_id' => $d['sucursalId'] ?? null,
            'cta_cte_habilitada' => (bool) ($d['ctaCteHabilitada'] ?? false),
            'limite_credito' => max(0, (float) ($d['limiteCredito'] ?? 0)),
            'dias_plazo' => max(0, (int) ($d['diasPlazo'] ?? 0)),
            'observaciones' => trim($d['observaciones'] ?? ''),
        ];
    }

    private function guardarListas(int $clienteId, ?array $listas): void
    {
        if ($listas === null) {
            return;
        }
        DB::table('cliente_listas')->where('cliente_id', $clienteId)->delete();
        $ids = array_values(array_unique(array_filter(array_map('intval', $listas))));
        if ($ids) {
            $validas = DB::table('listas_venta')->whereIn('id', $ids)->pluck('id')->all();
            DB::table('cliente_listas')->insert(array_map(fn ($id) => ['cliente_id' => $clienteId, 'lista_id' => $id], $validas));
        }
    }

    public function crear(array $d, bool $puedeCredito): Cliente
    {
        if (trim($d['nombre'] ?? '') === '') {
            throw new ErrorDeNegocio('Ingresá el nombre o razón social.');
        }
        // Sin la llave, un alta con crédito ya cargado se rechaza con nombre y apellido.
        if (! $puedeCredito && (! empty($d['ctaCteHabilitada']) || (float) ($d['limiteCredito'] ?? 0) > 0 || (int) ($d['diasPlazo'] ?? 0) > 0)) {
            throw new AccessDeniedHttpException(self::SIN_LLAVE_CREDITO);
        }
        $doc = $this->validarDocumento($d);

        return DB::transaction(function () use ($d, $doc) {
            $c = Cliente::query()->create([...$this->valores($d, $doc), 'activo' => $d['activo'] ?? true]);
            $this->guardarListas($c->id, $d['listas'] ?? null);

            return $c;
        });
    }

    public function editar(int $id, array $d, bool $puedeCredito): Cliente
    {
        $actual = $this->get($id);
        if (trim($d['nombre'] ?? '') === '') {
            throw new ErrorDeNegocio('Ingresá el nombre o razón social.');
        }
        $doc = $this->validarDocumento($d, $id);
        $values = [...$this->valores($d, $doc), 'activo' => $d['activo'] ?? $actual->activo];

        /* Sin la llave, los tres campos del crédito se PRESERVAN; si el pedido
         * intenta cambiarlos, se rechaza fuerte. */
        if (! $puedeCredito) {
            $intenta = (array_key_exists('ctaCteHabilitada', $d) && (bool) $d['ctaCteHabilitada'] !== $actual->cta_cte_habilitada)
                || (array_key_exists('limiteCredito', $d) && (float) $d['limiteCredito'] !== (float) $actual->limite_credito)
                || (array_key_exists('diasPlazo', $d) && (int) $d['diasPlazo'] !== (int) $actual->dias_plazo);
            if ($intenta) {
                throw new AccessDeniedHttpException(self::SIN_LLAVE_CREDITO);
            }
            $values['cta_cte_habilitada'] = $actual->cta_cte_habilitada;
            $values['limite_credito'] = $actual->limite_credito;
            $values['dias_plazo'] = $actual->dias_plazo;
        }

        // El Consumidor Final es del sistema: no se le cambia lo fiscal ni se lo desactiva.
        if ($actual->es_consumidor_final) {
            $values['tipo_doc'] = $actual->tipo_doc;
            $values['numero_doc'] = $actual->numero_doc;
            $values['condicion_iva'] = $actual->condicion_iva;
            $values['activo'] = true;
        }

        return DB::transaction(function () use ($actual, $values, $d) {
            $actual->fill($values)->save();
            $this->guardarListas($actual->id, $d['listas'] ?? null);

            return $actual->refresh();
        });
    }

    /** Cuántos documentos referencian al cliente (define si se puede borrar). */
    private function usos(int $id): int
    {
        return DB::table('ventas')->where('cliente_id', $id)->count()
            + DB::table('cobranzas')->where('cliente_id', $id)->count()
            + DB::table('presupuestos')->where('cliente_id', $id)->count();
    }

    /** Baja: con historial se desactiva; sin historial se borra de verdad. */
    public function borrar(int $id): array
    {
        $c = $this->get($id);
        if ($c->es_consumidor_final) {
            throw new ErrorDeNegocio('El Consumidor Final no se puede eliminar.');
        }
        if ($this->usos($id) > 0) {
            $c->activo = false;
            $c->save();

            return ['ok' => true, 'desactivado' => true];
        }
        $c->delete();

        return ['ok' => true, 'desactivado' => false];
    }

    public function reactivar(int $id): Cliente
    {
        $c = $this->get($id);
        $c->activo = true;
        $c->save();

        return $c;
    }

    /** El crédito solo, sin tocar la ficha (atajo de la pestaña Cuenta corriente). */
    public function setCredito(int $id, array $d): Cliente
    {
        $c = $this->get($id);
        if ($c->es_consumidor_final) {
            throw new ErrorDeNegocio('El Consumidor Final no lleva cuenta corriente.');
        }
        $c->fill([
            'cta_cte_habilitada' => (bool) ($d['ctaCteHabilitada'] ?? false),
            'limite_credito' => max(0, (float) ($d['limiteCredito'] ?? 0)),
            'dias_plazo' => max(0, (int) ($d['diasPlazo'] ?? 0)),
        ])->save();

        return $c;
    }
}
