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

test('ventaFormato en modo "precio" guarda el neto con 4 decimales, igual que Pricing::unitario de la API', async () => {
  const store = await cargarStore();
  // El ejemplo del propio comentario de Pricing.php: $581 con IVA 21 % → neto 480,1653; el bolsón de 10 kg vale $5.810,00.
  const prod = { iva: 21, redondeo: 0 };
  const v = store.ventaFormato(prod, { modoPrecio: 'precio', precioFijo: 5810, unidades: 10 });
  assert.equal(v.finalFormato, 5810);
  assert.equal(v.netoUnitario, 480.1653, `El panel calcula el neto ${v.netoUnitario}; la API guarda 480.1653 (round(x*10000)/10000).`);
});

test('crearComprobante: dos envíos simultáneos idénticos no deberían ser dos POST', async () => {
  red.llamadas.length = 0;
  red.responder = () => ({ status: 200, body: {} });
  const store = await cargarStore();
  const dto = { tipo: 'remito', proveedorId: 1, sucursalId: 1, recepcion: true, items: [{ productoId: 1, cantidad: 24, costoUnitario: 1000 }] };
  await Promise.all([store.crearComprobante(dto), store.crearComprobante(dto)]);
  await drenar();
  const posts = red.llamadas.filter((l) => l.method === 'POST' && l.url.endsWith('/comprobantes')).length;
  assert.equal(posts, 1, `Se mandaron ${posts} POST /comprobantes idénticos (doble clic = doble ingreso de stock).`);
});

test('una mutación que se hizo no se informa como fallida si solo falló la recarga posterior', async () => {
  red.llamadas.length = 0;
  red.responder = (url, init) => {
    if (init?.method === 'POST' && url.endsWith('/comprobantes')) return { status: 201, body: { id: 77 } };
    if (url.includes('/bootstrap')) return { status: 500, body: { message: 'Error interno' } };
    return { status: 200, body: {} };
  };
  const store = await cargarStore();
  const res = await store.crearComprobante({ tipo: 'remito', proveedorId: 1, sucursalId: 1, recepcion: true, items: [{ productoId: 1, cantidad: 24, costoUnitario: 1000 }] });
  await drenar();
  assert.equal(res.ok, true, `El comprobante se creó (201, id 77) pero el store devolvió ${JSON.stringify(res)}: el usuario reintenta y lo duplica.`);
});

test('refetch: una respuesta vieja que llega tarde no pisa la más nueva', async () => {
  red.llamadas.length = 0;
  let soltarPrimera;
  const primera = new Promise((r) => { soltarPrimera = r; });
  let n = 0;
  red.responder = async (url) => {
    if (!url.includes('/bootstrap')) return { status: 200, body: {} };
    n += 1;
    if (n === 1) { await primera; return { status: 200, body: { productos: [{ id: 1, nombre: 'foto VIEJA' }] } }; }
    return { status: 200, body: { productos: [{ id: 1, nombre: 'foto NUEVA' }] } };
  };
  const store = await cargarStore();
  const lenta = store.refetch();      // pedido 1 (sale primero, contesta último)
  await drenar();
  await store.refetch();              // pedido 2 (más nuevo, contesta primero)
  soltarPrimera();
  await lenta;
  await drenar();
  assert.equal(store.state.productos[0]?.nombre, 'foto NUEVA', `El estado quedó con "${store.state.productos[0]?.nombre}": la respuesta del pedido viejo pisó la del nuevo.`);
});
