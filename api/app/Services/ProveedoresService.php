<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Proveedor;
use Illuminate\Support\Facades\DB;

class ProveedoresService
{
    public function __construct(private readonly AuditoriaService $audit) {}

    public function listar(?string $tipo = null): array
    {
        $cargados = DB::table('producto_proveedores')->selectRaw('proveedor_id, COUNT(*) n')->groupBy('proveedor_id')->pluck('n', 'proveedor_id');

        return Proveedor::query()
            ->when($tipo === 'mercaderia', fn ($q) => $q->where('provee_mercaderia', true))
            ->when($tipo === 'gastos', fn ($q) => $q->where('provee_gastos', true))
            ->orderBy('nombre')->get()
            ->map(fn (Proveedor $p) => [...$this->publica($p), 'productosCargados' => (int) ($cargados[$p->id] ?? 0)])
            ->all();
    }

    public function publica(Proveedor $p): array
    {
        return [
            'id' => $p->id, 'nombre' => $p->nombre, 'cuit' => $p->cuit, 'condicionIva' => $p->condicion_iva?->value,
            'direccion' => $p->direccion, 'telefono' => $p->telefono, 'email' => $p->email,
            'proveeMercaderia' => $p->provee_mercaderia, 'proveeGastos' => $p->provee_gastos, 'letraGasto' => $p->letra_gasto?->value,
            'condicionCompra' => $p->condicion_compra?->value, 'porcSinFactura' => (float) $p->porc_sin_factura,
            'medioHabitual' => $p->medio_habitual?->value, 'diasPago' => $p->dias_pago, 'modoCuenta' => $p->modo_cuenta?->value,
            'conciliadoHasta' => $p->conciliado_hasta?->toIso8601String(), 'productosEsperados' => $p->productos_esperados,
            'migracionLista' => $p->migracion_lista,
        ];
    }

    public function crear(array $d): Proveedor
    {
        return Proveedor::query()->create([
            'nombre' => trim($d['nombre']), 'cuit' => trim((string) ($d['cuit'] ?? '')),
            'condicion_iva' => $d['condicionIva'] ?? 'responsable_inscripto',
            'direccion' => trim((string) ($d['direccion'] ?? '')), 'telefono' => trim((string) ($d['telefono'] ?? '')), 'email' => trim((string) ($d['email'] ?? '')),
            'provee_mercaderia' => $d['proveeMercaderia'] ?? true, 'provee_gastos' => $d['proveeGastos'] ?? false,
            'letra_gasto' => ($d['letraGasto'] ?? '') ?: null, 'condicion_compra' => $d['condicionCompra'] ?? 'factura',
            'medio_habitual' => ($d['medioHabitual'] ?? '') ?: null, 'dias_pago' => ($d['diasPago'] ?? null) ?: null,
            'modo_cuenta' => $d['modoCuenta'] ?? 'facturas',
            'porc_sin_factura' => $d['porcSinFactura'] ?? (($d['condicionCompra'] ?? '') === 'liquidacion' ? 100 : 0),
        ]);
    }

    public function editar(Proveedor $p, array $d, ?int $usuarioId = null): Proveedor
    {
        $antes = $this->fotoFicha($p);
        $p->fill([
            'nombre' => trim($d['nombre']),
            'cuit' => array_key_exists('cuit', $d) ? trim((string) $d['cuit']) : $p->cuit,
            'condicion_iva' => $d['condicionIva'] ?? $p->condicion_iva,
            'direccion' => array_key_exists('direccion', $d) ? trim((string) $d['direccion']) : $p->direccion,
            'telefono' => array_key_exists('telefono', $d) ? trim((string) $d['telefono']) : $p->telefono,
            'email' => array_key_exists('email', $d) ? trim((string) $d['email']) : $p->email,
            'provee_mercaderia' => $d['proveeMercaderia'] ?? $p->provee_mercaderia,
            'provee_gastos' => $d['proveeGastos'] ?? $p->provee_gastos,
            'letra_gasto' => array_key_exists('letraGasto', $d) ? ($d['letraGasto'] ?: null) : $p->letra_gasto,
            'condicion_compra' => $d['condicionCompra'] ?? $p->condicion_compra,
            'medio_habitual' => array_key_exists('medioHabitual', $d) ? ($d['medioHabitual'] ?: null) : $p->medio_habitual,
            'dias_pago' => array_key_exists('diasPago', $d) ? ($d['diasPago'] ?: null) : $p->dias_pago,
            'modo_cuenta' => $d['modoCuenta'] ?? $p->modo_cuenta,
            'porc_sin_factura' => $d['porcSinFactura'] ?? $p->porc_sin_factura,
        ])->save();
        $p->refresh();
        $this->audit->registrar($this->audit->diferencias(
            ['entidad' => 'proveedor', 'entidadId' => $p->id, 'ambito' => 'Ficha del proveedor', 'usuarioId' => $usuarioId],
            $antes, $this->fotoFicha($p),
            ['nombre' => 'Nombre', 'cuit' => 'CUIT', 'condicionCompra' => 'Condición de compra', 'medioHabitual' => 'Medio de pago habitual',
                'diasPago' => 'Plazo de pago', 'modoCuenta' => 'Modo de cuenta', 'porcSinFactura' => 'Sin factura % (default de sus formatos)'],
        ));

        return $p;
    }

