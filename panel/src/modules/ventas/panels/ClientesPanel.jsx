import { useMemo, useState } from 'react';
import { cx } from '@shared/utils/classNames.js';
import { AyudaButton } from '@shared/components/AyudaButton/AyudaButton.jsx';
import { appConfig } from '@core/config/app.config.js';
import { useVentas } from '../context/VentasContext.jsx';
import { useResource } from '../hooks/useResource.js';
import { ventasApi } from '../services/ventas.api.js';
import {
  CONDICIONES_IVA, docLegible, norm, telefonoWa,
} from '../domain/constants.js';
import {
  Table, PanelHead, Stat, Btn, CondIvaBadge, ModalShell, usePaginado, money, fmtFechaHora, s,
} from '../components/ui.jsx';
import { ExportarMenu } from '@modules/productos/components/ExportarMenu.jsx';

/** Lo que sale en el Excel/PDF: más que la tabla de pantalla (contacto completo, descuento), sin acciones ni la columna web. */
const COLUMNAS_EXPORT = [
  { h: 'Cliente', tipo: 'texto', ancho: 34 },
  { h: 'Nombre de fantasía', tipo: 'texto', ancho: 26 },
  { h: 'Documento', tipo: 'texto', ancho: 20 },
  { h: 'Condición IVA', tipo: 'texto', ancho: 20 },
  { h: 'Cta. cte.', tipo: 'texto', ancho: 14 },
  { h: 'Límite cta. cte.', tipo: 'moneda', ancho: 16 },
  { h: 'Descuento %', tipo: 'numero', ancho: 12 },
  { h: 'Teléfono', tipo: 'texto', ancho: 18 },
  { h: 'Email', tipo: 'texto', ancho: 28 },
  { h: 'Dirección', tipo: 'texto', ancho: 30 },
  { h: 'Localidad', tipo: 'texto', ancho: 20 },
  { h: 'Estado', tipo: 'texto', ancho: 10 },
];

const ESTADOS_WEB = {
  pendiente: { label: 'Pendiente', pill: 'est-pendiente' },
  enviado: { label: 'Aceptado', pill: 'est-preparada' },
  confirmado: { label: 'Confirmado', pill: 'st-disponible' },
  cerrado: { label: 'Cerrado (venta)', pill: 'est-recibida' },
  cancelado: { label: 'Rechazado', pill: 'est-cancelada' },
};

/**
 * El teléfono del cliente como LINK a WhatsApp — un clic en vez de copiar el
 * número a mano. Si lo que cargó no llega a un número argentino completo, se
 * muestra el texto tal cual (sin link): un link roto abre un chat inexistente
 * y confunde más de lo que ayuda.
 */
