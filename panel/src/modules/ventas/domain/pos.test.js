/**
 * La aritmética del ticket del POS: lo que la cajera ve y lo que se cobra.
 * Mismo criterio que el backend — por eso vale la pena fijarlo con números.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRenglon, cantidadDeEtiqueta, r2, totalesTicket } from './pos.js';

test('calcularRenglon: bruto → descuento % → oferta (importe) → IVA', () => {
  const c = calcularRenglon({ cantidad: 3, precioUnitario: 1000, descuento: 10, ofertaDescuento: 200, iva: 21 });
  assert.equal(c.bruto, 3000);
  assert.equal(c.oferta, 200);
  assert.equal(c.neto, 2500, '3000 − 10% = 2700, − 200 de oferta');
  assert.equal(c.iva, 525, '21% sobre lo que se cobra');
  assert.equal(c.total, 3025);
});

test('calcularRenglon: la oferta nunca deja el renglón en negativo', () => {
  const c = calcularRenglon({ cantidad: 1, precioUnitario: 100, descuento: 0, ofertaDescuento: 500, iva: 21 });
  assert.equal(c.oferta, 100, 'se topea en el neto');
  assert.equal(c.neto, 0);
  assert.equal(c.total, 0);
});

test('calcularRenglon: datos sucios cuentan como 0', () => {
  const c = calcularRenglon({ cantidad: 'x', precioUnitario: null, iva: undefined });
  assert.deepEqual(c, { bruto: 0, oferta: 0, neto: 0, iva: 0, total: 0 });
});

test('totalesTicket: suma renglones y extras con su propia alícuota', () => {
  const t = totalesTicket(
    [
      { cantidad: 2, precioUnitario: 1000, descuento: 0, iva: 21 },
      { cantidad: 1, precioUnitario: 500, descuento: 20, ofertaDescuento: 50, iva: 10.5 },
    ],
    [{ importe: 300, iva: 21 }],
  );
  assert.equal(t.bruto, 2500);
  assert.equal(t.descuento, 150, '100 del 20% + 50 de la oferta');
  assert.equal(t.ahorro, 50, 'solo lo que ahorraron las ofertas');
  assert.equal(t.extras, 300);
  assert.equal(t.neto, 2650, '2000 + 350 + 300 de envío');
  assert.equal(t.iva, 519.75, '420 + 36,75 + 63');
  assert.equal(t.total, 3169.75);
  assert.equal(t.renglones, 2);
  assert.equal(t.unidades, 3);
});

test('totalesTicket: vacío es todo cero', () => {
  const t = totalesTicket([]);
  assert.equal(t.total, 0);
  assert.equal(t.renglones, 0);
});

/* ---- El panel redondea igual que la API (round() de PHP) ---- */

test('r2 redondea el medio centavo hacia arriba, como la API', () => {
  assert.equal(r2(2068.595), 2068.6);
  assert.equal(r2(1.005), 1.01);
  assert.equal(r2(-2068.595), -2068.6);
  assert.equal(r2(0.1 + 0.2), 0.3);
  assert.equal(r2(''), 0);
});

test('un producto de góndola $2.503 (neto 2068,595) se cobra $2.503,00 y no $2.502,99', () => {
  const r = { cantidad: 1, precioUnitario: 2068.595, iva: 21, descuento: 0 };
  assert.equal(calcularRenglon(r).neto, 2068.6);
  assert.equal(totalesTicket([r]).total, 2503);
  assert.equal(totalesTicket([r]).total, calcularRenglon(r).total, 'el renglón y el total del ticket dicen lo mismo');
});

test('etiqueta de balanza en modo importe: se divide por el precio FINAL, no por el neto', () => {
  const item = { precio: 1000, precioFinal: 1210 };
  assert.equal(cantidadDeEtiqueta({ codigoItem: '00123', importe: 1210 }, item), 1, '$1.210 de un artículo a $1.210/kg es 1 kg');
  assert.equal(cantidadDeEtiqueta({ codigoItem: '00123', cantidad: 0.5 }, item), 0.5, 'en modo peso manda el peso');
  assert.equal(cantidadDeEtiqueta({ codigoItem: '00123', importe: 100 }, { precio: 0, precioFinal: 0 }), 0);
});
