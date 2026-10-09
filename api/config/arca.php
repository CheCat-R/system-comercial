<?php

use App\Clientes\SelectorDeCliente;

/*
 * ARCA — facturación electrónica. Todo lo que el módulo sabe del entorno vive
 * acá; el resto del código no lee `env()`.
 *
 *  · El CUIT sale del ENTORNO, no de la configuración de la empresa: tiene que
 *    ser EXACTAMENTE el del certificado. El de Sistema › Empresa es el del
 *    membrete, y el panel avisa si divergen.
 *  · El punto de venta de web services es PROPIO (distinto del de "Factura en
 *    Línea" y del de los tickets internos): numeraciones independientes.
 *  · Las rutas de los certificados NO tienen default: sin variable no hay
 *    ruta, y sin ruta la facturación queda dormida. En Hostinger van FUERA de
 *    `public_html` (p. ej. `/home/usuario/arca/`), nunca en una carpeta servida.
 */
return [
    'produccion' => strtolower((string) env('ARCA_ENV', '')) === 'produccion',
    'cuit' => preg_replace('/\D/', '', (string) env('ARCA_CUIT', '')),
    'pto_vta' => (int) env('ARCA_PTO_VTA', 0),
    /*
     * En una instalación con varios clientes (`App\Clientes\SelectorDeCliente`) cada uno guarda su certificado en SU carpeta
     * `arca/`, fuera de lo público, y no hace falta tocar el `.env`: el trámite se hace desde el panel. En una instalación
     * común (un cliente, un Corporativo dedicado) siguen mandando las variables.
     */
    'cert_path' => (string) (env('ARCA_CERT_PATH') ?: (SelectorDeCliente::carpeta() ? SelectorDeCliente::carpeta().'/arca/certificado.crt' : '')),
    'key_path' => (string) (env('ARCA_KEY_PATH') ?: (SelectorDeCliente::carpeta() ? SelectorDeCliente::carpeta().'/arca/clave.key' : '')),
    /*
     * Cuánto se espera a ARCA antes de darlo por caído. Corto a propósito: hay
     * una cajera con un cliente enfrente y el circuito de caída ya existe (sale
     * el ticket provisorio y la factura queda pendiente). Pedir el TICKET DE
     * ACCESO tarda ~10 s en homologación; el resto, uno o dos.
     */
    'timeout_ms' => (int) env('ARCA_TIMEOUT_MS', 15000),
];
