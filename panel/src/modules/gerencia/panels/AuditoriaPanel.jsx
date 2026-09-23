/**
 * GERENCIA › AUDITORÍA — quién hizo qué.
 * ============================================================================
 * Una línea de tiempo que junta cuatro fuentes (cambios de ficha, anulaciones,
 * reversiones de precios y diferencias de caja) ordenadas por fecha. A
 * propósito NO incluye ajustes de stock: esos ya tienen su propia película
 * completa en Almacén › Existencias e Incidencias.
 */
import { useState } from 'react';
import { httpClient } from '@core/services/httpClient.js';
import { useResource } from '@modules/ventas/hooks/useResource.js';
import { cx } from '@shared/utils/classNames.js';
import { money, fmtFechaHora } from '@modules/productos/domain/format.js';
import { Table, PanelHead, Btn, s } from '@modules/productos/components/ui.jsx';

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TIPOS = {
  cambio: { label: 'Cambio', pill: 'tag-transf' },
  anulacion: { label: 'Anulación', pill: 'tag-baja' },
  reversion_precio: { label: 'Reversión de precios', pill: 'tag-ajuste' },
  diferencia_caja: { label: 'Diferencia de caja', pill: 'est-transito' },
};

export function AuditoriaPanel() {
  const hoy = new Date();
  const [desde, setDesde] = useState(isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate())));
  const [hasta, setHasta] = useState(isoLocal(hoy));
  const [tipo, setTipo] = useState('');

  const { data, loading, error, reload } = useResource(
    `auditoria:${desde}:${hasta}:${tipo}`,
    () => httpClient.get(`/gerencia/auditoria?desde=${desde}&hasta=${hasta}${tipo ? `&tipo=${tipo}` : ''}`),
  );

  if (error) {
    return (
      <div>
        <PanelHead title="Auditoría" desc="Quién hizo qué." />
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
        title="Auditoría"
        desc="Anulaciones, reversiones de precios y diferencias de caja, además de los cambios de ficha ya registrados — todo junto, en orden."
        actions={<Btn variant="btn-ghost" small onClick={reload}>Actualizar</Btn>}
      />

      <div className={s.toolbar}>
        <label className={s['mini-label']} style={{ margin: 0 }}>Desde</label>
        <input type="date" className={s['select-inline']} value={desde} onChange={(e) => setDesde(e.target.value)} />
        <label className={s['mini-label']} style={{ margin: 0 }}>Hasta</label>
        <input type="date" className={s['select-inline']} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        {loading && <span className={s.muted}>Cargando…</span>}
      </div>

      <div className={s.toolbar}>
        <Btn small variant={tipo === '' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTipo('')}>Todos</Btn>
        {Object.entries(TIPOS).map(([k, v]) => (
          <Btn key={k} small variant={tipo === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTipo(k)}>{v.label}</Btn>
        ))}
      </div>

      {!data && loading && <div className={s.muted}>Cargando el período…</div>}

      {data && (
        <>
          {data.recortado > 0 && (
            <div className={s.hint} style={{ margin: 0 }}>
              Se muestran los {data.eventos.length} más recientes de {data.total}. Achicá el período o filtrá por tipo para ver el resto.
            </div>
          )}

          <Table
            cols={[{ h: 'Fecha' }, { h: 'Tipo' }, { h: 'Usuario' }, { h: 'Qué pasó' }, { h: 'Monto', num: true }]}
            empty="Nada que mostrar en este período."
          >
            {data.eventos.map((e, i) => {
              const t = TIPOS[e.tipo] ?? { label: e.tipo, pill: 'tag-transf' };
              return (
                <tr key={i}>
                  <td className={s.mono} style={{ whiteSpace: 'nowrap' }}>{fmtFechaHora(e.fecha)}</td>
                  <td><span className={cx(s.pill, s[t.pill])}>{t.label}</span></td>
                  <td>{e.usuario || <span className={s.muted}>—</span>}</td>
                  <td>{e.resumen}</td>
                  <td className={s.num}>
                    {e.monto != null
                      ? <span style={{ color: e.monto < 0 ? 'var(--crm-color-danger)' : undefined }}>{money(e.monto)}</span>
                      : <span className={s.muted}>—</span>}
                  </td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </div>
  );
}
