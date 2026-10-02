import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '@shared/utils/classNames.js';
import { leerSesion } from '@core/auth/sesion.js';
import { ventasApi } from '@modules/ventas/services/ventas.api.js';
import { isoDate, money, fmtFechaHora } from '@modules/productos/domain/format.js';
import { Stat, s } from '@modules/productos/components/ui.jsx';

/**
 * VENTAS DE HOY Y CAJA — lo primero que se mira al abrir el sistema, junto al
 * inventario. Llama a los MISMOS endpoints que ya usan Ventas › Ventas y
 * Ventas › Caja (`listadoVentas` con `desde`/`hasta` de hoy, `cajaActual` de
 * la sucursal de la sesión) — nada nuevo del lado del servidor.
 *
 * Disponible en los 3 planes sin ningún chequeo de plan: Emprendedor ya tiene
 * `ventas.listado` y `ventas.caja` en su base (ver `PlanCatalogo::EMPRENDEDOR`),
 * así que esto lo decide solo el permiso de rol — como el resto del sistema.
 *
 * La caja es de la sucursal de ESTA sesión (`leerSesion().sucursal`), no una
 * cuenta agregada de toda la empresa: un turno abierto/cerrado no se suma
 * entre locales, es un estado puntual de cada uno.
 */
export function ResumenVentasHoy() {
  const navigate = useNavigate();
  const sucursal = leerSesion()?.sucursal;
  const [totales, setTotales] = useState(null);
  const [caja, setCaja] = useState(null);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let vivo = true;
    const hoy = isoDate(new Date());
    Promise.all([
      ventasApi.listadoVentas({ desde: hoy, hasta: hoy, limit: 1 }).catch(() => null),
      sucursal?.id ? ventasApi.cajaActual(sucursal.id).catch(() => null) : Promise.resolve(null),
    ]).then(([v, c]) => {
      if (!vivo) return;
      setTotales(v?.totales ?? null);
      setCaja(c);
      setCargado(true);
    });
    return () => { vivo = false; };
  }, [sucursal?.id]);

  // Primera carga: sin cartel propio — el de "Cargando datos…" de abajo alcanza.
  if (!cargado) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <div className={s.stats}>
        <Stat label="Vendido hoy" value={money(totales?.plata ?? 0)} accent="accent-green" />
        <Stat label="Tickets hoy" value={totales?.tickets ?? 0} />
        <Stat label="Ticket promedio" value={money(totales?.promedio ?? 0)} />
      </div>

      <div className={cx(s.card, s.cardPad)}>
        <h3 className={s['card-title']}>
          {`Caja${sucursal?.nombre ? ` · ${sucursal.nombre}` : ''}`}
          <button
            type="button"
            className={s.link}
            style={{ all: 'unset', cursor: 'pointer' }}
            onClick={() => navigate('/ventas?panel=caja')}
          >
            <span className={s.link}>Ver todo →</span>
          </button>
        </h3>
        {caja ? (
          <div style={{ display: 'flex', gap: 'var(--crm-space-6)', flexWrap: 'wrap' }}>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Turno</div>
              <strong>#{caja.id} abierto</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Desde</div>
              <strong>{fmtFechaHora(caja.apertura)}</strong>
            </div>
            <div>
              <div className={s.muted} style={{ fontSize: 12 }}>Fondo inicial</div>
              <strong>{money(caja.montoInicial)}</strong>
            </div>
          </div>
        ) : (
          <div className={cx(s.callout, s.warn)} style={{ margin: 0 }}>
            Sin turno abierto{sucursal?.nombre ? ` en ${sucursal.nombre}` : ''}.
          </div>
        )}
      </div>
    </div>
  );
}
