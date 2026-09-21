<?php

namespace App\Http\Requests\Compras;

use App\Compras\Documentos;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

/**
 * El alta de un comprobante de compra. Las reglas de DATOS (proveedor,
 * duplicados, la factura que ajusta una nota, cuotas que cierran) viven en el
 * servicio: acá solo la forma.
 */
class GuardarComprobanteRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'tipo' => ['required', Rule::in(Documentos::TIPOS)],
            'letra' => ['nullable', Rule::in(Documentos::LETRAS)],
            'puntoVenta' => ['nullable', 'string', 'max:10'],
            'numero' => ['nullable', 'integer', 'min:1', 'max:99999999'],
            'proveedorId' => ['required', 'integer'],
            'sucursalId' => ['nullable', 'integer'],
            'estado' => ['nullable', Rule::in(['borrador', 'confirmado'])],
            'condicionPago' => ['nullable', Rule::in(['contado', 'cuenta_corriente'])],
            'recepcion' => ['nullable', 'boolean'],
            'bonificacion' => ['nullable', 'numeric'],
            'bonificacionImporte' => ['nullable', 'numeric'],
            'percepciones' => ['nullable', 'array', 'max:20'],
            'percepciones.*.nombre' => ['required', 'string', 'max:120'],
            'percepciones.*.alicuota' => ['nullable', 'numeric'],
            'percepciones.*.base' => ['nullable', Rule::in(['neto', 'total'])],
            'percepciones.*.importe' => ['nullable', 'numeric'],
            'refComprobanteId' => ['nullable', 'integer'],
            'observaciones' => ['nullable', 'string', 'max:2000'],
            'cae' => ['nullable', 'string', 'max:32'],
            'fecha' => ['nullable', 'string', 'max:30'],
            'fechaCarga' => ['nullable', 'string', 'max:30'],
            'vencimientoPago' => ['nullable', 'string', 'max:30'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.productoId' => ['required', 'integer'],
            'items.*.presentacionId' => ['nullable', 'integer'],
            'items.*.cantidad' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'items.*.costoUnitario' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'items.*.descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.iva' => ['nullable', 'numeric'],
            'items.*.codigoProveedor' => ['nullable', 'string', 'max:80'],
            'items.*.descripcionPapel' => ['nullable', 'string', 'max:200'],
            'actualizarCostos' => ['nullable', 'array', 'max:500'],
            'actualizarCostos.*.productoId' => ['required', 'integer'],
            'actualizarCostos.*.costo' => ['required', 'numeric', 'min:0'],
            'actualizarCostos.*.cantidad' => ['nullable', 'numeric', 'min:0'],
            'actualizarCostos.*.descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'actualizarCostos.*.flete' => ['nullable', 'numeric', 'min:0'],
            'activarProveedor' => ['nullable', 'array', 'max:500'],
            'activarProveedor.*' => ['integer'],
            'pagoContado' => ['nullable', 'array'],
            'pagoContado.importe' => ['required_with:pagoContado', 'numeric', 'min:0.01'],
            'pagoContado.medio' => ['nullable', Rule::in(Documentos::MEDIOS)],
            'pagoContado.cajaSesionId' => ['nullable', 'integer'],
            'pagoContado.referencia' => ['nullable', 'string', 'max:200'],
            'pagoContado.operadorId' => ['nullable', 'integer'],
            'tomarPagos' => ['nullable', 'array', 'max:50'],
            'tomarPagos.*.pagoId' => ['required', 'integer'],
            'tomarPagos.*.importe' => ['required', 'numeric', 'min:0.01'],
            'compromisos' => ['nullable', 'array', 'max:36'],
            'compromisos.*.importe' => ['required', 'numeric', 'min:0.01'],
            'compromisos.*.fechaVenc' => ['required', 'string', 'max:30'],
            'compromisos.*.obs' => ['nullable', 'string', 'max:300'],
        ];
    }

    public function messages(): array
    {
        return ['items.*' => 'Agregá al menos un ítem.', 'proveedorId.*' => 'Elegí el proveedor.', 'tipo.*' => 'Tipo de comprobante inválido.'];
    }
}
