<?php

namespace App\Services;

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
}
