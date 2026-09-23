/**
 * GERENCIA › VALORIZACIÓN DE STOCK — cuánta plata hay parada en mercadería.
 * ============================================================================
 * Es una FOTO de HOY, no un período: no hay filtro de fechas porque no tiene
 * sentido preguntar "cuánto stock había el 3 de marzo" con este número — para
 * eso está el historial de movimientos. Cada producto se valúa a su costo
 * ACTUAL (el mismo criterio que Rentabilidad usa para el stock sin factura):
 * si el costo cambia, este número cambia con él.
 */
import { useState } from 'react';
import { httpClient } from '@core/services/httpClient.js';
import { useResource } from '@modules/ventas/hooks/useResource.js';
import { cx } from '@shared/utils/classNames.js';
import { money, num } from '@modules/productos/domain/format.js';
import { ESTADOS_STOCK } from '@modules/productos/domain/constants.js';
import { Table, PanelHead, Btn, usePaginado, Paginador, s } from '@modules/productos/components/ui.jsx';

const LENTES = {
  producto: { label: 'Producto', clave: (x) => `p${x.productoId}`, nombre: (x) => x.nombre },
  marca: { label: 'Marca', clave: (x) => `m${x.marcaId ?? 0}`, nombre: (x) => x.marca || 'Sin marca' },
  categoria: { label: 'Categoría', clave: (x) => `c${x.categoriaId ?? 0}`, nombre: (x) => x.categoria || 'Sin categoría' },
  proveedor: { label: 'Proveedor', clave: (x) => `v${x.proveedorId ?? 0}`, nombre: (x) => x.proveedor || 'Sin proveedor' },
};

function Stat({ label, valor, detalle, tono }) {
  const color = tono === 'ok' ? 'var(--crm-color-success)' : tono === 'err' ? 'var(--crm-color-danger)'
    : tono === 'warn' ? 'var(--crm-color-warning, #b45309)' : undefined;
  return (
    <div className={cx(s.card, s.cardPad)} style={{ minWidth: 170, flex: 1 }}>
      <div className={s['mini-label']}>{label}</div>
      <strong className={s.mono} style={{ fontSize: 18, color }}>{valor}</strong>
      {detalle && <div className={s.hint} style={{ margin: '4px 0 0' }}>{detalle}</div>}
    </div>
  );
}

export function ValorizacionPanel() {
  const [lente, setLente] = useState('producto');
  const { data, loading, error, reload } = useResource('valorizacion', () => httpClient.get('/gerencia/valorizacion'));

  const filas = (() => {
    const base = data?.porProducto ?? [];
    if (lente === 'producto') return base;
    const L = LENTES[lente];
    const grupos = new Map();
    for (const x of base) {
      const k = L.clave(x);
      const g = grupos.get(k) ?? { nombre: L.nombre(x), productos: 0, unidades: 0, valor: 0, sinCosto: false };
      g.productos += 1;
      g.unidades += x.unidades;
      g.valor += x.valor;
      g.sinCosto = g.sinCosto || x.sinCosto;
      grupos.set(k, g);
    }
    return [...grupos.values()].sort((a, b) => b.valor - a.valor);
  })();

  const pag = usePaginado(filas, 'valorizacion', lente);

  if (error) {
    return (
      <div>
        <PanelHead title="Valorización de stock" desc="Cuánta plata hay parada en mercadería, al costo de hoy." />
        <div className={cx(s.callout, s.warn)}>
          No se pudo cargar: <strong>{String(error?.data?.message || error?.message || error)}</strong>
          <div style={{ marginTop: 8 }}><Btn small variant="btn-primary" onClick={reload}>Reintentar</Btn></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead
        title="Valorización de stock"
        desc="Cuánta plata hay parada en mercadería, valuada al costo de hoy — por sucursal y por estado."
        actions={<Btn variant="btn-ghost" small onClick={reload}>Actualizar</Btn>}
      />

      {loading && !data && <div className={s.muted}>Cargando…</div>}

      {data && (
        <>
          {data.sinCosto.productos > 0 && (
            <div className={cx(s.callout, s.info)}>
              <strong>{data.sinCosto.productos}</strong> producto(s) con stock no tienen un costo activo cargado
              (sin formato de compra marcado &quot;usar para precio&quot;) y valen <strong>$0</strong> en este número —
              no es que no valgan, es que el sistema no sabe cuánto. Cargales el costo en Compras › Costos y percepciones.
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="Valor total" valor={money(data.total.valor)} detalle="Todo el stock, todos los estados, al costo de hoy." />
            <Stat label="Productos con stock" valor={num(data.total.productos, 0)} />
            {data.sinCosto.productos > 0 && (
              <Stat label="Sin costo cargado" valor={num(data.sinCosto.productos, 0)} tono="warn" detalle="No suman al valor total." />
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {data.porSucursal.length > 1 && (
              <div style={{ flex: 1, minWidth: 260 }}>
                <div className={s['section-title']}>Por sucursal</div>
                <Table cols={[{ h: 'Sucursal' }, { h: 'Valor', num: true }, { h: 'Productos', num: true }]}>
                  {data.porSucursal.map((x) => (
                    <tr key={x.sucursalId ?? 'sin'}>
                      <td>{x.sucursal}</td>
                      <td className={s.num}>{money(x.valor)}</td>
                      <td className={s.num}>{x.productos}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}

            <div style={{ flex: 1, minWidth: 260 }}>
              <div className={s['section-title']}>Por estado</div>
              <Table cols={[{ h: 'Estado' }, { h: 'Valor', num: true }, { h: 'Productos', num: true }]}>
                {data.porEstado.map((x) => {
                  const est = ESTADOS_STOCK[x.estado] ?? { label: x.estado, pill: 'st-disponible' };
                  return (
                    <tr key={x.estado}>
                      <td><span className={cx(s.pill, s[est.pill])}>{est.label}</span></td>
                      <td className={s.num}>{money(x.valor)}</td>
                      <td className={s.num}>{x.productos}</td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </div>

          <div className={s.toolbar}>
            {Object.entries(LENTES).map(([k, v]) => (
              <Btn key={k} small variant={lente === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setLente(k)}>
                {v.label}
              </Btn>
            ))}
          </div>

          <Table
            cols={[
              { h: LENTES[lente].label },
              ...(lente !== 'producto' ? [{ h: 'Prod.', num: true }] : []),
              { h: 'Unidades', num: true }, { h: 'Costo unit.', num: true }, { h: 'Valor', num: true },
            ]}
            empty="Sin stock valuado."
            pag={pag}
          >
            {pag.visibles.map((x, i) => (
              <tr key={x.productoId ?? `${lente}-${i}`}>
                <td>
                  {x.nombre}
                  {x.sinCosto && <span className={s.hint} style={{ margin: 0 }}> · sin costo</span>}
                </td>
                {lente !== 'producto' && <td className={s.num}>{x.productos}</td>}
                <td className={s.num}>{num(x.unidades, 2)}</td>
                {lente === 'producto'
                  ? <td className={s.num}>{x.costoUnitario > 0 ? money(x.costoUnitario) : <span className={s.muted}>—</span>}</td>
                  : <td className={s.num}><span className={s.muted}>—</span></td>}
                <td className={s.num}>{money(x.valor)}</td>
              </tr>
            ))}
          </Table>
          <Paginador pag={pag} />
        </>
      )}
    </div>
  );
}
