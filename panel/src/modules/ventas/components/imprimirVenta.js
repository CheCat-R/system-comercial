/**
 * El ticket / la factura en papel: una ventana nueva con el comprobante en
 * 80 mm y `window.print()`. Lleva lo que la ley pide en una factura (emisor,
 * receptor con documento y condición, letra y código, CAE y su vencimiento, el
 * QR de ARCA) y, en un ticket interno, la leyenda de "no válido como factura".
 */
import { CONDICIONES_IVA, TIPOS_VENTA, esNotaCredito, etiquetaVenta, money, num, stamp } from "../api/ventasApi";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function htmlVenta(v, empresa = {}) {
  const fiscal = v.tipo !== "ticket";
  const letra = fiscal ? (TIPOS_VENTA[v.tipo]?.label || "").slice(-1) : "";
  const qr = v.qrArca ? `<img class="qr" alt="QR ARCA" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(v.qrArca)}">` : "";
  const items = (v.items || []).map((it) => `
    <tr><td colspan="3" class="nombre">${esc(it.nombre)}${it.oferta ? ` <em>· ${esc(it.oferta)}</em>` : ""}${it.descuentoNombre ? ` <em>· ${esc(it.descuentoNombre)}</em>` : ""}</td></tr>
    <tr><td>${num(it.cantidad, 3)} ${esc(it.unidad || "")} × ${money(it.precioUnitario)}${it.descuento > 0 ? ` −${num(it.descuento)}%` : ""}</td><td></td><td class="r">${money(it.subtotal)}</td></tr>`).join("");
  const extras = (v.extras || []).map((e) => `<tr><td colspan="2">${esc(e.concepto)}</td><td class="r">${money(e.importe)}</td></tr>`).join("");
  const pagos = (v.pagos || []).map((p) => `<tr><td colspan="2">${esc(p.medio.replace(/_/g, " "))}${p.referencia ? ` (${esc(p.referencia)})` : ""}</td><td class="r">${money(p.importe)}</td></tr>`).join("");
  const cli = v.cliente || {};
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(etiquetaVenta(v))}</title>
<style>
  body{font-family:"Courier New",monospace;font-size:12px;margin:0;padding:8px;width:72mm;color:#000}
  h1{font-size:15px;margin:0;text-align:center}.c{text-align:center}.r{text-align:right}
  table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}.nombre{font-weight:bold}
  hr{border:0;border-top:1px dashed #000;margin:6px 0}.tot td{font-weight:bold;font-size:14px}
  .letra{display:inline-block;border:2px solid #000;padding:2px 8px;font-size:18px;font-weight:bold}
  .qr{display:block;margin:6px auto}small{font-size:10px}em{font-style:normal;font-size:10px}
  @media print{@page{margin:4mm}}
</style></head><body>
  <h1>${esc(empresa.nombre || "CheCAT")}</h1>
  ${empresa.razonSocial ? `<div class="c">${esc(empresa.razonSocial)}</div>` : ""}
  ${empresa.cuit ? `<div class="c">CUIT ${esc(empresa.cuit)}</div>` : ""}
  ${v.sucursalDireccion || empresa.direccion ? `<div class="c"><small>${esc(v.sucursalDireccion || empresa.direccion)}</small></div>` : ""}
  <hr>
  ${fiscal ? `<div class="c"><span class="letra">${esc(letra)}</span><br><small>COD. ${String(v.codigoComprobante ?? "").padStart(2, "0")}</small></div>` : ""}
  <div class="c"><strong>${esc(etiquetaVenta(v))}</strong></div>
  <div class="c">${esc(stamp(v.fecha))}</div>
  ${fiscal ? `<div><small>${esc(cli.nombre || v.clienteNombre)} · ${esc(CONDICIONES_IVA[cli.condicionIva]?.label || "")}${cli.numeroDoc ? ` · ${esc((cli.tipoDoc || "").toUpperCase())} ${esc(cli.numeroDoc)}` : ""}</small></div>` : (v.clienteNombre && !v.cliente?.esConsumidorFinal ? `<div><small>${esc(v.clienteNombre)}</small></div>` : "")}
  ${v.origen ? `<div><small>Ajusta ${esc(etiquetaVenta(v.origen))}</small></div>` : ""}
  <hr>
  <table>${items}${extras}</table>
  <hr>
  <table>
    <tr><td colspan="2">Neto</td><td class="r">${money(v.subtotalNeto)}</td></tr>
    ${v.descuentoTotal > 0 ? `<tr><td colspan="2">Descuentos</td><td class="r">−${money(v.descuentoTotal)}</td></tr>` : ""}
    <tr><td colspan="2">IVA</td><td class="r">${money(v.ivaTotal)}</td></tr>
    <tr class="tot"><td colspan="2">${esNotaCredito(v.tipo) ? "TOTAL ACREDITADO" : "TOTAL"}</td><td class="r">${money(v.total)}</td></tr>
  </table>
  ${pagos ? `<hr><table>${pagos}</table>` : ""}
  ${v.condicionPago === "cuenta_corriente" ? `<div class="c"><small>Cuenta corriente${v.vencimientoPago ? ` · vence ${esc(stamp(v.vencimientoPago))}` : ""}</small></div>` : ""}
  <hr>
  ${v.cae ? `<div class="c"><small>CAE ${esc(v.cae)}${v.caeVencimiento ? ` · Vto. ${esc(stamp(v.caeVencimiento).slice(0, 6))}` : ""}</small></div>${qr}` : ""}
  ${!fiscal ? `<div class="c"><small>Documento no válido como factura</small></div>` : ""}
  ${v.facturarPendiente ? `<div class="c"><small>Ticket provisorio · pendiente de facturación electrónica</small></div>` : ""}
  <div class="c"><small>${esc(v.cajeroNombre || "")}</small></div>
  <div class="c"><small>¡Gracias por su compra!</small></div>
</body></html>`;
}

export function imprimirVenta(v, empresa) {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return false;
  w.document.open();
  w.document.write(htmlVenta(v, empresa));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* el usuario cierra la ventana */ } }, 350);
  return true;
}
