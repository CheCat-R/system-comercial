<?php

namespace App\Precios;

/** La cadena completa de un formato de compra, tal como se muestra en la pantalla del formato. */
final class CostosFormato
{
    public function __construct(
        public readonly float $cantidad = 1,
        public readonly float $costoLista = 0,
        public readonly float $costoListaUnitario = 0,
        /** El de la cascada, en %. Es el número que nadie calcula bien de cabeza. */
        public readonly float $descuentoEfectivo = 0,
        public readonly float $costoBruto = 0,
        /**
         * EL COSTO ECONÓMICO REAL del bulto: lo que la mercadería cuesta de
         * verdad (el IVA facturado se recupera; la parte sin factura cuenta
         * entera; el flete entra en neto). Es el que valúa stock, pérdidas y
         * transferencias.
         */
        public readonly float $costoNeto = 0,
        public readonly float $costoFinal = 0,
        public readonly float $costoNetoUnitario = 0,
        public readonly float $costoFinalUnitario = 0,
        /** Qué parte del valor de la mercadería viene sin factura (0–100). */
        public readonly float $porcSinFactura = 0,
        /**
         * LA BASE DEL PRECIO DE VENTA. A la parte sin factura se le quita el IVA
         * que la venta va a generar (÷ factor), porque ese IVA lo absorbe el
         * negocio y no se le traslada al cliente.
         */
        public readonly float $costoPrecio = 0,
        public readonly float $costoPrecioUnitario = 0,
        /** El IVA que el negocio ABSORBE al vender este bulto: costo real − base del precio. */
        public readonly float $ivaAbsorbido = 0,
        public readonly float $ivaAbsorbidoUnitario = 0,
        /** Lo que se le PAGA AL PROVEEDOR por el bulto (sin el flete, que se paga a un tercero). */
        public readonly float $desembolso = 0,
        public readonly float $desembolsoUnitario = 0,
    ) {}

    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
