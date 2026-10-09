/**
 * Reglas del POS que tienen que coincidir con la API (Portero.php / VentasService.php) o conservar una
 * decisión del cajero: descuentos con nombre, ofertas (el cartel manda), recálculo al cambiar precio o lista,
 * oferta de ticket con mínimo, precio por monto y reabrir un ticket guardado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEtiquetaBalanza, problemasDelTicket, r3, ticketInicial, ticketReducer, totalesTicket,
} from './pos.js';
import { resolverOfertas } from './ofertas.js';
import { indicePrecios, sugerenciaPorMonto } from './listas.js';

/* ------------------------------------------------------------------ *
 * Fixtures: dos listas (Mostrador base, Mayorista) y un producto.
 * ------------------------------------------------------------------ */
const MOSTRADOR = { listaId: 1, modalidadId: 1, modalidad: 'Minorista', etiqueta: 'Mostrador', orden: 1, esBase: true };
const MAYORISTA = { listaId: 2, modalidadId: 2, modalidad: 'Mayorista', etiqueta: 'Mayorista', orden: 0, esBase: false };

const item = (id, precio, extra = {}) => ({
  key: `p${id}`, productoId: id, presentacionId: null, nombre: `Prod ${id}`, detalle: 'Unidad',
  marca: '', marcaId: null, categoriaId: null, etiquetas: [], unidad: 'u', fraccionable: false,
  iva: 21, stock: 1000, precio, precios: [{ listaId: 1, precio, unidadesMinimas: 0 }], ...extra,
});

const OFERTA_20 = { id: 3, nombre: '20% off', tipo: 'porcentaje', porcentaje: 20, activa: true, alcances: [{ tipo: 'producto', refId: 1 }] };

function estadoCon(catalogoExtra, items) {
  const catalogo = { listas: [MOSTRADOR, MAYORISTA], reglasMarca: [], ofertas: [], ...catalogoExtra };
  return ticketReducer(ticketInicial, {
    tipo: 'contexto',
    ctx: {
      catalogo, cliente: null, precios: indicePrecios(items), sucursalId: 1,
      ahora: new Date('2026-10-08T12:00:00-03:00'), descuentos: [],
    },
  });
}

/* ------------------------------------------------------------------ *
 * 1. Redondeo: el total del panel no es el de la API
 * ------------------------------------------------------------------ */
test('tope: un descuento CON NOMBRE (25%) bloquea "Cobrar" a un cajero con tope 10%', () => {
  const r = {
    nombre: 'Yerba', detalle: '1 kg', cantidad: 1, precioUnitario: 1000, stock: 10, unidad: 'u',
    descuento: 25, descuentoBase: 0, descuentoId: 7, descuentoNombre: 'Atención por tardanza',
  };
  // La API mide el tope contra la BASE (Portero::resolverRenglones, $desc antes del nombrado).
  const problemas = problemasDelTicket([r], { permitirStockNegativo: false, descuentoMax: 10, puedePisarPrecio: false });
  assert.deepEqual(problemas, [], 'el 25% lo autorizó el dueño: no tiene que bloquear el cobro');
});

test('ofertas: precio_fijo con cliente al 10% supera el techo de Portero::techoDeOferta', () => {
  // Neto 600, oferta "a $605 final" (neto 500), cliente 10% → la API acota a 1×(540−500)=40.
  const r = { key: 'p1', productoId: 1, presentacionId: null, cantidad: 1, precioUnitario: 600, descuento: 10, iva: 21, listaId: 1 };
  const o = { id: 9, nombre: 'Aceite a $605', tipo: 'precio_fijo', precio: 605, activa: true, alcances: [{ tipo: 'producto', refId: 1 }] };
  const res = resolverOfertas([r], [o], { ahora: new Date(), sucursalId: 1 }).get('p1');
  assert.ok(res.descuento <= 40 + 0.01, `el panel manda ofertaDescuento=${res.descuento} y la API rechaza todo lo que pase de 40`);
});

test('ofertas: pack con cliente al 10% supera el techo de la API', () => {
  // 2 u. a $1.089 final (neto 900). La API: 2×540 − 900 = 180 por pack.
  const r = { key: 'p1', productoId: 1, presentacionId: null, cantidad: 2, precioUnitario: 600, descuento: 10, iva: 21, listaId: 1 };
  const o = { id: 9, nombre: 'Pack x2', tipo: 'pack', lleva: 2, precio: 1089, activa: true, alcances: [{ tipo: 'producto', refId: 1 }] };
  const res = resolverOfertas([r], [o], { ahora: new Date(), sucursalId: 1 }).get('p1');
  assert.ok(res.descuento <= 180 + 0.01, `el panel manda ${res.descuento}, la API acepta hasta 180`);
});