function TelefonoCliente({ cliente }) {
  const tel = String(cliente.telefono ?? '').trim();
  if (!tel) return <span className={s.muted}>—</span>;

  const wa = telefonoWa(tel);
  if (!wa) {
    return <span title="No parece un número argentino completo: escribile a mano">{tel}</span>;
  }

  return (
    <a
      href={`https://wa.me/${wa}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Escribirle a ${cliente.nombre || tel} por WhatsApp`}
      style={{ color: '#25D366', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
    >
      💬 {tel}
    </a>
  );
}

/** Historial de pedidos que ESTE cliente hizo por el sitio web. */
function PedidosWebModal({ cliente, pedidos, onCerrar }) {
  return (
    <ModalShell title={`Pedidos web de ${cliente.nombre}`} wide onClose={onCerrar}
      footer={[{ texto: 'Cerrar', clase: 'btn-ghost', onClick: onCerrar }]}
    >
      <Table cols={[
        { h: 'Orden' }, { h: 'Fecha' }, { h: 'Renglones', num: true }, { h: 'Total', num: true }, { h: 'Estado' },
      ]}
      >
        {pedidos.map((p) => {
          const est = ESTADOS_WEB[p.estado] ?? { label: p.estado, pill: 'est-pendiente' };
          return (
            <tr key={p.id}>
              <td className={s.mono}>{p.codigo} 🌐</td>
              <td>{fmtFechaHora(p.fecha)}</td>
              <td className={s.num}>{p.items.length}</td>
              <td className={s.num}><strong>{money(p.total)}</strong></td>
              <td><span className={cx(s.pill, s[est.pill])}>{est.label}</span></td>
            </tr>
          );
        })}
      </Table>
      <div className={s.hint}>
        Todo lo que este cliente pidió desde el sitio, en cualquier estado. Los pendientes
        se atienden en <strong>Órdenes web</strong>; el resto sigue su ciclo en Presupuestos.
      </div>
    </ModalShell>
  );
}

export function ClientesPanel() {
  const { clientes, openModal } = useVentas();
  const [q, setQ] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [historialDe, setHistorialDe] = useState(null); // cliente con modal abierto

  /**
   * Pedidos web por cliente: alimenta la columna "Web" y el historial. Se pide
   * al entrar al panel (no viaja en el bootstrap: crece sin techo).
   */
  const { data: presupuestos } = useResource('clientes-pedidos-web', () => ventasApi.presupuestos());
  const webPorCliente = useMemo(() => {
    const mapa = new Map();
    for (const p of presupuestos ?? []) {
      if (p.origen !== 'web' || !p.clienteId) continue;
      const arr = mapa.get(p.clienteId);
      if (arr) arr.push(p); else mapa.set(p.clienteId, [p]);
    }
    return mapa;
  }, [presupuestos]);

  /**
   * El filtrado se memoriza por (búsqueda, listado): con miles de clientes el
   * `normalize()` por fila es lo único caro de esta pantalla.
   */
  const filtrados = useMemo(() => {
    const ql = norm(q);
    return clientes.filter((c) => {
      if (!verInactivos && !c.activo) return false;
      if (!ql) return true;
      return (
        norm(c.nombre).includes(ql) ||
        norm(c.nombreFantasia).includes(ql) ||
        (c.numeroDoc || '').includes(ql.replace(/\D/g, '')) ||
        norm(c.localidad).includes(ql)
      );
    });
  }, [clientes, q, verInactivos]);

  const stats = useMemo(() => {
    const activos = clientes.filter((c) => c.activo);
    return {
      total: activos.length,
      ctaCte: activos.filter((c) => c.ctaCteHabilitada).length,
      compranWeb: [...webPorCliente.keys()].length,
      inactivos: clientes.length - activos.length,
    };
  }, [clientes, webPorCliente]);

  const stop = (e) => e.stopPropagation();

  /** Todos los clientes filtrados (todas las páginas). */
  const filasParaExportar = () => filtrados.map((c) => [
    c.nombre, c.nombreFantasia || '', c.numeroDoc ? docLegible(c) : '',
    CONDICIONES_IVA[c.condicionIva]?.label || '',
    !c.ctaCteHabilitada ? 'No' : (c.limiteCredito > 0 ? 'Sí' : 'Sí (sin tope)'),
    c.ctaCteHabilitada && c.limiteCredito > 0 ? Number(c.limiteCredito) : null,
    Number(c.descuento) > 0 ? Number(c.descuento) : null,
    c.telefono || '', c.email || '', c.direccion || '', c.localidad || '',
    c.activo ? 'Activo' : 'Baja',
  ]);
  const filtrosTexto = [q && `Búsqueda: ${q}`, verInactivos && 'Incluye dados de baja'].filter(Boolean).join(' · ');

  const pag = usePaginado(filtrados, 'clientes', `${q}|${verInactivos}`);

  const filas = pag.visibles.map((c) => {
    const pedidosWeb = webPorCliente.get(c.id) ?? [];
    return (
      <tr
        key={c.id}
        className={s.clickable}
        onClick={() => openModal('detalleCliente', { clienteId: c.id })}
        style={c.activo ? undefined : { opacity: 0.55 }}
      >
        <td>
          <strong>{c.nombre}</strong>
          {c.nombreFantasia && <div className={s.hint}>{c.nombreFantasia}</div>}
          {!c.activo && <span className={s.muted}> · inactivo</span>}
        </td>
        <td className={s.mono}>{docLegible(c)}</td>
        <td><CondIvaBadge condicion={c.condicionIva} /></td>
        <td>{c.listas?.length ? `${c.listas.length} lista(s)` : <span className={s.muted}>base</span>}</td>
        <td className={s.num}>
          {c.ctaCteHabilitada
            ? (c.limiteCredito > 0 ? money(c.limiteCredito) : 'Sin tope')
            : <span className={s.muted}>—</span>}
        </td>
        {appConfig.features.webHabilitado && (
          <td className={s.num} onClick={stop}>
            {pedidosWeb.length
              ? (
                <button
                  type="button"
                  className={cx(s.pill, s['est-preparada'])}
                  style={{ cursor: 'pointer', border: 'none' }}
                  title="Ver el historial de pedidos web"
                  onClick={() => setHistorialDe(c)}
                >
                  🌐 {pedidosWeb.length}
                </button>
              )
              : <span className={s.muted}>—</span>}
          </td>
        )}
        <td onClick={stop}><TelefonoCliente cliente={c} /></td>
        <td>{c.localidad || <span className={s.muted}>—</span>}</td>
        <td className={s['actions-col']}>
          <div className={s['row-actions']} onClick={stop}>
            {c.activo ? (
              <>
                <Btn variant="btn-edit" small onClick={() => openModal('clienteForm', { clienteId: c.id })}>Editar</Btn>
                {!c.esConsumidorFinal && (
                  <Btn variant="btn-delete" small onClick={() => openModal('eliminarCliente', { clienteId: c.id })}>Baja</Btn>
                )}
              </>
            ) : (
              <Btn variant="btn-ingreso" small onClick={() => openModal('reactivarCliente', { clienteId: c.id })}>Reactivar</Btn>
            )}
          </div>
        </td>
      </tr>
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead
        title="Clientes"
        desc="Clic en una fila para ver el detalle: cuenta corriente, comprobantes y datos comerciales."
        actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn variant="btn-primary" onClick={() => openModal('clienteForm', {})}>+ Nuevo cliente</Btn>
            <AyudaButton categoriaId="clientes" />
          </div>
        )}
      />

      <div className={s.stats}>
        <Stat label="Clientes activos" value={stats.total} />
        <Stat label="Con cuenta corriente" value={stats.ctaCte} accent="accent-amber" />
        {appConfig.features.webHabilitado && (
          <Stat label="Compran por la web" value={stats.compranWeb} accent={stats.compranWeb ? 'accent-green' : undefined} />
        )}
        <Stat label="Dados de baja" value={stats.inactivos} />
      </div>

      <div className={s.toolbar}>
        <input
          type="search"
          placeholder="Buscar por nombre, documento o localidad..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Ver dados de baja
        </label>
        <ExportarMenu
          archivo="clientes"
          titulo="Clientes"
          columnas={COLUMNAS_EXPORT}
          obtenerFilas={filasParaExportar}
          filtros={filtrosTexto}
          disabled={!filtrados.length}
        />
      </div>

      <Table
        cols={[
          { h: 'Cliente' }, { h: 'Documento' }, { h: 'IVA' }, { h: 'Lista' },
          { h: 'Límite cta. cte.', num: true },
          ...(appConfig.features.webHabilitado ? [{ h: 'Web', num: true }] : []),
          { h: 'Teléfono' }, { h: 'Localidad' },
          { h: 'Acciones', cls: 'actions-col' },
        ]}
        empty={q ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes.'}
        pag={pag}
      >
        {filas}
      </Table>

      <div className={s.hint}>
        La condición frente al IVA ({Object.values(CONDICIONES_IVA).map((c) => c.corto).join(' · ')}) define
        la letra del comprobante que se emite en la caja.
        {appConfig.features.webHabilitado && (
          <> La columna <strong>Web</strong> cuenta los pedidos que el cliente hizo desde el sitio — clic para ver el historial.</>
        )}
      </div>

      {historialDe && (
        <PedidosWebModal
          cliente={historialDe}
          pedidos={webPorCliente.get(historialDe.id) ?? []}
          onCerrar={() => setHistorialDe(null)}
        />
      )}
    </div>
  );
}
