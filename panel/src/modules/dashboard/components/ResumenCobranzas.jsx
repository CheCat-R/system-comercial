import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '@shared/utils/classNames.js';
import { ventasApi } from '@modules/ventas/services/ventas.api.js';
import { money } from '@modules/productos/domain/format.js';
import { s } from '@modules/productos/components/ui.jsx';

/**
 * COBRANZAS PENDIENTES — Pymes y Corporativo (Emprendedor no tiene cuenta
 * corriente de clientes, ver `PlanCatalogo::EMPRENDEDOR`). Llama a
 * `/cobranzas/pendientes-resumen`, que reusa `VentasService::cuenta()`
 * cliente por cliente del lado del servidor — el mismo saldo que ve el
 * cajero en la ficha de cada cliente, no un número calculado aparte.
 */
export function ResumenCobranzas() {
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    let vivo = true;
    ventasApi.cobranzasPendientesResumen()
      .then((r) => { if (vivo) setResumen(r); })
      .catch(() => { if (vivo) setResumen(null); });
    return () => { vivo = false; };
  }, []);

  if (!resumen) return null;

  return (
    <div className={cx(s.card, s.cardPad)}>
      <h3 className={s['card-title']}>
        Cobranzas pendientes
        <button
          type="button"
          className={s.link}
          style={{ all: 'unset', cursor: 'pointer' }}
          onClick={() => navigate('/ventas?panel=cobranzas')}
        >
          <span className={s.link}>Ver todo →</span>
        </button>
      </h3>
      {resumen.clientes === 0 ? (
        <div className={cx(s.callout, s.ok)} style={{ margin: 0 }}>Sin cobranzas pendientes.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--crm-space-6)', marginBottom: 'var(--crm-space-3)' }}>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Total pendiente</div>
              <strong style={{ fontSize: 19 }}>{money(resumen.saldo)}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Clientes</div>
              <strong style={{ fontSize: 19 }}>{resumen.clientes}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resumen.masDeuda.map((c) => (
              <div key={c.clienteId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span>{c.clienteNombre}</span>
                <strong>{money(c.saldo)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
