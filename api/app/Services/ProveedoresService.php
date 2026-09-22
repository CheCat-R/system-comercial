<?php

namespace App\Services;

use App\Enums\CondicionCompra;
use App\Enums\MedioHabitual;
use App\Exceptions\ErrorDeNegocio;
use App\Models\Proveedor;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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

    /* ---------------- Migración del padrón viejo ---------------- */

    /** El tilde manual de "terminé de migrar este proveedor". */
    public function setMigracionLista(Proveedor $p, bool $lista): Proveedor
    {
        $p->update(['migracion_lista' => $lista]);

        return $p;
    }

    private static function normalizarNombre(string $v): string
    {
        $sinAcentos = Str::ascii($v);

        return trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower($sinAcentos)));
    }

    private static function soloDigitos(mixed $v): string
    {
        return preg_replace('/\D/', '', (string) $v) ?? '';
    }

    /**
     * El padrón entero del sistema viejo en una pasada, para la migración. Cada
     * fila se re-resuelve contra la base (el navegador pudo quedar viejo entre
     * la vista previa y el confirmar):
     *   - por CUIT (si trae uno válido de 11 dígitos) o por nombre normalizado:
     *     si YA EXISTE, se COMPLETA (solo campos vacíos, nunca pisa lo cargado
     *     a mano) — así es idempotente: correr dos veces el mismo archivo no
     *     rompe nada.
     *   - la fila puede traer `proveedorId` (el emparejamiento MANUAL de un
     *     dudoso en la vista previa) y ese gana.
     *   - lo que no existe se CREA.
     *
     * La mitad CONTABLE del archivo (saldos, facturado, vencimientos) NO entra
     * a propósito: el saldo nace de los comprobantes, y un número suelto
     * importado hoy queda viejo mañana.
     */
    public function importar(array $filas, ?int $usuarioId = null): array
    {
        if (! $filas) {
            throw new ErrorDeNegocio('No hay nada para importar.');
        }

        $condiciones = CondicionCompra::valores();
        $medios = MedioHabitual::valores();

        $todos = Proveedor::query()->get();
        $porCuit = $todos->filter(fn (Proveedor $p) => strlen(self::soloDigitos($p->cuit)) === 11)
            ->keyBy(fn (Proveedor $p) => self::soloDigitos($p->cuit));
        $porNombre = $todos->keyBy(fn (Proveedor $p) => self::normalizarNombre($p->nombre));
        $porId = $todos->keyBy('id');

        $creados = [];
        $completados = [];
        $saltados = [];

        DB::transaction(function () use ($filas, $condiciones, $medios, &$porCuit, &$porNombre, $porId, &$creados, &$completados, &$saltados) {
            foreach ($filas as $f) {
                $nombre = trim((string) ($f['nombre'] ?? ''));
                if ($nombre === '') {
                    $saltados[] = ['nombre' => '(sin nombre)', 'motivo' => 'fila sin nombre'];

                    continue;
                }

                $cuit = self::soloDigitos($f['cuit'] ?? '');
                $cuitValido = strlen($cuit) === 11 ? $cuit : '';
                $condicion = in_array($f['condicionCompra'] ?? '', $condiciones, true) ? $f['condicionCompra'] : 'factura';
                $medio = in_array($f['medioHabitual'] ?? '', $medios, true) ? $f['medioHabitual'] : null;
                $dias = ((float) ($f['diasPago'] ?? 0)) > 0 ? min(365, (int) round((float) $f['diasPago'])) : null;
                $modo = ($f['modoCuenta'] ?? '') === 'libre' ? 'libre' : 'facturas';
                $sinFactura = min(100, max(0, (float) ($f['porcSinFactura'] ?? 0)));
                $esperados = max(0, (int) round((float) ($f['productosEsperados'] ?? 0)));
                $cuentas = collect($f['cuentas'] ?? [])
                    ->map(fn ($c) => [
                        'cbuAlias' => mb_substr(trim((string) ($c['cbuAlias'] ?? '')), 0, 120),
                        'descripcion' => mb_substr(trim((string) ($c['descripcion'] ?? '')), 0, 100),
                    ])
                    ->filter(fn ($c) => $c['cbuAlias'] !== '')
                    ->values();

                // A quién le toca: el emparejado a mano gana; después el CUIT; después el nombre.
                $existente = (! empty($f['proveedorId']) ? $porId->get((int) $f['proveedorId']) : null)
                    ?? ($cuitValido !== '' ? $porCuit->get($cuitValido) : null)
                    ?? $porNombre->get(self::normalizarNombre($nombre));

                if ($existente) {
                    /* COMPLETAR: solo lo vacío. Los defaults del sistema (condición
                     * "factura", modo "por facturas") se consideran "sin cargar" —
                     * la ficha tocada a mano no se pisa nunca. */
                    $existente->update([
                        'cuit' => trim((string) $existente->cuit) !== '' ? $existente->cuit : trim((string) ($f['cuit'] ?? '')),
                        'email' => trim((string) $existente->email) !== '' ? $existente->email : trim((string) ($f['email'] ?? '')),
                        'telefono' => trim((string) $existente->telefono) !== '' ? $existente->telefono : trim((string) ($f['telefono'] ?? '')),
                        'condicion_compra' => $existente->condicion_compra?->value === 'factura' ? $condicion : $existente->condicion_compra,
                        'medio_habitual' => $existente->medio_habitual ?? $medio,
                        'dias_pago' => $existente->dias_pago ?? $dias,
                        'modo_cuenta' => $existente->modo_cuenta?->value === 'facturas' ? $modo : $existente->modo_cuenta,
                        'porc_sin_factura' => (float) $existente->porc_sin_factura > 0 ? $existente->porc_sin_factura : $sinFactura,
                        'provee_mercaderia' => $existente->provee_mercaderia || ($f['proveeMercaderia'] ?? null) !== false,
                        'provee_gastos' => $existente->provee_gastos || ($f['proveeGastos'] ?? false) === true,
                        // La referencia de migración SÍ se pisa siempre: es meta del archivo, no un dato cargado a mano.
                        'productos_esperados' => $esperados ?: $existente->productos_esperados,
                    ]);

                    if ($cuentas->isNotEmpty()) {
                        $actuales = DB::table('proveedor_cuentas')->where('proveedor_id', $existente->id)->get();
                        $yaTiene = $actuales->pluck('cbu_alias')->map(fn ($c) => trim($c))->flip();
                        $nuevas = $cuentas->reject(fn ($c) => $yaTiene->has($c['cbuAlias']))
                            ->take(max(0, 5 - $actuales->count()))
                            ->map(fn ($c) => ['proveedor_id' => $existente->id, 'cbu_alias' => $c['cbuAlias'], 'descripcion' => $c['descripcion']]);
                        if ($nuevas->isNotEmpty()) {
                            DB::table('proveedor_cuentas')->insert($nuevas->all());
                        }
                    }
                    $completados[] = $nombre;

                    continue;
                }

                $p = Proveedor::query()->create([
                    'nombre' => $nombre,
                    'cuit' => trim((string) ($f['cuit'] ?? '')),
                    'email' => trim((string) ($f['email'] ?? '')),
                    'telefono' => trim((string) ($f['telefono'] ?? '')),
                    'provee_mercaderia' => ($f['proveeMercaderia'] ?? null) !== false,
                    'provee_gastos' => ($f['proveeGastos'] ?? false) === true,
                    'condicion_compra' => $condicion,
                    'medio_habitual' => $medio,
                    'dias_pago' => $dias,
                    'modo_cuenta' => $modo,
                    'porc_sin_factura' => $sinFactura ?: ($condicion === 'liquidacion' ? 100 : 0),
                    'productos_esperados' => $esperados,
                ]);
                if ($cuentas->isNotEmpty()) {
                    DB::table('proveedor_cuentas')->insert(
                        $cuentas->take(5)->map(fn ($c) => ['proveedor_id' => $p->id, 'cbu_alias' => $c['cbuAlias'], 'descripcion' => $c['descripcion']])->all()
                    );
                }
                // Las filas siguientes del MISMO archivo también lo tienen que ver:
                // una razón social repetida en el archivo completa, no duplica.
                $porNombre->put(self::normalizarNombre($nombre), $p);
                if ($cuitValido !== '') {
                    $porCuit->put($cuitValido, $p);
                }
                $creados[] = $nombre;
            }
        });

        /* Un solo registro de auditoría por corrida: 170 filas de "se creó X"
         * taparían cualquier otro cambio del registro. */
        $this->audit->registrar([[
            'entidad' => 'proveedor', 'entidadId' => 0, 'ambito' => 'Importación del padrón',
            'campo' => 'Importar proveedores', 'usuarioId' => $usuarioId,
            'despues' => count($creados).' creados · '.count($completados).' completados · '.count($saltados).' saltados',
        ]]);

        return ['ok' => true, 'creados' => $creados, 'completados' => $completados, 'saltados' => $saltados];
    }
}
