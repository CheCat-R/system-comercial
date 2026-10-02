/**
 * RESPALDOS — la versión chica y honesta (26/8, decisión del dueño).
 * ============================================================================
 * Tres cosas, de la más importante a la más cómoda:
 *  1. LA COPIA EXTERNA (todos los planes): descargar el volcado completo a
 *     esta máquina. Si el servidor se cae con sus backups adentro, la copia
 *     de afuera salva. Cada descarga queda en auditoría.
 *  2. EL AVISO: si hace 7 días o más que nadie baja una copia, esta pantalla
 *     lo dice arriba de todo (y el menú muestra una insignia en Sistema).
 *  3. LAS COPIAS DIARIAS DEL SERVIDOR (solo Pymes y Corporativo): una por día
 *     a las 3:00, las últimas 14. Viven en el mismo servidor que la base, así
 *     que NO reemplazan a la copia de afuera — por eso el aviso de arriba
 *     sigue valiendo también en esos planes.
 */
import { useCallback, useEffect, useState } from 'react';
import { httpClient } from '@core/services/httpClient.js';
import { usePermissions } from '@core/permissions/PermissionContext.jsx';
import { cx } from '@shared/utils/classNames.js';
import { PanelHead, Btn, Stat, Table, s } from '@modules/productos/components/ui.jsx';
import { fmtFechaHora, num } from '@modules/productos/domain/format.js';
import { respaldoAviso } from '@core/services/respaldoAviso.js';

