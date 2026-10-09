import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutaInterna } from './rutaInterna.js';

test('rutaInterna deja pasar solo rutas del propio sitio', () => {
  assert.equal(rutaInterna('/ventas'), '/ventas');
  assert.equal(rutaInterna('/ventas?panel=pos#x'), '/ventas?panel=pos#x');
  assert.equal(rutaInterna('/'), '/');
});

test('rutaInterna rechaza lo que saca del sitio', () => {
  for (const malo of ['//sitio-malo.com', '/\\sitio-malo.com', 'https://sitio-malo.com', 'javascript:alert(1)', 'ventas', '', null, undefined, 42, {}]) {
    assert.equal(rutaInterna(malo), null, String(malo));
  }
});