/**
 * EXPORTAR UNA LISTA A EXCEL (.xlsx) O PDF — un solo lugar para todas las pantallas
 * ============================================================================
 * Las pantallas describen QUÉ exportar —columnas y filas— y este archivo se
 * ocupa del CÓMO. Las dos librerías se cargan recién al exportar (`import()`
 * dinámico): pesan cientos de kB y casi nadie exporta en cada sesión, así que
 * no engordan la carga del panel.
 *
 * Modelo de datos (el mismo para los dos formatos):
 *   columnas: [{ h: 'Producto', tipo: 'texto' | 'numero' | 'moneda' | 'entero' | 'id', ancho: 32 }]
 *   filas:    [[valor, valor, …], …]   — los NÚMEROS van como número, no como texto.
 *
 * Por qué importa lo del número: en el Excel una celda numérica se puede
 * sumar, ordenar y filtrar; una que dice "1.234,50" como texto no. En el PDF
 * se formatea a la argentina (coma decimal, punto de miles).
 *
 * Para Excel que ya existía (`csv.js`) sigue valiendo: abre en Excel, pero es
 * texto plano sin formato ni anchos. Esto es el .xlsx de verdad.
 */

// `id`: un código (nº de producto) — número, pero sin separador de miles ni decimales.
const FORMATO_EXCEL = { moneda: '#,##0.00', numero: '#,##0.00', entero: '#,##0', id: '0' };

const hoyIso = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function bajar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar en el mismo tick puede cortar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** El nombre de la hoja de Excel: máximo 31 caracteres y sin `\ / ? * [ ] :`. */
const nombreHoja = (t) => String(t || 'Lista').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

function celdaExcel(valor, col) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (col.tipo !== 'texto' && esNumero(valor)) {
    return { value: valor, type: Number, format: FORMATO_EXCEL[col.tipo] || FORMATO_EXCEL.numero };
  }
  return { value: String(valor), type: String };
}

/**
 * Baja un `.xlsx` con la lista. `archivo` va sin extensión ni fecha:
 * `exportarExcel({ archivo: 'clientes', … })` → `clientes-2026-10-02.xlsx`.
 */
export async function exportarExcel({ archivo, hoja, columnas, filas }) {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const encabezado = columnas.map((c) => ({
    value: c.h, type: String, fontWeight: 'bold', backgroundColor: '#e5e7eb',
  }));
  const cuerpo = filas.map((f) => columnas.map((c, i) => celdaExcel(f[i], c)));
  const blob = await writeExcelFile([encabezado, ...cuerpo], {
    sheet: nombreHoja(hoja),
    columns: columnas.map((c) => ({ width: c.ancho ?? 16 })),
    // La fila de títulos queda fija al bajar por una lista larga.
    stickyRowsCount: 1,
  }).toBlob();
  bajar(blob, `${archivo}-${hoyIso()}.xlsx`);
}

const fmtAr = (n, dec) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function textoPdf(valor, col) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (esNumero(valor) && col.tipo === 'id') return String(valor);
  if (esNumero(valor) && col.tipo !== 'texto') return fmtAr(valor, col.tipo === 'entero' ? 0 : 2);
  return String(valor);
}

/**
 * Baja un `.pdf` A4 con la lista: membrete (empresa), título, fecha, los
 * filtros que estaban aplicados y la tabla, con los títulos repetidos en cada
 * hoja y "Página X de Y" al pie.
 *
 * `filtros` es un texto libre ("Solo activos · Marca: Arcor"): un PDF suelto
 * se separa de la pantalla de la que salió, y sin esto nadie sabe si esa
 * lista era el catálogo entero o un recorte.
 */
export async function exportarPdf({ archivo, titulo, empresa = '', filtros = '', columnas, filas }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // Muchas columnas no entran de pie: se pasa a apaisado.
  const apaisado = columnas.length > 6;
  const doc = new jsPDF({ orientation: apaisado ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 12;

  let y = 14;
  if (empresa) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(String(empresa), margen, y);
    y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(String(titulo), margen, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  const ahora = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  doc.text(`${ahora} · ${filas.length} ${filas.length === 1 ? 'registro' : 'registros'}`, ancho - margen, y, { align: 'right' });
  y += 5;
  if (filtros) {
    const lineas = doc.splitTextToSize(String(filtros), ancho - margen * 2);
    doc.text(lineas, margen, y);
    y += lineas.length * 4;
  }
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: margen, right: margen, bottom: 14 },
    head: [columnas.map((c) => c.h)],
    body: filas.map((f) => columnas.map((c, i) => textoPdf(f[i], c))),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: Object.fromEntries(columnas.map((c, i) => [i, {
      halign: c.tipo === 'texto' ? 'left' : 'right',
      ...(c.anchoPdf ? { cellWidth: c.anchoPdf } : {}),
    }])),
    // Los títulos de las columnas numéricas también van a la derecha, sobre su número.
    didParseCell: (d) => {
      if (d.section === 'head' && columnas[d.column.index]?.tipo !== 'texto') d.cell.styles.halign = 'right';
    },
  });

  const paginas = doc.getNumberOfPages();
  const alto = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i);
    doc.text(`Página ${i} de ${paginas}`, ancho / 2, alto - 6, { align: 'center' });
  }

  bajar(doc.output('blob'), `${archivo}-${hoyIso()}.pdf`);
}
