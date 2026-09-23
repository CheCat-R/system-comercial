/**
 * GERENCIA › REPORTES DE VENTAS — cómo viene el mostrador.
 * ============================================================================
 * A diferencia de Rentabilidad (el margen, que depende del costo congelado),
 * esto es pura foto de lo vendido: cuánto, cuántos tickets, por dónde entró
 * la plata y contra qué período de igual largo se compara. No hay "cobertura"
 * ni renglones que quedan afuera — por eso el panel es más simple.
 */
import { useState } from 'react';
import { httpClient } from '@core/services/httpClient.js';
import { useResource } from '@modules/ventas/hooks/useResource.js';
import { cx } from '@shared/utils/classNames.js';
import { money, num } from '@modules/productos/domain/format.js';
import { Table, PanelHead, Btn, s } from '@modules/productos/components/ui.jsx';

/** Primer día del mes y hoy, en 'AAAA-MM-DD' LOCAL (toISOString corre el día). */
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MEDIOS = {
  efectivo: 'Efectivo', tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito',
  transferencia: 'Transferencia', cuenta_corriente: 'Cuenta corriente', cheque: 'Cheque', otro: 'Otro',
};

function Stat({ label, valor, variacion, detalle, tono }) {
  const color = tono === 'ok' ? 'var(--crm-color-success)' : tono === 'err' ? 'var(--crm-color-danger)' : undefined;
  return (
    <div className={cx(s.card, s.cardPad)} style={{ minWidth: 170, flex: 1 }}>
      <div className={s['mini-label']}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <strong className={s.mono} style={{ fontSize: 18, color }}>{valor}</strong>
        {variacion != null && (
          <span style={{ fontSize: 12, fontWeight: 600, color: variacion >= 0 ? 'var(--crm-color-success)' : 'var(--crm-color-danger)' }}>
            {variacion >= 0 ? '▲' : '▼'} {num(Math.abs(variacion), 1)}%
          </span>
        )}
      </div>
      {detalle && <div className={s.hint} style={{ margin: '4px 0 0' }}>{detalle}</div>}
    </div>
  );
}

/** Barras chicas, sin librería: la altura es proporcional al día de más venta del período. */
function BarrasPorDia({ dias }) {
  const ALTO = 110;
  if (!dias.length) return null;
  const max = Math.max(1, ...dias.map((d) => d.ventaNeta));
  return (
    <div className={cx(s.card, s.cardPad)}>
      <div className={s['mini-label']} style={{ marginBottom: 8 }}>Venta por día</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: dias.length > 40 ? 1 : 3, height: ALTO }}>
        {dias.map((d) => (
          <div
            key={d.fecha}
            title={`${d.fecha} — ${money(d.ventaNeta)} · ${d.tickets} ticket(s)`}
            style={{
              flex: 1, minWidth: 2, height: Math.max(2, (d.ventaNeta / max) * ALTO),
              background: 'var(--crm-color-primary)', borderRadius: '2px 2px 0 0', opacity: d.ventaNeta > 0 ? 1 : 0.15,
            }}
          />
        ))}
      </div>
      <div className={s.hint} style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0 0' }}>
        <span>{dias[0].fecha}</span>
        <span>{dias[dias.length - 1].fecha}</span>
      </div>
    </div>
  );
}

