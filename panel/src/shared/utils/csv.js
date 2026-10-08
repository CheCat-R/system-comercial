/**
 * EXPORTAR A CSV — un solo lugar para todas las pantallas
 * ============================================================================
 * Dos detalles que parecen menores y no lo son, porque el destino real de estos
 * archivos es Excel en Windows en español:
 *
 *   · BOM al principio (U+FEFF): sin él Excel abre el archivo en su
 *     codificación vieja y "Yerba Orgánica" sale "Yerba OrgÃ¡nica".
 *   · `;` como separador: con coma decimal argentina, la coma ya está ocupada,
 *     así que un CSV separado por comas parte los números en dos columnas.
 *
 * Los números van con `csvNum` (coma decimal) por la misma razón: con punto,
 * Excel en español lee 1.5 como 15.
 */

/**
 * Un texto que EMPIEZA con `=`, `+`, `-`, `@` (o un tab / retorno) lo evalúa Excel como una FÓRMULA al abrir el
 * archivo: el nombre de un cliente que vino de internet (`=HYPERLINK("https://…"&A2;"Ver")`) podía sacar datos
 * del libro con un clic. Se le antepone `'` para que sea texto. Los NÚMEROS (`-12,50` de `csvNum`) no se tocan.
 */
const ES_NUMERO = /^-?[\d.,]+$/;
const EMPIEZA_FORMULA = /^[=+\-@\t\r]/;

/** Escapa un valor: neutraliza fórmulas, y entrecomilla si trae `"`, `;` o salto de línea. */
export function esc(v) {
  let t = String(v ?? '');
  if (EMPIEZA_FORMULA.test(t) && !ES_NUMERO.test(t)) t = `'${t}`;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Número con coma decimal y dos decimales, como lo espera Excel en español. */
export function csvNum(n, dec = 2) {
  return String(Number(n ?? 0).toFixed(dec)).replace('.', ',');
}

/** Arma el CSV y lo baja. `filas` es un array de arrays, en el orden de `encabezados`. */
export function descargarCsv(nombre, encabezados, filas) {
  const cuerpo = [encabezados, ...filas].map((f) => f.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + cuerpo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}