    private function fotoFicha(Proveedor $p): array
    {
        return [
            'nombre' => $p->nombre, 'cuit' => $p->cuit, 'condicionCompra' => $p->condicion_compra?->value ?? '',
            'medioHabitual' => $p->medio_habitual?->value ?? '', 'diasPago' => (string) ($p->dias_pago ?? ''),
            'modoCuenta' => $p->modo_cuenta?->value ?? '', 'porcSinFactura' => (string) (float) $p->porc_sin_factura,
        ];
    }

    public function borrar(Proveedor $p): void
    {
        $p->delete();
    }

    /* ---------------- Percepciones y cuentas (F3) ---------------- */

    /** Las percepciones que cobra en el pie de su factura; al cargar el papel se ofrecen tildadas o no. */
    public function percepciones(int $proveedorId): array
    {
        return DB::table('proveedor_percepciones')->where('proveedor_id', $proveedorId)->orderBy('id')->get()
            ->map(fn ($p) => ['id' => $p->id, 'nombre' => $p->nombre, 'alicuota' => (float) $p->alicuota, 'base' => $p->base, 'activa' => (bool) $p->activa])->all();
    }

    /** Reemplaza la lista entera (es la ficha, no historia). */
    public function setPercepciones(Proveedor $p, array $lista, ?int $usuarioId = null): array
    {
        $antes = collect($this->percepciones($p->id))->map(fn ($x) => $x['nombre'].' '.$x['alicuota'].'% s/'.$x['base'].($x['activa'] ? '' : ' (inactiva)'))->implode(', ');
        $filas = [];
        foreach ($lista as $x) {
            $nombre = trim((string) ($x['nombre'] ?? ''));
            if ($nombre === '') {
                continue;
            }
            $alic = (float) ($x['alicuota'] ?? 0);
            if ($alic < 0 || $alic > 100) {
                throw new ErrorDeNegocio('La alícuota de "'.$nombre.'" tiene que estar entre 0 y 100.');
            }
            $filas[] = ['proveedor_id' => $p->id, 'nombre' => mb_substr($nombre, 0, 120), 'alicuota' => $alic, 'base' => ($x['base'] ?? 'neto') === 'total' ? 'total' : 'neto', 'activa' => ($x['activa'] ?? true) !== false];
        }
        DB::transaction(function () use ($p, $filas) {
            DB::table('proveedor_percepciones')->where('proveedor_id', $p->id)->delete();
            if ($filas) {
                DB::table('proveedor_percepciones')->insert($filas);
            }
        });
        $despues = collect($this->percepciones($p->id))->map(fn ($x) => $x['nombre'].' '.$x['alicuota'].'% s/'.$x['base'].($x['activa'] ? '' : ' (inactiva)'))->implode(', ');
        $this->audit->registrar($this->audit->diferencias(['entidad' => 'proveedor', 'entidadId' => $p->id, 'ambito' => 'Percepciones', 'usuarioId' => $usuarioId],
            ['percepciones' => $antes], ['percepciones' => $despues], ['percepciones' => 'Percepciones']));

        return $this->percepciones($p->id);
    }

    public function cuentas(int $proveedorId): array
    {
        return DB::table('proveedor_cuentas')->where('proveedor_id', $proveedorId)->orderBy('id')->get()
            ->map(fn ($c) => ['id' => $c->id, 'cbuAlias' => $c->cbu_alias, 'descripcion' => $c->descripcion])->all();
    }

    public function setCuentas(Proveedor $p, array $lista): array
    {
        $filas = [];
        foreach ($lista as $x) {
            $cbu = trim((string) ($x['cbuAlias'] ?? ''));
            if ($cbu === '') {
                continue;
            }
            $filas[] = ['proveedor_id' => $p->id, 'cbu_alias' => mb_substr($cbu, 0, 120), 'descripcion' => mb_substr(trim((string) ($x['descripcion'] ?? '')), 0, 120)];
        }
        DB::transaction(function () use ($p, $filas) {
            DB::table('proveedor_cuentas')->where('proveedor_id', $p->id)->delete();
            if ($filas) {
                DB::table('proveedor_cuentas')->insert($filas);
            }
        });

        return $this->cuentas($p->id);
    }
}
