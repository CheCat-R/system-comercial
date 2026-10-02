/**
 * LICENCIA — hasta cuándo puede usarse el sistema, y dónde se carga la clave.
 * ============================================================================
 * El plan y el vencimiento llegan en una CLAVE DE ACTIVACIÓN firmada por CCS:
 * acá no se elige un plan ni se escribe una fecha, solo se pega la clave. Si
 * la clave fue alterada, es de otra instalación o ya venció, el servidor la
 * rechaza y dice por qué.
 *
 * Solo la ve el dueño (permiso `sistema.licencia`, que el rol Administrador no
 * trae). El ID de instalación es lo que se le pasa a CCS para que emita la clave.
 */
import { useCallback, useEffect, useState } from 'react';
import { httpClient } from '@core/services/httpClient.js';
import { cx } from '@shared/utils/classNames.js';
import { PanelHead, Btn, Stat, Pill, s } from '@modules/productos/components/ui.jsx';

const NOMBRE_PLAN = { emprendedor: 'Emprendedor', pymes: 'Pymes', corporativo: 'Corporativo' };

const ESTADOS = {
  activa: { label: 'Activa', pill: 'est-recibida' },
  por_vencer: { label: 'Por vencer', pill: 'est-pendiente' },
  en_gracia: { label: 'Vencida · en gracia', pill: 'est-pendiente' },
  vencida: { label: 'Vencida · solo lectura', pill: 'est-cancelada' },
  sin_licencia: { label: 'Sin licencia · solo lectura', pill: 'est-cancelada' },
  invalida: { label: 'Clave inválida · solo lectura', pill: 'est-cancelada' },
  no_exigida: { label: 'No se exige en este entorno', pill: null },
};

const fecha = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR') : '—');

export function LicenciaPanel({ onAviso }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [clave, setClave] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const [activando, setActivando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(() => {
    httpClient.get('/licencia')
      .then((r) => { setInfo(r); setError(''); })
      .catch((e) => setError(e?.data?.message || 'No se pudo consultar la licencia.'));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(info.instalacionId);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      onAviso?.({ tipo: 'err', texto: 'No se pudo copiar: seleccionalo y copialo a mano.' });
    }
  };

  const activar = async (e) => {
    e.preventDefault();
    if (activando) return;
    setErrorClave('');
    if (!clave.trim()) { setErrorClave('Pegá la clave de activación.'); return; }
    setActivando(true);
    try {
      await httpClient.post('/licencia/activar', { clave });
      onAviso?.({ tipo: 'ok', texto: 'Licencia activada. Se actualiza la pantalla…' });
      // El plan y el aviso viven en la sesión: recarga completa para que todo nazca con la licencia nueva.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e2) {
      setErrorClave(e2?.data?.errors?.clave?.[0] || e2?.data?.message || 'No se pudo activar la clave.');
      setActivando(false);
    }
  };

  const est = info ? ESTADOS[info.estado] : null;
  const conLicencia = info && ['activa', 'por_vencer', 'en_gracia', 'vencida'].includes(info.estado);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead title="Licencia" desc="El plan que tenés contratado y hasta cuándo. Para renovarlo, cargá acá la clave de activación." />

      {error && <div className={cx(s.callout, s.warn)}>{error}</div>}

      {info && (
        <>
          {info.estado === 'por_vencer' && (
            <div className={cx(s.callout, s.warn)} style={{ margin: 0 }}>
              <strong>Tu licencia vence el {fecha(info.vence)}</strong> ({info.diasRestantes === 0 ? 'hoy' : `en ${info.diasRestantes} días`}).
              Pedile a CCS la renovación pasando el ID de abajo y cargá la clave nueva.
            </div>
          )}
          {info.estado === 'en_gracia' && (
            <div className={cx(s.callout, s.warn)} style={{ margin: 0 }}>
              <strong>Tu licencia venció el {fecha(info.vence)}.</strong> El sistema sigue funcionando unos días más; después queda en
              modo solo lectura (podés ver tus datos y bajar respaldos, pero no registrar ventas ni compras). Renovala ya.
            </div>
          )}
          {['vencida', 'sin_licencia', 'invalida'].includes(info.estado) && (
            <div className={cx(s.callout, s.warn)} style={{ margin: 0 }}>
              <strong>El sistema está en modo solo lectura.</strong>{' '}
              {info.estado === 'vencida' ? `Tu licencia venció el ${fecha(info.vence)}. ` : (info.motivo ? `${info.motivo} ` : '')}
              Seguís viendo tus datos y podés bajar respaldos, pero no se registran ventas ni compras nuevas hasta cargar una clave vigente.
            </div>
          )}
          {info.estado === 'no_exigida' && (
            <div className={cx(s.callout, s.info)} style={{ margin: 0 }}>
              En este entorno (desarrollo o demostración) no se exige licencia: el sistema no vence.
            </div>
          )}

          <div className={s.stats}>
            <Stat label="Estado" value={est?.pill ? <Pill pill={est.pill} label={est.label} /> : est?.label} />
            {conLicencia && <Stat label="Plan" value={NOMBRE_PLAN[info.plan] ?? info.plan} />}
            {conLicencia && <Stat label="Vence" value={fecha(info.vence)} />}
            {conLicencia && <Stat label="Modalidad" value={info.modalidad === 'anual' ? 'Anual' : info.modalidad === 'mensual' ? 'Mensual' : '—'} />}
          </div>
          {conLicencia && info.cliente && <div className={s.hint} style={{ margin: 0 }}>Licencia a nombre de <strong>{info.cliente}</strong>.</div>}

          <div>
            <div className={s['section-title']}>ID de esta instalación</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--crm-color-surface-2)', fontSize: 13, wordBreak: 'break-all' }}>
                {info.instalacionId}
              </code>
              <Btn small onClick={copiarId}>{copiado ? 'Copiado ✓' : 'Copiar'}</Btn>
            </div>
            <div className={s.hint}>Es lo que se le pasa a CCS para emitir tu clave. Cada clave sirve en una sola instalación.</div>
          </div>

          <form onSubmit={activar}>
            <div className={s['section-title']}>Cargar una clave de activación</div>
            <textarea
              value={clave}
              onChange={(e) => { setClave(e.target.value); setErrorClave(''); }}
              rows={4}
              spellCheck={false}
              placeholder="Pegá acá la clave completa (empieza con CCS1.)"
              style={{ width: '100%', fontFamily: 'var(--crm-font-mono, monospace)', fontSize: 12, resize: 'vertical' }}
              aria-label="Clave de activación"
            />
            {errorClave && <div className={cx(s.callout, s.warn)} style={{ marginTop: 8 }}>{errorClave}</div>}
            <div style={{ marginTop: 10 }}>
              <Btn variant="btn-primary" disabled={activando} onClick={activar}>{activando ? 'Activando…' : 'Activar clave'}</Btn>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
