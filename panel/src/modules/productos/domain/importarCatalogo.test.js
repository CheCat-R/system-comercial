/**
 * Desde la migración 0053 el paquete fraccionado tiene FORMATO DE VENTA PROPIO (el `recargo` se borró): el plan de
 * importación tiene que mandarlo en `listas` de cada presentación, o el paquete se crea sin precio y el POS lo bloquea.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarPlan } from './importarCatalogo.js';

const maestro = [
  { Codigo: 'A1', Concepto: 'ALMENDRAS MADRE', TipoProducto: '1', MedidaStock: 'Kilos', IVAP1: '21', CodBar: '', Marca: 'GRANEL', IVA: '21' },
  { Codigo: 'A1-250', Concepto: 'ALMENDRAS X250G', TipoProducto: '22', IVAP1: '21', CodBar: '7790001234567', CostoFinal: '3025' },
];
const compras = [{ Codigo: 'A1', PrecioLista: '10000', Cantidad: '1', CostoFlete: '0', PorcDesc: '0', PorcDesc2: '0', PorcDesc3: '0', PorcDesc4: '0', Proveedor: 'DISTRI', CodigoPrv: 'X1' }];
const ventas = [
  { Codigo: 'A1', NroLista: '1', MarkUp: '48', VPrecioFinal: '17600' },
  { Codigo: 'A1-250', NroLista: '1', MarkUp: '66', VPrecioFinal: '4700' },
];
test('armarPlan: cada paquete fraccionado viaja con su formato de venta (listas) para que quede con precio', () => {
  const plan = armarPlan({ maestro, compras, ventas }, { listaMinorista: 7, listaMayorista: null, redondeo: 1 });
  assert.equal(plan.items.length, 1);
  const pres = plan.items[0].presentaciones;
  assert.equal(pres.length, 1, 'el paquete de 250 g tiene que importarse');
  assert.ok(
    Array.isArray(pres[0].listas) && pres[0].listas.length > 0,
    'La presentación del plan no trae `listas`: la API la crea sin formato de venta y el paquete queda sin precio. '
    + `Claves que sí manda: ${Object.keys(pres[0]).join(', ')}.`,
  );
  assert.equal(pres[0].listas[0].listaId, 7);
  assert.equal(pres[0].listas[0].markup, 66);
});