export function RespaldosPanel({ onAviso }) {
  const { permissions } = usePermissions();
  /* La limpieza de fin de práctica es EXCLUSIVA del superadmin (28/8, pedido
   * del dueño): ni siquiera se muestra a los demás — y el servidor lo
   * revalida, que es el candado que vale. */
  const esSuper = permissions.includes('*');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [bajando, setBajando] = useState(false);
  const [ensayo, setEnsayo] = useState(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [limpiando, setLimpiando] = useState(false);

  const cargar = useCallback(() => {
    httpClient.get('/sistema/respaldos/info')
      .then((r) => { setInfo(r); setError(''); })
      .catch((e) => setError(e?.data?.message || 'No se pudo consultar el estado de la base.'));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const descargar = async () => {
    if (bajando) return;
    setBajando(true);
    try {
      const nombre = await httpClient.descargar('/sistema/respaldos/descargar', 'respaldo-crm.sql');
      onAviso?.({ tipo: 'ok', texto: `Respaldo descargado: ${nombre}. Guardalo fuera de esta máquina también (pendrive, Drive).` });
      cargar();
      respaldoAviso.refrescar();
    } catch (e) {
      onAviso?.({ tipo: 'err', texto: e?.data?.message || 'No se pudo generar el respaldo.' });
    } finally {
      setBajando(false);
    }
  };

  /** Baja una de las copias diarias del servidor. Cuenta como copia externa: queda en el rastro y apaga el aviso. */
  const descargarAutomatica = async (archivo) => {
    if (bajando) return;
    setBajando(true);
    try {
      const nombre = await httpClient.descargar(`/sistema/respaldos/automaticos/${encodeURIComponent(archivo)}`, archivo);
      onAviso?.({ tipo: 'ok', texto: `Copia descargada: ${nombre}. Guardala fuera de esta máquina también (pendrive, Drive).` });
      cargar();
      respaldoAviso.refrescar();
    } catch (e) {
      onAviso?.({ tipo: 'err', texto: e?.data?.message || 'No se pudo bajar esa copia.' });
      cargar();
    } finally {
      setBajando(false);
    }
  };

  const verEnsayo = async () => {
    try {
      setEnsayo(await httpClient.get('/sistema/respaldos/limpieza/ensayo'));
      setConfirmacion('');
    } catch (e) {
      onAviso?.({ tipo: 'err', texto: e?.data?.message || 'No se pudo consultar la limpieza.' });
    }
  };

  const limpiar = async () => {
    if (limpiando || confirmacion !== 'LIMPIAR') return;
    setLimpiando(true);
    try {
      const r = await httpClient.post('/sistema/respaldos/limpieza', { confirmar: confirmacion });
      onAviso?.({
        tipo: 'ok',
        texto: `Listo: se vaciaron ${num(r.borradas ?? 0, 0)} filas de práctica. El catálogo, los proveedores y los clientes quedaron intactos. La pantalla se recarga…`,
      });
      /* TODO lo que este navegador tiene en memoria (catálogos, stock,
       * borradores) acaba de dejar de existir: la recarga es obligatoria. */
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      onAviso?.({ tipo: 'err', texto: e?.data?.message || 'La limpieza no se pudo hacer.' });
      setLimpiando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead
        title="Respaldos"
        desc={info?.automatico
          ? 'La copia externa de la base, bajada a esta máquina, y las copias diarias que el servidor guarda solo.'
          : 'La copia externa de la base, bajada a esta máquina.'}
        actions={(
          <Btn variant="btn-primary" disabled={bajando || !!error} onClick={descargar}>
            {bajando ? 'Generando…' : 'Descargar respaldo (.sql)'}
          </Btn>
        )}
      />

      {error && <div className={cx(s.callout, s.warn)}>{error}</div>}

      {info?.aviso?.avisar && (
        <div className={cx(s.callout, s.warn)} style={{ margin: 0 }}>
          <strong>
            {info.aviso.dias == null
              ? 'Todavía no bajaste ninguna copia externa.'
              : `Hace ${info.aviso.dias} días que no bajás una copia externa.`}
          </strong>
          {' '}Si el servidor falla, hoy no tenés nada fuera de él. Bajá una ahora y guardala
          en un pendrive o en un Drive.
        </div>
      )}

      {info && (
        <div className={s.stats}>
          <Stat label="Tamaño de la base" value={info.tamano} />
          <Stat label="Tablas" value={info.tablas} />
          <Stat label="Ventas" value={num(info.resumen?.ventas ?? 0, 0)} />
          <Stat label="Comprobantes de compra" value={num(info.resumen?.comprobantes ?? 0, 0)} />
          <Stat label="Productos" value={num(info.resumen?.productos ?? 0, 0)} />
        </div>
      )}

      <div className={cx(s.callout, s.info)} style={{ margin: 0 }}>
        <strong>Para qué sirve esta copia.</strong>{' '}
        {info?.automatico
          ? 'Las copias automáticas viven en el mismo servidor que la base: un problema grande se las puede llevar juntas. '
          : 'Si el servidor se rompe, se lleva la base con todo adentro. '}
        El archivo que se descarga acá es <strong>la copia de afuera</strong> — llevala a un pendrive
        o a un Drive cada tanto. Se restaura sobre una base con el sistema ya migrado, cargándolo con
        <code> mysql</code>; las instrucciones exactas van en el encabezado del propio archivo.
      </div>

      {/* ============ COPIAS DIARIAS DEL SERVIDOR — Pymes y Corporativo ============ */}
      {info?.automatico && (
        <div>
          <div className={s['section-title']}>Copias automáticas del servidor</div>
          {info.automatico.fallo && (
            <div className={cx(s.callout, s.warn)} style={{ margin: '0 0 8px' }}>
              <strong>La última copia automática falló.</strong>{' '}
              {info.automatico.ultimoIntento?.mensaje}
              {' '}Avisale a quien administra el servidor.
            </div>
          )}
          {!info.automatico.fallo && info.automatico.atrasada && (
            <div className={cx(s.callout, s.warn)} style={{ margin: '0 0 8px' }}>
              <strong>Hace más de un día y medio que no se genera una copia automática.</strong>{' '}
              Lo más probable es que el servidor no esté ejecutando las tareas programadas:
              avisale a quien lo administra. Mientras tanto, bajá una copia a mano.
            </div>
          )}
          {info.automatico.copias.length === 0 && !info.automatico.fallo && (
            <div className={cx(s.callout, s.info)} style={{ margin: '0 0 8px' }}>
              Todavía no se generó ninguna. La primera sale a las 3:00 de la madrugada.
            </div>
          )}
          <Table
            cols={[{ h: 'Fecha y hora' }, { h: 'Tamaño' }, { h: '' }]}
            empty="Todavía no hay copias automáticas."
          >
            {info.automatico.copias.map((c) => (
              <tr key={c.archivo}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtFechaHora(c.fecha)}</td>
                <td>{c.tamano}</td>
                <td style={{ textAlign: 'right' }}>
                  <Btn small disabled={bajando} onClick={() => descargarAutomatica(c.archivo)}>Bajar</Btn>
                </td>
              </tr>
            ))}
          </Table>
          <div className={s.hint}>
            Se genera una por día a las 3:00 y se conservan las últimas {info.automatico.retencion}.
            Sirven si se rompe o se borra algo de la base; si se pierde el servidor entero, se van
            con él — para eso está la copia de afuera.
          </div>
        </div>
      )}

      <div>
        <div className={s['section-title']}>Descargas registradas</div>
        <Table
          cols={[{ h: 'Fecha y hora' }, { h: 'Qué se bajó' }, { h: 'Quién' }]}
          empty="Nadie descargó una copia todavía."
        >
          {(info?.descargas ?? []).map((d, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtFechaHora(d.fecha)}</td>
              <td>{d.detalle}</td>
              <td>{d.usuario || <span className={s.muted}>—</span>}</td>
            </tr>
          ))}
        </Table>
        {(info?.descargas?.length ?? 0) > 0 && (
          <div className={s.hint}>
            Si la última descarga tiene semanas, la copia externa está vieja: bajá una nueva.
          </div>
        )}
      </div>

      {/* ============ FIN DEL PERÍODO DE PRUEBA — solo superadmin ============ */}
      {esSuper && (
        <div>
          <div className={s['section-title']}>Fin del período de prueba</div>
          <div className={cx(s.callout, s.warn)} style={{ margin: 0 }}>
            <strong>Vacía TODA la operatoria</strong> — stock y movimientos, ventas y tickets,
            comprobantes de compra (facturas, remitos, liquidaciones), cobranzas, caja y arqueos,
            transferencias, conteos, incidencias, vencimientos, pagos y compromisos de
            proveedores y gastos. <strong>Se conservan</strong> los productos
            con sus formatos y precios, los proveedores, los clientes, los usuarios, las fotos y
            toda la configuración. Es para el día que termine la práctica del equipo: los
            contadores arrancan de nuevo y la primera venta real es el ticket 1.
            <div style={{ marginTop: 8 }}>
              <strong>Antes de tocar nada: descargá un respaldo</strong> con el botón de arriba —
              es la única vuelta atrás.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <Btn onClick={verEnsayo}>Ver qué se borraría</Btn>
              {ensayo && (
                <span className={s.hint} style={{ margin: 0 }}>
                  <strong>{num(ensayo.total ?? 0, 0)}</strong> filas en {ensayo.detalle?.length ?? 0} tablas
                  {' '}({(ensayo.detalle ?? []).slice(0, 6).map((d) => `${d.tabla}: ${num(d.filas, 0)}`).join(' · ')}
                  {(ensayo.detalle?.length ?? 0) > 6 ? ' …' : ''})
                </span>
              )}
            </div>
            {/* El botón rojo recién aparece con el ensayo mirado, y recién se
                prende con la palabra tipeada: dos seguros, y el servidor los
                revalida a los dos. */}
            {ensayo && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                <input
                  placeholder="Escribí LIMPIAR para confirmar"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  style={{ maxWidth: 240 }}
                />
                <Btn
                  variant="btn-delete"
                  disabled={confirmacion !== 'LIMPIAR' || limpiando}
                  onClick={limpiar}
                >
                  {limpiando ? 'Vaciando…' : 'Vaciar la operatoria de práctica'}
                </Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
