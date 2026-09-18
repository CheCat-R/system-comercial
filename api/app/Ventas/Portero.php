<?php

namespace App\Ventas;

use App\Exceptions\ErrorDeNegocio;
use App\Precios\CostoEntry;
use App\Precios\FilaVenta;
use App\Precios\OpcionesPrecio;
use App\Precios\Pricing;
use App\Services\ListasService;
use App\Services\OfertasService;
use Illuminate\Support\Facades\DB;

/**
 * EL PORTERO DEL RENGLÓN — corre ANTES de la aritmética, y es el que decide.
 *
 * Tres cosas NO son del cliente HTTP: el IVA (sale del producto), el PRECIO
 * (se recalcula contra la fila de `producto_listas` con el mismo helper que la
 * ficha) y la LISTA (tiene que estar habilitada por una de las puertas del
 * motor: cliente, unidades del producto, regla de marca, monto del ticket,
 * presupuesto cotizado). El permiso `precio_manual` levanta precio, lista y
 * tope de descuento. Las ofertas no se recalculan: se ACOTAN por mecánica.
 */
class Portero
{
    public function __construct(private readonly ListasService $listas, private readonly OfertasService $ofertas) {}

    /** El precio de una oferta se carga CON IVA; las cuentas van en neto. */
    public static function netoDe(float $precioFinal, float $iva): float
    {
        return $precioFinal / (1 + $iva / 100);
    }

    /** ¿Esta oferta alcanza a este renglón? Espejo del motor del POS. */
    public static function ofertaAlcanza(array $o, array $r): bool
    {
        if (($o['tipo'] ?? '') === 'combo') {
            return collect($o['componentes'] ?? [])->contains(fn ($c) => (int) $c['productoId'] === (int) $r['productoId']);
        }
        $esPaquete = ! empty($r['presentacionId']);
        foreach ($o['alcances'] ?? [] as $a) {
            $ref = (int) $a['refId'];
            if ($a['tipo'] === 'presentacion') {
                if ($esPaquete && (int) $r['presentacionId'] === $ref) {
                    return true;
                }
                continue;
            }
            if ($esPaquete && empty($o['incluyeFraccionados'])) {
                continue;
            }
            $ok = match ($a['tipo']) {
                'producto' => (int) $r['productoId'] === $ref,
                'marca' => (int) ($r['marcaId'] ?? 0) === $ref,
                'categoria' => (int) ($r['categoriaId'] ?? 0) === $ref,
                'etiqueta' => in_array($ref, $r['etiquetas'] ?? [], true),
                default => false,
            };
            if ($ok) {
                return true;
            }
        }

        return false;
    }

    /** Lo MÁXIMO que esta mecánica puede descontar en un renglón. null = no se puede acotar (combo, ticket). */
    public static function techoDeOferta(array $o, float $cantidad, float $precioUnitario, float $descuento, float $iva): ?float
    {
        $c = $cantidad;
        $p = $precioUnitario * (1 - $descuento / 100);
        $lleva = (float) ($o['lleva'] ?? 0);
        $paga = (float) ($o['paga'] ?? 0);
        $porc = (float) ($o['porcentaje'] ?? 0);
        switch ($o['tipo']) {
            case 'porcentaje':
                return Pricing::money($c * $p * $porc / 100);
            case 'segunda_unidad':
                return Pricing::money(floor($c / 2) * $p * $porc / 100);
            case 'nxm':
                if ($lleva < 2 || $paga < 1 || $paga >= $lleva) {
                    return 0.0;
                }

                return Pricing::money(floor($c / $lleva) * ($lleva - $paga) * $p);
            case 'precio_fijo':
                $pf = self::netoDe((float) ($o['precio'] ?? 0), $iva);

                return $pf >= $p ? 0.0 : Pricing::money($c * ($p - $pf));
            case 'pack':
                if ($lleva < 2) {
                    return 0.0;
                }
                $ahorro = $lleva * $p - self::netoDe((float) ($o['precio'] ?? 0), $iva);

                return $ahorro <= 0 ? 0.0 : Pricing::money(floor($c / $lleva) * $ahorro);
            default:
                return null;
        }
    }