test('precio manual: pisar el precio deja la oferta calculada sobre el precio viejo', () => {
  const it = item(1, 1000);
  let e = estadoCon({ ofertas: [OFERTA_20] }, [it]);
  e = ticketReducer(e, { tipo: 'agregar', item: it, cantidad: 1 });
  assert.equal(e.renglones[0].ofertaDescuento, 200);
  e = ticketReducer(e, { tipo: 'precio', uid: e.renglones[0].uid, valor: 1500 });
  assert.equal(e.renglones[0].ofertaDescuento, 300, '20% de 1500: el cliente paga 1300 en vez de 1200');
});

test('precio manual: bajar el precio con un 3×2 deja un descuento mayor al techo de la API', () => {
  const it = item(1, 1000);
  const o = { id: 4, nombre: '3x2', tipo: 'nxm', lleva: 3, paga: 2, activa: true, alcances: [{ tipo: 'producto', refId: 1 }] };
  let e = estadoCon({ ofertas: [o] }, [it]);
  e = ticketReducer(e, { tipo: 'agregar', item: it, cantidad: 3 });
  e = ticketReducer(e, { tipo: 'precio', uid: e.renglones[0].uid, valor: 500 });
  // Techo de la API: floor(3/3)×1×500 = 500.
  assert.ok(e.renglones[0].ofertaDescuento <= 500, `ofertaDescuento=${e.renglones[0].ofertaDescuento}: la API lo rechaza`);
});

test('modalidad a todo: pasar a Mayorista deja aplicada una oferta que solo corre en Mostrador', () => {
  const it = item(1, 1000, { precios: [{ listaId: 2, precio: 800, unidadesMinimas: 0 }, { listaId: 1, precio: 1000, unidadesMinimas: 0 }] });
  const soloMostrador = { ...OFERTA_20, listas: '1' };
  let e = estadoCon({ ofertas: [soloMostrador] }, [it]);
  e = ticketReducer(e, { tipo: 'agregar', item: it, cantidad: 1 });
  assert.equal(e.renglones[0].ofertaDescuento, 200);
  e = ticketReducer(e, {
    tipo: 'modalidadTodos', modalidadId: 2,
    listasPorId: new Map([[1, MOSTRADOR], [2, MAYORISTA]]),
    preciosDe: (k) => indicePrecios([it]).get(k),
  });
  assert.equal(e.renglones[0].listaId, 2);
  assert.equal(e.renglones[0].ofertaDescuento, 0,
    'la oferta es solo de Mostrador: la API responde "no corre sobre la lista Mayorista"');
});

test('oferta de ticket: sacar renglones por debajo del mínimo la deja aplicada', () => {
  const a = item(1, 5000);
  const b = item(2, 5000);
  const ot = { id: 5, nombre: '10% desde $10.000', tipo: 'ticket', porcentaje: 10, montoMinimo: 10000, activa: true };
  let e = estadoCon({ ofertas: [ot] }, [a, b]);
  e = ticketReducer(e, { tipo: 'agregar', item: a, cantidad: 1 });
  e = ticketReducer(e, { tipo: 'agregar', item: b, cantidad: 1 });
  e = ticketReducer(e, { tipo: 'ofertaTicket', ofertaId: 5 });
  assert.equal(e.renglones[0].ofertaDescuento, 500);
  e = ticketReducer(e, { tipo: 'quitar', uid: e.renglones[1].uid });
  // Queda $6.050 con IVA < $10.000: Portero::exigirMinimoDeTicket rechaza el guardado.
  assert.equal(e.renglones[0].ofertaDescuento, 0, 'el ticket ya no llega al mínimo de la oferta');
});

test('monto mayorista: el panel mide el umbral con IVA y la API con el neto de lista base', () => {
  const it = item(1, 1000, { precios: [{ listaId: 2, precio: 800, unidadesMinimas: 0 }, { listaId: 1, precio: 1000, unidadesMinimas: 0 }] });
  const catalogo = { listas: [MOSTRADOR, MAYORISTA], montoMayorista: { monto: 40000, modalidadId: 2, modalidad: 'Mayorista', mediosPago: [] } };
  const renglones = [{ ...it, uid: 1, cantidad: 35, precioUnitario: 1000, descuento: 0, listaId: 1 }];
  const total = totalesTicket(renglones).total; // 42.350 con IVA
  // La API: brutoTicket = 35 × 1000 (neto, lista base) = 35.000 < 40.000 → no habilita.
  const sug = sugerenciaPorMonto(renglones, total, catalogo, (k) => indicePrecios([it]).get(k), false);
  assert.equal(sug, null, 'el panel ofrece una lista que la API después rechaza');
});

