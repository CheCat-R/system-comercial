import { useEffect, useState } from 'react';
import { cx } from '@shared/utils/classNames.js';
import { useProveedores } from '../../context/ProveedoresContext.jsx';
import { provApi, errorMsg } from '../../services/proveedores.api.js';
import { ModalShell, s } from '../ui.jsx';

const LISTA_MAX = 8;

function Lista({ items }) {
  return (
    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
      {items.slice(0, LISTA_MAX).map((x) => <li key={x.id}>{x.nombre}</li>)}
      {items.length > LISTA_MAX && <li>… y {items.length - LISTA_MAX} más</li>}
    </ul>
  );
}

/**
 * QUITAR UN PROVEEDOR DEL PADRÓN, sin llevarse la historia ni los precios.
 * ============================================================================
 * Borrar solo se puede si estaba cargado de más (sin facturas, pagos ni productos). Con historia se da de BAJA:
 * sigue en el padrón para consultar su cuenta, pero deja de ofrecerse al cargar compras.
 *
 *  - Si es el proveedor ACTIVO de productos que tienen otro (el precio sale de él): hay que activar el otro primero.
 *    Se lista cuáles; el botón queda apagado.
 *  - Los productos que solo él vendía se pueden dar de baja con él, si ya no los va a traer.
 */
export function BajaProveedorModal({ proveedorId }) {
  const { getProveedor, act, closeModal, toast } = useProveedores();
  const p = getProveedor(proveedorId);
  const [previa, setPrevia] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [conProductos, setConProductos] = useState(false);

  useEffect(() => {
    let vivo = true;
    provApi.previaDeBaja(proveedorId)
      .then((r) => { if (vivo) setPrevia(r); })
      .catch((e) => { toast(errorMsg(e), 'err'); closeModal(); });
    return () => { vivo = false; };
  }, [proveedorId, toast, closeModal]);

  if (!p) return null;
  const historia = previa ? Object.entries(previa.historia) : [];
  const { conAlternativa = [], soloEste = [], otros = [] } = previa?.productos ?? {};
  const bloqueado = conAlternativa.length > 0;
  const enBaja = previa && !previa.activo;

  const borrar = () => act(provApi.eliminarProveedor(p.id), 'Proveedor eliminado.', { recargar: true });
  const darDeBaja = () => act(
    provApi.darDeBaja(p.id, { motivo: motivo.trim() || undefined, discontinuarProductos: conProductos && soloEste.length > 0 }),
    conProductos && soloEste.length ? 'Proveedor y sus productos dados de baja.' : 'Proveedor dado de baja.',
    { recargar: true },
  );
  const reactivar = () => act(provApi.reactivar(p.id), 'Proveedor reactivado.', { recargar: true });

  const footer = [{ texto: 'Cancelar', clase: 'btn-ghost', onClick: closeModal }];
  if (previa) {
    if (enBaja) footer.push({ texto: 'Reactivar', clase: 'btn-primary', onClick: reactivar });
    else {
      if (previa.puedeBorrarse) footer.push({ texto: 'Eliminar definitivamente', clase: 'btn-delete', onClick: borrar });
      footer.push({ texto: 'Dar de baja', clase: 'btn-primary', onClick: darDeBaja, disabled: bloqueado });
    }
  }

  return (
    <ModalShell title={enBaja ? 'Proveedor dado de baja' : 'Quitar proveedor'} subtitle={p.nombre} onClose={closeModal} footer={footer}>
      {!previa && <div className={s.hint}>Revisando qué tiene cargado…</div>}

      {previa && enBaja && (
        <div className={cx(s.callout, s.warn)}>
          <strong>{p.nombre}</strong> está dado de baja{p.bajaEn ? ` desde el ${new Date(p.bajaEn).toLocaleDateString('es-AR')}` : ''}
          {p.motivoBaja ? `: ${p.motivoBaja}` : ''}. Su cuenta y sus comprobantes se siguen viendo; no aparece para compras nuevas.
          Al reactivarlo vuelve a ofrecerse.
        </div>
      )}

      {previa && !enBaja && (
        <>
          {previa.puedeBorrarse ? (
            <div className={cx(s.callout, s.warn)}>
              <strong>{p.nombre}</strong> no tiene facturas, pagos ni productos cargados: se puede eliminar del todo
              (si lo cargaste de más) o darlo de baja.
            </div>
          ) : (
            <div className={cx(s.callout, s.warn)}>
              {historia.length > 0 && (
                <>
                  <strong>{p.nombre}</strong> tiene historia ({historia.map(([k, n]) => `${n} ${k}`).join(', ')}): esa historia se
                  conserva, por eso <strong>no se elimina</strong>. Dándolo de baja deja de ofrecerse en compras nuevas y su cuenta
                  se sigue pudiendo consultar.
                </>
              )}
              {historia.length === 0 && (
                <>Tiene productos cargados con su costo: eliminarlo se los llevaría. Dalo de baja.</>
              )}
            </div>
          )}

          {bloqueado && (
            <div className={cx(s.callout, s.danger)} style={{ marginTop: 10 }}>
              <strong>Antes de darlo de baja, activá otro proveedor</strong> en estos productos: hoy su precio sale de {p.nombre}
              y tienen otro cargado.
              <Lista items={conAlternativa} />
            </div>
          )}

          {soloEste.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className={s.hint} style={{ margin: 0 }}>
                {soloEste.length} producto{soloEste.length === 1 ? '' : 's'} que solo le compraba a {p.nombre}:
              </div>
              <Lista items={soloEste} />
              <label className={s.hint} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={conProductos} onChange={(e) => setConProductos(e.target.checked)} />
                Ya no los va a traer: dar de baja también {soloEste.length === 1 ? 'este producto' : 'estos productos'} (quedan
                “discontinuados”: se venden hasta agotar y dejan de comprarse)
              </label>
            </div>
          )}

          {otros.length > 0 && (
            <div className={s.hint} style={{ marginTop: 10 }}>
              {otros.length} producto{otros.length === 1 ? '' : 's'} más lo tienen cargado, pero se compran a otro proveedor: no cambia nada ahí.
            </div>
          )}

          <div className={s.field} style={{ marginTop: 12 }}>
            <label>Motivo (opcional)</label>
            <input type="text" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: cerró, cambiamos de distribuidor" />
          </div>
        </>
      )}
    </ModalShell>
  );
}
