import { useState } from 'react';
import { Menu, MenuItem, ListItemText } from '@mui/material';
import { configImpresion } from '@core/services/imprimir.js';
import { exportarExcel, exportarPdf } from '@shared/utils/exportar.js';
import { Btn, s } from './ui.jsx';

/**
 * EL BOTÓN «EXPORTAR» de las listas (productos, clientes, proveedores): un
 * menú con Excel (.xlsx) y PDF. Cada pantalla le dice QUÉ exportar y el resto
 * —armar el archivo, el membrete de la empresa, bajarlo— es de acá.
 *
 *  - `obtenerFilas` es una FUNCIÓN y no un array: se llama al hacer clic, con
 *    los filtros que haya en ese momento. Exporta la lista COMPLETA filtrada
 *    —todas las páginas—, no solo la que se ve en pantalla.
 *  - `filtros` describe lo que estaba aplicado y sale impreso en el PDF.
 */
export function ExportarMenu({ archivo, titulo, columnas, obtenerFilas, filtros = '', disabled = false }) {
  // El ancla del menú es el botón: `Btn` no reenvía `ref`, así que se toma del clic.
  const [ancla, setAncla] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  const exportar = async (formato) => {
    setAncla(null);
    setError('');
    setTrabajando(true);
    try {
      const filas = obtenerFilas();
      if (!filas.length) { setError('No hay nada para exportar con estos filtros.'); return; }
      if (formato === 'excel') {
        await exportarExcel({ archivo, hoja: titulo, columnas, filas });
      } else {
        let empresa = '';
        try { empresa = (await configImpresion()).empresa?.nombre || ''; } catch { /* sin membrete: sale igual */ }
        await exportarPdf({ archivo, titulo, empresa, filtros, columnas, filas });
      }
    } catch {
      setError('No se pudo generar el archivo. Probá de nuevo.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <Btn small disabled={disabled || trabajando} onClick={(e) => setAncla(e.currentTarget)} aria-haspopup="menu">
        {trabajando ? 'Generando…' : 'Exportar ▾'}
      </Btn>
      {error && <span className={s.hint} role="status" style={{ margin: 0, color: 'var(--crm-color-danger, #b91c1c)' }}>{error}</span>}
      <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={() => setAncla(null)}>
        <MenuItem onClick={() => exportar('excel')}><ListItemText primary="Excel (.xlsx)" /></MenuItem>
        <MenuItem onClick={() => exportar('pdf')}><ListItemText primary="PDF" /></MenuItem>
      </Menu>
    </>
  );
}
