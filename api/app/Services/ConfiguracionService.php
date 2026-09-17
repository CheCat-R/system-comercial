<?php

namespace App\Services;

use App\Models\Configuracion;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Un JSON por área con catálogo de defaults en código: lo que no está en el
 * catálogo se descarta al guardar, y lo que falta se completa. El `set` es un
 * merge parcial validado (reglas de rango/opciones por campo).
 */
class ConfiguracionService
{
    public const DEFAULTS = [
        'ventas' => [
            'puntoVenta' => '0001',
            // Mientras esté en false, la venta se confirma sin pedir CAE.
            'arcaHabilitado' => false,
            // Condición fiscal PROPIA: junto con la del cliente define la letra (A/B/C).
            'condicionIvaEmpresa' => 'responsable_inscripto',
            'listaBaseId' => 0,
            'montoMinimoMayorista' => 0,
            'modalidadMontoId' => 0,
            'montoMinimoCamioneta' => 80000,
            'mediosPagoMonto' => [],
            'overrideListaRequiereAdmin' => true,
            'descuentoMaxVendedor' => 10,
            'redondeoEfectivo' => 0,
            // Redondeo del precio de góndola: 0 = sin; 1 = al entero; 10/50/100 = a esa unidad.
            'redondeoPrecio' => 1,
            'ctaCteHabilitada' => true,
            'ctaCteLimiteDefault' => 0,
            'ctaCteDiasPlazo' => 30,
            'ctaCteBloquearSuperado' => true,
            'presupuestoValidezDias' => 7,
            'presupuestoReservaStock' => true,
            'cajaObligatoria' => true,
            'permitirStockNegativo' => false,
            'mediosPago' => ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'qr'],
            'mediosFacturar' => [],
            'lectorHabilitado' => true,
            'lectorSufijoEnter' => true,
            'balanzaHabilitada' => false,
            'balanzaPrefijo' => '20',
            'balanzaModo' => 'peso',
        ],
        'empresa' => [
            'nombre' => 'CheCAT',
            'razonSocial' => '',
            'cuit' => '',
            'direccion' => '',
            'telefono' => '',
            'logo' => '',
            'colorMarca' => '#4f46e5',
        ],
        'impresion' => [
            'ticketPos' => 'rollo80',
            'presupuesto' => 'a4',
            'hojaArmado' => 'a4',
            'listaPreparacion' => 'a4',
            'facturaVenta' => 'rollo80',
            'planillaConteo' => 'a4',
            'remitoTransferencia' => 'a4',
            'valeMovimiento' => 'rollo80',
            'comprobanteGasto' => 'a4',
            'ordenPago' => 'a4',
            'etiquetaFraccionado' => 'etiqueta50x30',
            'etiquetaGondola' => 'etiqueta64x32',
            'plantillaCartel' => '',
            'plantillaFraccionado' => '',
            'imprimirTicketAlCobrar' => true,
            'pieTicket' => '¡Gracias por su compra!',
            'leyendaNoFiscal' => true,
        ],
        'web' => [
            'whatsapp' => '',
            'contactoTelefono' => '',
            'contactoEmail' => '',
            'contactoUbicacion' => '',
            'redInstagram' => '',
            'redFacebook' => '',
            'slides' => [],
        ],
    ];

    private const FORMATOS_PAPEL = ['rollo80', 'rollo58', 'a4', 'carta'];

    private const FORMATOS_ETIQUETA = [
        'etiqueta50x30', 'etiqueta50x25', 'etiqueta40x25', 'etiqueta60x40',
        'etiqueta64x32', 'etiqueta80x50', 'etiqueta100x50', 'etiqueta100x60',
    ];

    /** Los redondeos son una LISTA CERRADA: son las monedas con las que se puede dar vuelto. */
    private const REGLAS = [
        'impresion.ticketPos' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.presupuesto' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.hojaArmado' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.listaPreparacion' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.planillaConteo' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.facturaVenta' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.remitoTransferencia' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.valeMovimiento' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.comprobanteGasto' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.ordenPago' => ['opciones' => self::FORMATOS_PAPEL],
        'impresion.etiquetaFraccionado' => ['opciones' => self::FORMATOS_ETIQUETA],
        'impresion.etiquetaGondola' => ['opciones' => self::FORMATOS_ETIQUETA],
        'ventas.redondeoPrecio' => ['valores' => [0, 1, 10, 50, 100]],
        'ventas.redondeoEfectivo' => ['valores' => [0, 1, 10, 50, 100]],
        'ventas.presupuestoValidezDias' => ['min' => 1, 'max' => 365, 'entero' => true],
        'ventas.descuentoMaxVendedor' => ['min' => 0, 'max' => 100],
        'ventas.ctaCteDiasPlazo' => ['min' => 0, 'max' => 365, 'entero' => true],
        'ventas.ctaCteLimiteDefault' => ['min' => 0, 'max' => 100000000],
        'ventas.montoMinimoMayorista' => ['min' => 0, 'max' => 100000000],
        'ventas.montoMinimoCamioneta' => ['min' => 0, 'max' => 100000000],
        'ventas.listaBaseId' => ['min' => 0, 'max' => 1000000, 'entero' => true],
        'ventas.modalidadMontoId' => ['min' => 0, 'max' => 1000000, 'entero' => true],
        'ventas.puntoVenta' => ['texto' => 'puntoVenta'],
        'empresa.cuit' => ['texto' => 'cuit'],
        'empresa.colorMarca' => ['texto' => 'color'],
        'ventas.balanzaModo' => ['opciones' => ['peso', 'importe']],
    ];

    /** @var array<string, array> cache por request */
    private array $cache = [];

    public static function claves(): array
    {
        return array_keys(self::DEFAULTS);
    }

    private function defaultsDe(string $clave): array
    {
        if (! array_key_exists($clave, self::DEFAULTS)) {
            throw new NotFoundHttpException('No existe la configuración "'.$clave.'".');
        }

        return self::DEFAULTS[$clave];
    }

    public function get(string $clave): array
    {
        if (isset($this->cache[$clave])) {
            return $this->cache[$clave];
        }
        $defaults = $this->defaultsDe($clave);
        $fila = Configuracion::query()->where('clave', $clave)->first();

        return $this->cache[$clave] = $this->sanitize($defaults, $fila?->valor, $clave);
    }

    public function set(string $clave, mixed $patch): array
    {
        $defaults = $this->defaultsDe($clave);
        $actual = $this->get($clave);
        $valor = $this->sanitize($defaults, [...$actual, ...(is_array($patch) ? $patch : [])], $clave);
        Configuracion::query()->updateOrCreate(['clave' => $clave], ['valor' => $valor]);

        return $this->cache[$clave] = $valor;
    }

    public function olvidarCache(): void
    {
        $this->cache = [];
    }

    /* ---------------- Saneamiento ---------------- */

    private function sanitize(array $defaults, mixed $raw, string $clave): array
    {
        $src = is_array($raw) ? $raw : [];
        $out = [];
        foreach ($defaults as $k => $def) {
            $v = $src[$k] ?? null;
            if (is_array($def)) {
                $template = $def[0] ?? null;
                if (is_array($template)) {
                    $out[$k] = is_array($v)
                        ? array_values(array_filter(array_map(fn ($x) => $this->sanitizeItem($template, $x), $v)))
                        : $def;
                } else {
                    $out[$k] = is_array($v)
                        ? array_values(array_filter(array_map(fn ($x) => trim((string) $x), $v), fn ($s) => $s !== ''))
                        : $def;
                }
                $out[$k] = $this->aplicarRegla($clave, $k, $out[$k], $def);
            } elseif (is_bool($def)) {
                $out[$k] = $this->aplicarRegla($clave, $k, is_bool($v) ? $v : $def, $def);
            } elseif (is_int($def) || is_float($def)) {
                $n = is_numeric($v) ? $v + 0 : $def;
                $out[$k] = $this->aplicarRegla($clave, $k, $n, $def);
            } else {
                $s = is_string($v) && trim($v) !== '' ? trim($v) : $def;
                $out[$k] = $this->aplicarRegla($clave, $k, $s, $def);
            }
        }

        return $out;
    }

    private function sanitizeItem(array $template, mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        $out = [];
        foreach ($template as $k => $def) {
            $v = $raw[$k] ?? null;
            if (is_int($def) || is_float($def)) {
                $out[$k] = is_numeric($v) ? $v + 0 : 0;
            } elseif (is_bool($def)) {
                $out[$k] = is_bool($v) ? $v : false;
            } else {
                $out[$k] = is_string($v) ? trim($v) : '';
            }
        }

        return $out;
    }

    private function aplicarRegla(string $clave, string $campo, mixed $valor, mixed $porDefecto): mixed
    {
        $r = self::REGLAS[$clave.'.'.$campo] ?? null;
        if (! $r) {
            return $valor;
        }
        if (isset($r['opciones'])) {
            $s = (string) $valor;

            return in_array($s, $r['opciones'], true) ? $s : $porDefecto;
        }
        if (isset($r['texto'])) {
            return match ($r['texto']) {
                'puntoVenta' => \App\Models\Sucursal::normalizarPuntoVenta($valor) ?: $porDefecto,
                'cuit' => preg_replace('/\D/', '', (string) $valor),
                'color' => preg_match('/^#[0-9a-fA-F]{6}$/', (string) $valor) ? strtolower((string) $valor) : $porDefecto,
                default => (string) $valor,
            };
        }
        if (! is_numeric($valor)) {
            return $porDefecto;
        }
        $n = $valor + 0;
        if (isset($r['valores'])) {
            return in_array($n, $r['valores']) ? $n : $porDefecto;
        }
        if (! empty($r['entero'])) {
            $n = (int) round($n);
        }
        if (isset($r['min'])) {
            $n = max($r['min'], $n);
        }
        if (isset($r['max'])) {
            $n = min($r['max'], $n);
        }

        return $n;
    }
}
