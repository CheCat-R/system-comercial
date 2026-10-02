import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '@shared/utils/classNames.js';
import { ventasApi } from '@modules/ventas/services/ventas.api.js';
import { money, fmtFecha } from '@modules/productos/domain/format.js';
import { s } from '@modules/productos/components/ui.jsx';

/**
 * PRESUPUESTOS — Pymes y Corporativo (Emprendedor no tiene presupuestos, ver
 * `PlanCatalogo::EMPRENDEDOR`). Llama a `/presupuestos/pendientes-resumen`,
 * que cuenta por estado del lado del servidor con el MISMO cálculo de
 * "vencido" que ya usa el detalle de cada presupuesto — no hay una segunda
 * regla de fechas que algún día pueda decir algo distinto.
 */
export function ResumenPresupuestos() {
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    let vivo = true;
    ventasApi.presupuestosPendientesResumen()
      .then((r) => { if (vivo) setResumen(r); })
      .catch(() => { if (vivo) setResumen(null); });
    return () => { vivo = false; };
  }, []);

  if (!resumen) return null;

  const total = resumen.borrador + resumen.confirmado + resumen.enviadoVigente + resumen.enviadoVencido;

  return (
    <div className={cx(s.card, s.cardPad)}>
      <h3 className={s['card-title']}>
        Presupuestos
        <button
          type="button"
          className={s.link}
          style={{ all: 'unset', cursor: 'pointer' }}
          onClick={() => navigate('/ventas?panel=presupuestos')}
        >
          <span className={s.link}>Ver todo →</span>
        </button>
      </h3>
      {total === 0 ? (
        <div className={cx(s.callout, s.ok)} style={{ margin: 0 }}>Sin presupuestos en curso.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--crm-space-5)', flexWrap: 'wrap', marginBottom: 'var(--crm-space-3)' }}>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Borrador</div>
              <strong style={{ fontSize: 19 }}>{resumen.borrador}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Enviados</div>
              <strong style={{ fontSize: 19 }}>{resumen.enviadoVigente}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12, color: resumen.enviadoVencido ? 'var(--crm-color-danger)' : undefined }}>Vencidos</div>
              <strong style={{ fontSize: 19, color: resumen.enviadoVencido ? 'var(--crm-color-danger)' : undefined }}>{resumen.enviadoVencido}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Confirmados</div>
              <strong style={{ fontSize: 19 }}>{resumen.confirmado}</strong>
            </div>
          </div>
          {resumen.porVencer.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className={s.muted} style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Vencen pronto
              </div>
              {resumen.porVencer.map((pr) => (
                <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                  <span>{pr.clienteNombre} <span className={s.muted}>· vence {fmtFecha(pr.vencimiento)}</span></span>
                  <strong>{money(pr.total)}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
