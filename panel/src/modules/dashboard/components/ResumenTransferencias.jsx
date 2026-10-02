import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '@shared/utils/classNames.js';
import { httpClient } from '@core/services/httpClient.js';
import { fmtFecha } from '@modules/productos/domain/format.js';
import { s } from '@modules/productos/components/ui.jsx';

/**
 * TRANSFERENCIAS PENDIENTES — Pymes y Corporativo (Emprendedor no tiene
 * transferencias entre sucursales, ver `PlanCatalogo::EMPRENDEDOR`). Llama a
 * `/transferencias/pendientes-resumen`, que cuenta `pendiente` + `preparada`
 * + `transito` del lado del servidor — el mismo recorte de "abiertas" que ya
 * usa el panel de Almacén, no uno nuevo inventado para el Dashboard.
 *
 * No hay un `transferenciasApi` plano como `ventasApi`: el módulo de
 * Almacén/Inventario expone todo a través de `inventoryStore`, pensado para
 * las pantallas que viven dentro de `ProductosProvider`. Esta tarjeta, como
 * `ResumenCobranzas`/`ResumenPresupuestos`, vive afuera de ese contexto —
 * pide directo con `httpClient`, sin sumar el store completo solo para esto.
 */
export function ResumenTransferencias() {
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    let vivo = true;
    httpClient.get('/transferencias/pendientes-resumen')
      .then((r) => { if (vivo) setResumen(r); })
      .catch(() => { if (vivo) setResumen(null); });
    return () => { vivo = false; };
  }, []);

  if (!resumen) return null;

  const total = resumen.pendiente + resumen.preparada + resumen.transito;

  return (
    <div className={cx(s.card, s.cardPad)}>
      <h3 className={s['card-title']}>
        Transferencias pendientes
        <button
          type="button"
          className={s.link}
          style={{ all: 'unset', cursor: 'pointer' }}
          onClick={() => navigate('/almacen?panel=transferencias')}
        >
          <span className={s.link}>Ver todo →</span>
        </button>
      </h3>
      {total === 0 ? (
        <div className={cx(s.callout, s.ok)} style={{ margin: 0 }}>Sin transferencias pendientes.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--crm-space-5)', flexWrap: 'wrap', marginBottom: 'var(--crm-space-3)' }}>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Pendientes</div>
              <strong style={{ fontSize: 19 }}>{resumen.pendiente}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>En preparación</div>
              <strong style={{ fontSize: 19 }}>{resumen.preparada}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>En tránsito</div>
              <strong style={{ fontSize: 19 }}>{resumen.transito}</strong>
            </div>
          </div>
          {resumen.masAntiguas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className={s.muted} style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Esperando hace más tiempo
              </div>
              {resumen.masAntiguas.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                  <span>{t.codigo} <span className={s.muted}>· {t.origenNombre} → {t.destinoNombre}</span></span>
                  <span className={s.muted}>{fmtFecha(t.fecha)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