export function ReportesVentasPanel() {
  const hoy = new Date();
  const [desde, setDesde] = useState(isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoLocal(hoy));

  const { data, loading, error, reload } = useResource(
    `reportes-ventas:${desde}:${hasta}`,
    () => httpClient.get(`/gerencia/reportes-ventas?desde=${desde}&hasta=${hasta}`),
  );

  if (error) {
    return (
      <div>
        <PanelHead title="Reportes de ventas" desc="Cómo viene el mostrador." />
        <div className={cx(s.callout, s.warn)}>
          No se pudo cargar: <strong>{String(error?.data?.message || error?.message || error)}</strong>
          <div style={{ marginTop: 8 }}><Btn small variant="btn-primary" onClick={reload}>Reintentar</Btn></div>
        </div>
      </div>
    );
  }

  const r = data?.resumen;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead
        title="Reportes de ventas"
        desc="Ventas por día, sucursal y vendedor; tickets, medios de pago y comparativa contra el período anterior."
        actions={<Btn variant="btn-ghost" small onClick={reload}>Actualizar</Btn>}
      />

      <div className={s.toolbar}>
        <label className={s['mini-label']} style={{ margin: 0 }}>Desde</label>
        <input type="date" className={s['select-inline']} value={desde} onChange={(e) => setDesde(e.target.value)} />
        <label className={s['mini-label']} style={{ margin: 0 }}>Hasta</label>
        <input type="date" className={s['select-inline']} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        {loading && <span className={s.muted}>Cargando…</span>}
      </div>

      {!data && loading && <div className={s.muted}>Cargando el período…</div>}

      {data && (
        <>
          <div className={s.hint} style={{ margin: 0 }}>
            Comparado contra el período inmediato anterior, del mismo largo ({data.anterior.periodo.desde.slice(0, 10)} a {data.anterior.periodo.hasta.slice(0, 10)}).
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat
              label="Venta neta" valor={money(r.ventaNeta)} variacion={data.variacionVentaPct}
              detalle="Bruto vendido menos notas de crédito del período."
            />
            <Stat
              label="Tickets" valor={num(r.tickets, 0)} variacion={data.variacionTicketsPct}
              detalle={r.devoluciones > 0 ? `${r.devoluciones} nota(s) de crédito` : 'Sin devoluciones en el período'}
            />
            <Stat label="Ticket promedio" valor={money(r.ticketPromedio)} detalle="Venta bruta ÷ tickets." />
            <Stat
              label="Devuelto" valor={money(r.devuelto)} tono={r.devuelto > 0 ? 'err' : undefined}
              detalle={r.ventaBruta > 0 ? `${num((r.devuelto / r.ventaBruta) * 100, 1)}% de lo vendido` : undefined}
            />
          </div>

          <BarrasPorDia dias={data.porDia} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {data.porSucursal.length > 0 && (
              <div style={{ flex: 1, minWidth: 280 }}>
                <div className={s['section-title']}>Por sucursal</div>
                <Table cols={[{ h: 'Sucursal' }, { h: 'Venta neta', num: true }, { h: 'Tickets', num: true }, { h: 'Promedio', num: true }]}>
                  {data.porSucursal.map((x) => (
                    <tr key={x.sucursalId ?? 'sin'}>
                      <td>{x.sucursal}</td>
                      <td className={s.num}>{money(x.ventaNeta)}</td>
                      <td className={s.num}>{x.tickets}</td>
                      <td className={s.num}>{money(x.ticketPromedio)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}

            <div style={{ flex: 1, minWidth: 280 }}>
              <div className={s['section-title']}>Por vendedor</div>
              <Table
                cols={[{ h: 'Vendedor' }, { h: 'Venta neta', num: true }, { h: 'Tickets', num: true }, { h: 'Promedio', num: true }]}
                empty="Sin ventas en el período."
              >
                {data.porVendedor.map((x) => (
                  <tr key={x.usuarioId ?? 'sin'}>
                    <td>{x.usuario}</td>
                    <td className={s.num}>{money(x.ventaNeta)}</td>
                    <td className={s.num}>{x.tickets}</td>
                    <td className={s.num}>{money(x.ticketPromedio)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div className={s['section-title']}>Por medio de pago</div>
              <Table cols={[{ h: 'Medio' }, { h: 'Importe', num: true }, { h: '%', num: true }]} empty="Sin cobros en el período.">
                {data.porMedioPago.map((x) => (
                  <tr key={x.medio}>
                    <td>{MEDIOS[x.medio] ?? x.medio}</td>
                    <td className={s.num}>{money(x.importe)}</td>
                    <td className={s.num}>{num(x.participacionPct, 1)}%</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>

          <div>
            <div className={s['section-title']}>Top productos</div>
            <Table cols={[{ h: 'Producto' }, { h: 'Unidades', num: true }, { h: 'Venta neta', num: true }]} empty="Sin ventas en el período.">
              {data.topProductos.map((x) => (
                <tr key={x.productoId}>
                  <td>{x.nombre}</td>
                  <td className={s.num}>{num(x.unidades, 2)}</td>
                  <td className={s.num}>{money(x.ventaNeta)}</td>
                </tr>
              ))}
            </Table>
            {data.topProductos.length >= 15 && (
              <div className={s.hint}>Se muestran los 15 productos con más venta neta del período.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