    /**
     * Los precios que la casa ya prometió por escrito. Mapa vacío salvo que la
     * venta declare un presupuesto que exista, sea DE ESTE CLIENTE, esté
     * confirmado y no esté vencido. Cliente y sucursal cortan; estado y
     * vencimiento solo dejan de heredar el precio.
     */
    public function congeladosDePresupuesto(?int $presupuestoId, int $clienteId, ?int $sucursalId): array
    {
        if (! $presupuestoId) {
            return [];
        }
        $pre = DB::table('presupuestos')->find($presupuestoId);
        if (! $pre) {
            throw new ErrorDeNegocio('El presupuesto que se quiere cerrar no existe.');
        }
        if ((int) $pre->cliente_id !== $clienteId) {
            throw new ErrorDeNegocio('Ese presupuesto es de otro cliente.');
        }
        if ($sucursalId !== null && (int) $pre->sucursal_id !== $sucursalId) {
            throw new ErrorDeNegocio('Ese presupuesto se cotizó en otra sucursal: tiene la mercadería reservada allá.');
        }
        if ($pre->estado !== 'confirmado') {
            return [];
        }
        if ($pre->vencimiento && strtotime($pre->vencimiento) < time()) {
            return [];
        }
        $out = [];
        foreach (DB::table('presupuesto_items')->where('presupuesto_id', $pre->id)->get() as $r) {
            $out[$r->producto_id.':'.($r->presentacion_id ?? '')] = ['precioLista' => Pricing::money((float) $r->precio_lista), 'listaId' => $r->lista_id ? (int) $r->lista_id : null];
        }

        return $out;
    }

    /**
     * DE IDS A DESCUENTOS REALES. Cinco candados: existe y activo, vigente, la
     * sucursal sale de la sesión, el permiso (los que piden admin), uno por
     * lista. `yaAplicados`: el permiso se pide para APLICAR, no para convivir.
     *
     * @return array<int, array> por listaId
     */
    public function resolverDescuentos(array $ids, ?int $sucursalId, bool $puedeAdmin, array $yaAplicados = []): array
    {
        $unicos = array_values(array_unique(array_filter(array_map('intval', $ids), fn ($n) => $n > 0)));
        if (! $unicos) {
            return [];
        }
        $filas = DB::table('descuentos')->whereIn('id', $unicos)->get()->keyBy('id');
        $porLista = [];
        foreach ($unicos as $id) {
            $d = $filas->get($id);
            if (! $d) {
                throw new ErrorDeNegocio('Uno de los descuentos aplicados ya no existe. Quitalo y volvé a intentar.');
            }
            if (! $d->activo) {
                throw new ErrorDeNegocio('El descuento "'.$d->nombre.'" está desactivado.');
            }
            if ($d->vence && strtotime($d->vence) < time()) {
                throw new ErrorDeNegocio('El descuento "'.$d->nombre.'" venció.');
            }
            if ($d->sucursal_id !== null && (int) $d->sucursal_id !== $sucursalId) {
                throw new ErrorDeNegocio('El descuento "'.$d->nombre.'" no es de esta sucursal.');
            }
            if ($d->requiere_admin && ! $puedeAdmin && ! in_array($id, $yaAplicados, true)) {
                throw new ErrorDeNegocio('El descuento "'.$d->nombre.'" lo tiene que aplicar un administrador.');
            }
            if (isset($porLista[$d->lista_id])) {
                throw new ErrorDeNegocio('"'.$porLista[$d->lista_id]['nombre'].'" y "'.$d->nombre.'" son de la misma lista de precios: solo se puede aplicar uno.');
            }
            $porLista[(int) $d->lista_id] = ['id' => (int) $d->id, 'nombre' => $d->nombre, 'porcentaje' => (float) $d->porcentaje, 'listaId' => (int) $d->lista_id, 'medioPago' => $d->medio_pago];
        }

        return $porLista;
    }

