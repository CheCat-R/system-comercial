/* eslint-env node */
/**
 * CONTRATO store ↔ API de los guardados del producto. La API valida los renglones en `items`
 * (ProductosController); mandarlos con otro nombre respondía 422 "Falta los renglones" y dejaba inutilizables
 * el formato de compra, las presentaciones y el formato de venta desde el panel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { red, drenar, sesionDe } from '../../../core/__pruebas__/entorno.js';

async function cargarStore() {
  sessionStorage.setItem('crm_sesion', JSON.stringify(sesionDe()));
  const { inventoryStore } = await import('./inventory.store.js');
  return inventoryStore;
}

const cuerpoDe = (metodo, fragmento) => red.llamadas.find((l) => l.method === metodo && l.url.includes(fragmento))?.body;

test('guardarFormatosCompra manda los renglones en `items` (lo que valida la API)', async () => {
  red.llamadas.length = 0;
  red.responder = () => ({ status: 200, body: {} });
  const store = await cargarStore();
  await store.guardarFormatosCompra(5, [{ id: 9, proveedorId: 1, cantidad: '12', costo: '12000', usarParaPrecio: true }]);
  await drenar();
  const body = cuerpoDe('PUT', '/productos/5/formatos-compra');
  assert.ok(body, 'no se hizo el PUT');
  assert.ok(Array.isArray(body.items), `El cuerpo trae [${Object.keys(body).join(', ')}] y la API exige "items": responde 422 "Falta los renglones."`);
});

test('guardarPresentaciones manda los renglones en `items`', async () => {
  red.llamadas.length = 0;
  const store = await cargarStore();
  await store.guardarPresentaciones(5, [{ id: null, tamKg: 0.25, codigoBarras: '' }]);
  await drenar();
  const body = cuerpoDe('PUT', '/productos/5/presentaciones');
  assert.ok(Array.isArray(body?.items), `El cuerpo trae [${Object.keys(body ?? {}).join(', ')}] y la API exige "items".`);
});

test('guardarListasProducto y guardarListasPresentacion mandan el formato de venta en `items`', async () => {
  red.llamadas.length = 0;
  const store = await cargarStore();
  await store.guardarListasProducto(5, { listas: [{ listaId: 1, modoPrecio: 'markup', markup: 40 }] });
  await store.guardarListasPresentacion(7, { listas: [{ listaId: 1, modoPrecio: 'markup', markup: 40 }] });
  await drenar();
  const prod = cuerpoDe('PUT', '/productos/5/listas');
  const pres = cuerpoDe('PUT', '/productos/presentaciones/7/listas');
  assert.ok(Array.isArray(prod?.items), `producto: el cuerpo trae [${Object.keys(prod ?? {}).join(', ')}] y la API exige "items".`);
  assert.ok(Array.isArray(pres?.items), `paquete: el cuerpo trae [${Object.keys(pres ?? {}).join(', ')}] y la API exige "items".`);
});
