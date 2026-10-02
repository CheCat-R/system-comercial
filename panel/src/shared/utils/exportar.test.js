import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

/*
 * `exportar.js` baja el archivo creando un <a download>: acá se reemplaza
 * `document` por un doble que guarda lo que se iba a bajar (nombre y bytes).
 */
let bajado = null;
let ultimoBlob = null;
before(() => {
  globalThis.document = {
    createElement: () => {
      const a = { click() { bajado = { nombre: a.download, blob: ultimoBlob }; }, remove() {} };
      return a;
    },
    body: { appendChild() {} },
  };
  URL.createObjectURL = (b) => { ultimoBlob = b; return 'blob:prueba'; };
  URL.revokeObjectURL = () => {};
});

const { exportarExcel, exportarPdf } = await import('./exportar.js');

const columnas = [
  { h: 'ID', tipo: 'id' }, { h: 'Producto', tipo: 'texto' }, { h: 'Precio', tipo: 'moneda' }, { h: 'Cantidad', tipo: 'entero' },
];
const fila = (i) => [i, `Ñandú áéíóú ${i}`, 1234.5 + i, 10 * i];

const bytes = async (blob) => Buffer.from(await blob.arrayBuffer());
const fecha = /\d{4}-\d{2}-\d{2}/;

test('el Excel sale como un .xlsx de verdad (un zip), con el nombre y la fecha', async () => {
  await exportarExcel({ archivo: 'clientes', hoja: 'Clientes / ñ:*?', columnas, filas: [fila(1), fila(2)] });
  assert.match(bajado.nombre, new RegExp(`^clientes-${fecha.source}\\.xlsx$`));
  const b = await bytes(bajado.blob);
  assert.equal(b.subarray(0, 2).toString(), 'PK', 'un .xlsx es un zip');
  assert.ok(b.length > 1000);
});

test('el Excel acepta celdas vacías y nombres de hoja con caracteres prohibidos', async () => {
  await exportarExcel({
    archivo: 'x', hoja: 'a'.repeat(50) + '/\\?*[]:', columnas,
    filas: [[1, '', null, undefined], [2, 'ok', 0, 0]],
  });
  assert.equal((await bytes(bajado.blob)).subarray(0, 2).toString(), 'PK');
});

test('el PDF es un PDF válido, con membrete, y una lista larga ocupa varias hojas', async () => {
  const filas = Array.from({ length: 120 }, (_, i) => fila(i + 1));
  await exportarPdf({ archivo: 'productos', titulo: 'Productos', empresa: 'Almacén Don Pepe', filtros: 'Solo activos', columnas, filas });
  assert.match(bajado.nombre, new RegExp(`^productos-${fecha.source}\\.pdf$`));
  const b = await bytes(bajado.blob);
  assert.equal(b.subarray(0, 5).toString(), '%PDF-');
  const paginas = (b.toString('latin1').match(/\/Type \/Page\b(?!s)/g) || []).length;
  assert.ok(paginas > 1, `esperaba varias hojas y salió ${paginas}`);
});

test('con muchas columnas el PDF sale apaisado; con pocas, de pie', async () => {
  const medida = async (cols) => {
    await exportarPdf({ archivo: 'm', titulo: 'T', columnas: cols, filas: [cols.map(() => 'x')] });
    const m = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec((await bytes(bajado.blob)).toString('latin1'));
    return { ancho: Number(m[1]), alto: Number(m[2]) };
  };
  const pocas = Array.from({ length: 4 }, (_, i) => ({ h: `c${i}`, tipo: 'texto' }));
  const muchas = Array.from({ length: 9 }, (_, i) => ({ h: `c${i}`, tipo: 'texto' }));
  const a = await medida(pocas);
  const b = await medida(muchas);
  assert.ok(a.alto > a.ancho, 'pocas columnas: de pie');
  assert.ok(b.ancho > b.alto, 'muchas columnas: apaisado');
});