    /**
     * Resuelve cada renglón contra el catálogo real. Devuelve renglones con
     * iva, precio, lista, origen, oferta acotada, descuento nombrado y costo
     * congelado.
     */
    public function resolverRenglones(array $items, int $clienteId, array $config, bool $puedePisarPrecio, array $congelados = [], array $descuentosPorLista = []): array
    {
        if (! $items) {
            return [];
        }
        $ids = array_values(array_unique(array_map(fn ($it) => (int) $it['productoId'], $items)));
        $prods = DB::table('productos')->whereIn('id', $ids)->get()->keyBy('id');
        $press = DB::table('presentaciones')->whereIn('producto_id', $ids)->get()->keyBy('id');
        $provs = DB::table('producto_proveedores')->whereIn('producto_id', $ids)->get()->groupBy('producto_id');
        $filas = DB::table('producto_listas')->whereIn('producto_id', $ids)->get();
        $cat = $this->listas->catalogo();
        $delCliente = DB::table('cliente_listas')->where('cliente_id', $clienteId)->pluck('lista_id')->map(fn ($x) => (int) $x)->all();
        $etiqs = DB::table('producto_etiquetas')->whereIn('producto_id', $ids)->get()->groupBy('producto_id');

        $redondeo = (float) ($config['redondeoPrecio'] ?? 0);
        $activas = array_values(array_filter($cat['listas'], fn ($l) => $l['activa']));
        $listaDe = collect($activas)->keyBy('id');
        $baseId = collect($activas)->firstWhere('id', (int) ($config['listaBaseId'] ?? 0))['id'] ?? ($activas[0]['id'] ?? null);

        // Agregados del ticket: unidades por producto y por marca (cantidades, no precios).
        $porProducto = [];
        $porMarca = [];
        foreach ($items as $it) {
            $c = (float) ($it['cantidad'] ?? 0);
            if ($c <= 0) {
                continue;
            }
            $pid = (int) $it['productoId'];
            $porProducto[$pid] = ($porProducto[$pid] ?? 0) + $c;
            $marcaId = $prods->get($pid)?->marca_id;
            if ($marcaId) {
                $porMarca[$marcaId] = ($porMarca[$marcaId] ?? 0) + $c;
            }
        }
        $modalidadesDeMarca = [];
        foreach ($cat['reglasMarca'] as $r) {
            $min = (float) $r['unidadesMinimas'];
            if (! $r['activa'] || $min <= 0 || ($porMarca[$r['marcaId']] ?? 0) + 1e-9 < $min) {
                continue;
            }
            $modalidadesDeMarca[$r['marcaId']][$r['modalidadId']] = true;
        }
        $brutoTicket = array_sum(array_map(fn ($it) => (float) ($it['cantidad'] ?? 0) * (float) ($it['precioUnitario'] ?? $it['precioLista'] ?? 0), $items));
        $modalidadPorMonto = ((float) ($config['montoMinimoMayorista'] ?? 0) > 0 && ! empty($config['modalidadMontoId']) && $brutoTicket + 1e-9 >= (float) $config['montoMinimoMayorista'])
            ? (int) $config['modalidadMontoId'] : null;

        $declaranOferta = collect($items)->contains(fn ($it) => (float) ($it['ofertaDescuento'] ?? 0) > 0);
        $ofertasActivas = $declaranOferta ? collect($this->ofertas->activas())->keyBy('id') : collect();

        $resueltos = [];
        foreach ($items as $it) {
            $prod = $prods->get((int) $it['productoId']);
            if (! $prod) {
                throw new ErrorDeNegocio('Uno de los artículos del ticket no existe.');
            }
            $presId = (int) ($it['presentacionId'] ?? 0) ?: null;
            $pres = $presId ? $press->get($presId) : null;
            if ($presId && (! $pres || (int) $pres->producto_id !== (int) $prod->id)) {
                throw new ErrorDeNegocio('El envasado que se está vendiendo no es de '.$prod->nombre.'.');
            }
            $etiqueta = $prod->nombre.($pres ? ' ('.(float) $pres->tam_kg.' kg)' : '');
            $cantidad = (float) ($it['cantidad'] ?? 0);
            $iva = (float) $prod->iva;

            // El costo con el que se cotiza (base del markup) y el que se congela (real).
            $activo = Pricing::formatoActivo(($provs->get($prod->id) ?? collect())->all());
            $cf = Pricing::costosFormato($activo ? CostoEntry::desde((array) $activo) : null, $iva);
            $costo = $pres ? Pricing::costoNetoPresentacion($cf->costoPrecioUnitario, (float) $pres->tam_kg) : $cf->costoPrecioUnitario;
            $escala = $pres ? (float) $pres->tam_kg : 1.0;

            // El formato de venta del artículo, ordenado por preferencia.
            $suyas = $filas->filter(fn ($f) => (int) $f->producto_id === (int) $prod->id && ((int) ($f->presentacion_id ?? 0) ?: null) === $presId && $listaDe->has($f->lista_id))
                ->map(fn ($f) => ['fila' => $f, 'lista' => $listaDe->get($f->lista_id)])
                ->sortBy(fn ($s) => $s['lista']['orden'])->values();
            if ($suyas->isEmpty()) {
                throw new ErrorDeNegocio($etiqueta.' no tiene formato de venta cargado: no se puede vender hasta que tenga precio.');
            }
            $piso = $suyas->first(fn ($s) => $s['lista']['id'] === $baseId) ?? $suyas->last();
            $elegida = ! empty($it['listaId']) ? $suyas->first(fn ($s) => (int) $s['fila']->lista_id === (int) $it['listaId']) : $piso;
            if (! $elegida) {
                throw new ErrorDeNegocio($etiqueta.' no se vende con esa lista de precios. Elegí una de las que tiene cargadas.');
            }
            $congelado = $congelados[$prod->id.':'.($presId ?? '')] ?? null;

            // ¿Se ganó esa lista? Las puertas, en O.
            $esPiso = (int) $elegida['fila']->lista_id === (int) $piso['fila']->lista_id;
            $minimo = (float) $elegida['fila']->unidades_minimas;
            $llevadas = $porProducto[$prod->id] ?? $cantidad;
            $habilitada = $esPiso || $congelado
                || in_array((int) $elegida['fila']->lista_id, $delCliente, true)
                || ($minimo > 0 && $llevadas + 1e-9 >= $minimo)
                || ! empty($modalidadesDeMarca[$prod->marca_id][$elegida['lista']['modalidadId']])
                || ($modalidadPorMonto !== null && (int) $elegida['lista']['modalidadId'] === $modalidadPorMonto);
            if (! $habilitada && ! $puedePisarPrecio) {
                throw new ErrorDeNegocio($etiqueta.': el ticket no habilita la lista '.$elegida['lista']['nombre'].($minimo > 0 ? ' (pide '.$minimo.' unidades y el ticket lleva '.$llevadas.')' : '').'. Hace falta el permiso para pisar precios.');
            }

            // El precio: el de la fila, salvo que se pise con permiso o venga cotizado.
            $netoLista = Pricing::money(Pricing::precioVentaFila($costo, FilaVenta::desde((array) $elegida['fila']), new OpcionesPrecio($iva, (float) ($prod->redondeo ?? $redondeo)))->netoUnitario);
            $pedido = isset($it['precioUnitario']) ? Pricing::money((float) $it['precioUnitario']) : $netoLista;
            $difiere = abs($pedido - $netoLista) > 0.01;
            $honraCotizado = $congelado && abs($pedido - $congelado['precioLista']) <= 0.01;
            $pisado = $difiere && ! $honraCotizado;
            if ($pisado && ! $puedePisarPrecio) {
                throw new ErrorDeNegocio($etiqueta.': el precio de la lista '.$elegida['lista']['nombre'].' es $'.number_format($netoLista, 2, '.', '').' y se está cobrando $'.number_format($pedido, 2, '.', '').'. Hace falta el permiso para pisar precios.');
            }
            if ($pisado && $pedido < 0) {
                throw new ErrorDeNegocio($etiqueta.': el precio no puede ser negativo.');
            }

            // El descuento: 0..100, y el tope de la configuración acá.
            $desc = (float) ($it['descuento'] ?? 0);
            if ($desc < 0 || $desc > 100) {
                throw new ErrorDeNegocio($etiqueta.': el descuento va de 0 a 100.');
            }
            $tope = (float) ($config['descuentoMaxVendedor'] ?? 0);
            if ($desc > $tope + 1e-9 && ! $puedePisarPrecio) {
                throw new ErrorDeNegocio($etiqueta.': el descuento de '.$desc.'% supera el tope de '.$tope.'%. Hace falta el permiso para pisar precios.');
            }

            // La oferta: existe, activa, alcanza, corre en esta lista, y no descuenta más que su techo.
            $ofertaDesc = max(0, (float) ($it['ofertaDescuento'] ?? 0));
            $ofertaId = (int) ($it['ofertaId'] ?? 0) ?: null;
            if ($ofertaDesc > 0) {
                $of = $ofertaId ? $ofertasActivas->get($ofertaId) : null;
                if (! $of) {
                    throw new ErrorDeNegocio($etiqueta.': la oferta que descuenta ese importe no está activa.');
                }
                $misEtq = ($etiqs->get($prod->id) ?? collect())->pluck('etiqueta_id')->map(fn ($x) => (int) $x)->all();
                if (! self::ofertaAlcanza($of, ['productoId' => (int) $prod->id, 'presentacionId' => $presId, 'marcaId' => $prod->marca_id, 'categoriaId' => $prod->categoria_id, 'etiquetas' => $misEtq])) {
                    throw new ErrorDeNegocio($etiqueta.': la oferta "'.$of['nombre'].'" no incluye este artículo.');
                }
                $listasOferta = array_filter(array_map('intval', explode(',', (string) ($of['listas'] ?? ''))));
                if ($listasOferta && ! in_array((int) $elegida['fila']->lista_id, $listasOferta, true)) {
                    throw new ErrorDeNegocio($etiqueta.': la oferta "'.$of['nombre'].'" no corre sobre la lista '.($elegida['lista']['etiqueta'] ?: $elegida['lista']['nombre']).'.');
                }
                $techo = self::techoDeOferta($of, $cantidad, $pedido, $desc, $iva);
                if ($techo !== null && $ofertaDesc > $techo + 0.01) {
                    throw new ErrorDeNegocio($etiqueta.': la oferta "'.$of['nombre'].'" descuenta hasta $'.number_format($techo, 2, '.', '').' y se está aplicando $'.number_format($ofertaDesc, 2, '.', '').'.');
                }
            } else {
                $ofertaId = null;
                $ofertaDesc = 0.0;
            }

            // El descuento con nombre: después del tope, después de la oferta, y gana el mayor.
            $descuentoId = null;
            $descuentoNombre = '';
            $descuentoBase = $desc;
            if ($ofertaDesc == 0.0) {
                $dNom = $descuentosPorLista[(int) $elegida['fila']->lista_id] ?? null;
                if ($dNom && $dNom['porcentaje'] > $desc + 1e-9) {
                    $desc = $dNom['porcentaje'];
                    $descuentoId = $dNom['id'];
                    $descuentoNombre = $dNom['nombre'];
                }
            }

            $resueltos[] = [
                'productoId' => (int) $prod->id, 'presentacionId' => $presId, 'cantidad' => $cantidad,
                'listaId' => (int) $elegida['fila']->lista_id, 'lista' => $elegida['lista']['etiqueta'] ?: ($elegida['lista']['nombre'] ?? ''),
                'listaOrigen' => $honraCotizado ? 'presupuesto' : ($pisado ? 'manual' : ($esPiso ? 'base' : 'auto')),
                'precioLista' => $honraCotizado ? $congelado['precioLista'] : $netoLista,
                'precioUnitario' => $pedido, 'descuento' => $desc, 'descuentoBase' => $descuentoBase,
                'descuentoId' => $descuentoId, 'descuentoNombre' => $descuentoNombre,
                'ofertaId' => $ofertaId, 'oferta' => $ofertaId ? trim((string) ($it['oferta'] ?? '')) : '', 'ofertaDescuento' => $ofertaDesc,
                'iva' => $iva, 'costoUnitario' => $cf->costoNetoUnitario * $escala, 'ivaAbsorbidoUnitario' => $cf->ivaAbsorbidoUnitario * $escala,
                'porcSinFactura' => $cf->porcSinFactura, 'nombre' => $prod->nombre,
            ];
        }

        // Un descuento no puede quedar colgado de una lista que el ticket no usa.
        foreach ($descuentosPorLista as $d) {
            if (! collect($resueltos)->contains(fn ($r) => $r['listaId'] === $d['listaId'])) {
                throw new ErrorDeNegocio('El descuento "'.$d['nombre'].'" es de otra lista de precios: ningún renglón de este ticket la usa.');
            }
        }

        return $resueltos;
    }