test('monto mayorista: aplicado, sacar artículos lo deja puesto aunque ya no califique', () => {
  const it = item(1, 1000, { precios: [{ listaId: 2, precio: 800, unidadesMinimas: 0 }, { listaId: 1, precio: 1000, unidadesMinimas: 0 }] });
  const catalogo = { montoMayorista: { monto: 40000, modalidadId: 2, modalidad: 'Mayorista', mediosPago: [] } };
  let e = estadoCon(catalogo, [it]);
  e = ticketReducer(e, { tipo: 'agregar', item: it, cantidad: 50 });  // 50.000 neto base
  e = ticketReducer(e, { tipo: 'monto', modalidadId: 2 });
  assert.equal(e.renglones[0].precioUnitario, 800);
  e = ticketReducer(e, { tipo: 'cantidad', uid: e.renglones[0].uid, valor: 2 }); // 2.000 neto base
  assert.equal(e.renglones[0].precioUnitario, 1000, 'con $2.000 la API rechaza Mayorista por monto');
});

test('reabrir: un renglón de PRESUPUESTO se recotiza al precio de hoy', () => {
  const it = item(1, 1100); // la lista subió de 1000 a 1100 después de cotizar
  let e = estadoCon({}, [it]);
  e = ticketReducer(e, {
    tipo: 'cargar', uid: 2, extras: [],
    renglones: [{
      ...it, uid: 1, cantidad: 3, listaId: 1, lista: 'Mostrador', listaOrigen: 'presupuesto', listaManual: false,
      precioLista: 1000, precioUnitario: 1000, descuento: 0, descuentoBase: 0, ofertaId: null, ofertaDescuento: 0,
    }],
  });
  assert.equal(e.renglones[0].precioUnitario, 1000, 'el precio congelado del presupuesto (la API lo honra)');
});

test('reabrir: el precio por MONTO aplicado se pierde al cambiar de pestaña', () => {
  const it = item(1, 1000, { precios: [{ listaId: 2, precio: 800, unidadesMinimas: 0 }, { listaId: 1, precio: 1000, unidadesMinimas: 0 }] });
  const catalogo = { montoMayorista: { monto: 40000, modalidadId: 2, modalidad: 'Mayorista', mediosPago: [] } };
  let e = estadoCon(catalogo, [it]);
  // Así vuelve el renglón de la API: Portero registra 'monto' cuando el monto del ticket habilitó la lista.
  e = ticketReducer(e, {
    tipo: 'cargar', uid: 2, extras: [],
    renglones: [{
      ...it, uid: 1, cantidad: 50, listaId: 2, lista: 'Mayorista', listaOrigen: 'monto', listaManual: false,
      precioLista: 800, precioUnitario: 800, descuento: 0, descuentoBase: 0, ofertaId: null, ofertaDescuento: 0,
    }],
  });
  assert.equal(e.renglones[0].precioUnitario, 800, 'el cajero aplicó Mayorista por monto y al volver a la pestaña volvió a $1000');
});

/* ---- Cantidades al gramo, no a los 10 g ---- */

test('la etiqueta de balanza de 1,234 kg entra como 1,234 kg', () => {
  const et = parseEtiquetaBalanza('2000123012340', { balanzaHabilitada: true, balanzaPrefijo: '20', balanzaModo: 'peso' });
  assert.equal(et.cantidad, 1.234);
});

test('agregar 0,125 kg de un granel carga 0,125 kg, y repetirlo suma al gramo', () => {
  const it = item(1, 20000, { unidad: 'kg', fraccionable: true });
  let e = estadoCon({}, [it]);
  e = ticketReducer(e, { tipo: 'agregar', item: it, cantidad: 0.125 });
  assert.equal(e.renglones[0].cantidad, 0.125);
  e = ticketReducer(e, { tipo: 'agregar', item: it, cantidad: 0.125 });
  assert.equal(e.renglones[0].cantidad, 0.25);
});

test('r3 redondea al gramo, el medio gramo hacia arriba', () => {
  assert.equal(r3(1.2345), 1.235);
  assert.equal(r3(0.1 + 0.2), 0.3);
  assert.equal(r3(-1.2345), -1.235);
  assert.equal(r3(''), 0);
});