    /**
     * Neto, descuento, IVA y total de ítems + extras. Solo aritmética sobre
     * renglones YA resueltos. Se redondea renglón por renglón, igual que el POS.
     */
    public static function calcularTotales(array $renglones, array $extrasDto = []): array
    {
        $subtotalNeto = 0.0;
        $descuentoTotal = 0.0;
        $ivaTotal = 0.0;
        $items = [];
        foreach ($renglones as $it) {
            $cantidad = (float) ($it['cantidad'] ?? 0);
            if ($cantidad <= 0) {
                throw new ErrorDeNegocio('Todas las cantidades deben ser mayores a 0.');
            }
            $precioUnitario = (float) ($it['precioUnitario'] ?? $it['precioLista'] ?? 0);
            $precioListaItem = (float) ($it['precioLista'] ?? $it['precioUnitario'] ?? 0);
            $desc = (float) ($it['descuento'] ?? 0);
            $ivaP = isset($it['iva']) ? (float) $it['iva'] : 21.0;
            $brutoCrudo = $cantidad * $precioUnitario;
            $bonificado = $brutoCrudo * (1 - $desc / 100);
            $ofertaDesc = min(max(0, (float) ($it['ofertaDescuento'] ?? 0)), $bonificado);
            $netoCrudo = $bonificado - $ofertaDesc;
            $bruto = Pricing::money($brutoCrudo);
            $neto = Pricing::money($netoCrudo);
            $subtotalNeto += $neto;
            $descuentoTotal += $bruto - $neto;
            $ivaTotal += Pricing::money($netoCrudo * $ivaP / 100);
            $items[] = [
                'producto_id' => (int) $it['productoId'], 'presentacion_id' => $it['presentacionId'] ?? null,
                'lista_id' => $it['listaId'] ?? null, 'lista' => trim((string) ($it['lista'] ?? '')), 'lista_origen' => $it['listaOrigen'] ?? 'base',
                'cantidad' => $cantidad, 'precio_lista' => $precioListaItem, 'descuento' => $desc, 'precio_unitario' => $precioUnitario,
                'oferta_id' => $it['ofertaId'] ?? null, 'oferta' => trim((string) ($it['oferta'] ?? '')), 'oferta_descuento' => Pricing::money($ofertaDesc),
                'descuento_id' => $it['descuentoId'] ?? null, 'descuento_nombre' => trim((string) ($it['descuentoNombre'] ?? '')),
                'descuento_base' => $it['descuentoBase'] ?? $desc,
                'costo_unitario' => $it['costoUnitario'] ?? null, 'iva_absorbido_unitario' => $it['ivaAbsorbidoUnitario'] ?? null, 'porc_sin_factura' => $it['porcSinFactura'] ?? null,
                'iva' => $ivaP, 'subtotal' => $neto, 'ref_item_id' => $it['refItemId'] ?? null,
            ];
        }
        $extras = [];
        foreach ($extrasDto as $e) {
            $importe = Pricing::money((float) ($e['importe'] ?? 0));
            if ($importe <= 0) {
                continue;
            }
            $ivaP = isset($e['iva']) ? (float) $e['iva'] : 21.0;
            $subtotalNeto += $importe;
            $ivaTotal += $importe * $ivaP / 100;
            $extras[] = ['concepto' => trim((string) ($e['concepto'] ?? '')) ?: 'Extra', 'importe' => $importe, 'iva' => $ivaP];
        }
        $subtotalNeto = Pricing::money($subtotalNeto);
        $ivaTotal = Pricing::money($ivaTotal);

        return ['items' => $items, 'extras' => $extras, 'subtotalNeto' => $subtotalNeto, 'descuentoTotal' => Pricing::money($descuentoTotal), 'ivaTotal' => $ivaTotal, 'total' => Pricing::money($subtotalNeto + $ivaTotal)];
    }
}
