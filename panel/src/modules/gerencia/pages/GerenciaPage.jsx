/**
 * GERENCIA — Usuarios y roles
 * ============================================================================
 * La administración del superadmin: acá se crean los usuarios con su
 * contraseña y se definen los ROLES con sus permisos (checkboxes sobre el
 * catálogo que sirve la API — agregar un permiso nuevo al catálogo lo hace
 * aparecer acá solo, sin tocar esta pantalla).
 *
 * Reglas espejadas del backend (la API las valida igual):
 *   - superadmin: no se edita ni se borra; siempre queda uno activo.
 *   - roles de sistema: editables, no borrables.
 *   - usuarios: se desactivan, nunca se borran (viven en los historiales).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpClient } from '@core/services/httpClient.js';
import { AyudaButton } from '@shared/components/AyudaButton/AyudaButton.jsx';
import { useAuth } from '@core/auth/AuthContext.jsx';
import { usePermissions } from '@core/permissions/PermissionContext.jsx';
import { usePlan } from '@core/plan/PlanContext.jsx';
import { cx } from '@shared/utils/classNames.js';
import { ModalShell } from '@modules/productos/components/Modal.jsx';
import { Table, PanelHead, Btn, usePaginado, s } from '@modules/productos/components/ui.jsx';
import { GERENCIA_SECCIONES } from '../config/gerencia.config.js';
import { RentabilidadPanel } from '../panels/RentabilidadPanel.jsx';
import { ReportesVentasPanel } from '../panels/ReportesVentasPanel.jsx';
import { ValorizacionPanel } from '../panels/ValorizacionPanel.jsx';
import { AuditoriaPanel } from '../panels/AuditoriaPanel.jsx';
import { ConfiguracionPanel } from '../panels/ConfiguracionPanel.jsx';

/** Placeholder honesto: dice qué va a haber acá cuando se construya. */
function Proximamente({ seccion }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead title={seccion.label} desc={seccion.desc} />
      <div className={cx(s.callout, s.info)}>
        <strong>Próximamente.</strong> Esta sección está en la agenda de Gerencia y todavía no se construyó.
      </div>
    </div>
  );
}

/**
 * Mismo molde que `Proximamente`, para lo opuesto: la sección YA está
 * construida, pero el plan de esta instalación no la incluye. El rol la
 * puede ver (por eso sigue en el sub-menú, no desaparece como con un permiso
 * faltante) — lo que falta es contrato, no autorización.
 */
function MejoraTuPlan({ seccion }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead title={seccion.label} desc={seccion.desc} />
      <div className={cx(s.callout, s.warn)}>
        <strong>No incluido en el plan actual.</strong> {seccion.label} está disponible desde un plan
        superior — hablá con CheCAT para subir de plan y desbloquearla.
      </div>
    </div>
  );
}

/* ---------------- Modal de usuario (alta / edición) ---------------- */

function UsuarioModal({ usuario, roles, onGuardar, onCerrar }) {
  const { user } = useAuth();
  const esAlta = !usuario;
  /* La propia contraseña se cambia en "Mi perfil" (pide la actual): acá el servidor no la acepta. */
  const esPropio = !esAlta && usuario.id === user?.id;
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [rolId, setRolId] = useState(usuario?.rolId ?? roles.find((r) => r.clave === 'cajero')?.id ?? roles[0]?.id);
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [password, setPassword] = useState('');
  /* El relevo de caja (0088): la marca + su PIN. El PIN nunca vuelve del
   * servidor — el campo siempre arranca vacío y vacío = no cambiarlo. */
  const [relevoCaja, setRelevoCaja] = useState(usuario?.relevoCaja ?? false);
  const [pin, setPin] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar({
      nombre, rolId: Number(rolId), activo,
      relevoCaja,
      ...(password && !esPropio ? { password } : {}),
      ...(pin ? { pin } : {}),
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <ModalShell
      title={esAlta ? 'Nuevo usuario' : `Editar a ${usuario.nombre}`}
      onClose={onCerrar}
      footer={[
        { texto: 'Cancelar', clase: 'btn-ghost', onClick: onCerrar },
        { texto: guardando ? 'Guardando…' : 'Guardar', clase: 'btn-primary', onClick: guardar },
      ]}
    >
      <div className={s.field}>
        <label>Nombre <span className={s.req}>*</span></label>
        <input autoFocus value={nombre} placeholder="Nombre y apellido" onChange={(e) => setNombre(e.target.value)} />
        <div className={s.hint}>
          Es lo que la persona escribe para entrar al sistema (da igual mayúsculas y tildes). No puede repetirse.
        </div>
      </div>
      <div className={s['form-grid']}>
        <div className={s.field}>
          <label>Rol <span className={s.req}>*</span></label>
          <select value={rolId} onChange={(e) => setRolId(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label>Contraseña {esAlta ? <span className={s.req}>*</span> : ''}</label>
          <input
            type="password"
            value={password}
            placeholder={esAlta ? 'Mínimo 8 caracteres' : 'Dejar vacío para no cambiarla'}
            disabled={esPropio}
            onChange={(e) => setPassword(e.target.value)}
          />
          {esPropio && <div className={s.hint}>La tuya se cambia desde Mi perfil.</div>}
        </div>
      </div>
      {!esAlta && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Usuario activo (desactivado no puede operar)
        </label>
      )}

      {/* EL RELEVO DE CAJA (0088): "la cajera se ausenta, cobra el repositor".
          El relevo toma la registradora de una sesión ajena con su PIN y firma
          lo que hace — sin cambiar de usuario ni ganar permisos. */}
      <div className={s.field} style={{ marginTop: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={relevoCaja} onChange={(e) => setRelevoCaja(e.target.checked)} />
          Puede relevar en caja
        </label>
        <div className={s.hint} style={{ margin: '4px 0 0' }}>
          Aparece en el POS para tomar la caja de otra sesión con su PIN: las ventas y los
          movimientos quedan firmados con su nombre. No cambia sus permisos.
        </div>
      </div>
      {relevoCaja && (
        <div className={s.field}>
          <label>PIN del relevo {usuario?.tienePin ? '' : <span className={s.req}>*</span>}</label>
          <input
            type="password" inputMode="numeric" maxLength={6}
            value={pin}
            placeholder={usuario?.tienePin ? 'Ya tiene PIN — dejar vacío para no cambiarlo' : '4 a 6 dígitos'}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      )}
    </ModalShell>
  );
}

/* ---------------- Modal de sucursal (alta / edición) ---------------- */

/**
 * Una sucursal es un local: su nombre, su punto de venta de ARCA (cada local
 * tiene el suyo) y el domicilio que sale impreso en SUS comprobantes. La
 * distribuidora es el depósito central y hay una sola; el resto son express.
 * La API valida lo mismo (punto de venta repetido, segunda distribuidora,
 * tope del plan): acá se evita el viaje de ida y vuelta cuando se puede.
 */
function SucursalModal({ sucursal, sucursales, onGuardar, onCerrar }) {
  const esAlta = !sucursal;
  const [nombre, setNombre] = useState(sucursal?.nombre ?? '');
  const [tipo, setTipo] = useState(sucursal?.tipo ?? 'express');
  const [puntoVenta, setPuntoVenta] = useState(sucursal?.puntoVenta ?? '');
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const otraDistribuidora = sucursales.find((x) => x.tipo === 'distribuidora' && x.id !== sucursal?.id);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const fallo = await onGuardar({ nombre, tipo, puntoVenta, direccion });
    setGuardando(false);
    if (fallo) setError(fallo); else onCerrar();
  };

  return (
    <ModalShell
      title={esAlta ? 'Nueva sucursal' : `Editar ${sucursal.nombre}`}
      onClose={onCerrar}
      footer={[
        { texto: 'Cancelar', clase: 'btn-ghost', onClick: onCerrar },
        { texto: guardando ? 'Guardando…' : 'Guardar', clase: 'btn-primary', onClick: guardar },
      ]}
    >
      {error && <div className={cx(s.callout, s.warn)}>{error}</div>}
      <div className={s.field}>
        <label>Nombre <span className={s.req}>*</span></label>
        <input autoFocus value={nombre} maxLength={80} placeholder="Ej: Sucursal Centro" onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className={s['form-grid']}>
        <div className={s.field}>
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="express">Express (local de venta)</option>
            <option value="distribuidora" disabled={!!otraDistribuidora}>Distribuidora (depósito central)</option>
          </select>
          {otraDistribuidora && (
            <div className={s.hint}>La distribuidora ya es {otraDistribuidora.nombre}: hay una sola.</div>
          )}
        </div>
        <div className={s.field}>
          <label>Punto de venta de ARCA</label>
          <input
            value={puntoVenta}
            maxLength={5}
            inputMode="numeric"
            placeholder="Ej: 00002"
            style={{ fontFamily: 'var(--crm-font-mono, monospace)' }}
            onChange={(e) => setPuntoVenta(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <div className={s.field}>
        <label>Domicilio del comprobante</label>
        <input value={direccion} maxLength={200} placeholder="Calle 123, Formosa" onChange={(e) => setDireccion(e.target.value)} />
        <div className={s.hint}>
          Es el que sale impreso en la factura de este local. El punto de venta tiene que estar
          dado de alta en ARCA (Administración de puntos de venta, sistema “Web Services”) antes
          de facturar con él; dos locales no pueden compartirlo.
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------- Modal de rol (alta / permisos) ---------------- */

/**
 * Master checkbox de un grupo: marca/desmarca todas sus claves de una, y en
 * el medio (algunas sí, otras no) se muestra indeterminado.
 */
function CheckTodo({ claves, permisos, onSet, label }) {
  const marcadas = claves.filter((c) => permisos.has(c)).length;
  const todas = claves.length > 0 && marcadas === claves.length;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={todas}
        ref={(el) => { if (el) el.indeterminate = marcadas > 0 && !todas; }}
        onChange={() => onSet(claves, !todas)}
      />
      {label}
    </label>
  );
}

function ListaPermisos({ titulo, items, permisos, toggle }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--crm-color-text-muted)', marginBottom: 4 }}>
        {titulo}
      </div>
      {items.map((p) => (
        <label key={p.clave} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={permisos.has(p.clave)} onChange={() => toggle(p.clave)} />
          {p.nombre}
        </label>
      ))}
    </div>
  );
}

/**
 * Editor FINO de permisos: una tarjeta por módulo, adentro sus SECCIONES (qué
 * pantallas ve — sin ninguna, el módulo desaparece entero para ese rol) y sus
 * ACCIONES (qué operaciones puede hacer dentro de lo que ve). El checkbox del
 * título marca/desmarca el módulo completo.
 */
function RolModal({ rol, catalogo, onGuardar, onCerrar }) {
  const esAlta = !rol;
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '');
  const [permisos, setPermisos] = useState(() => new Set(rol?.permisos ?? []));
  const [guardando, setGuardando] = useState(false);

  const toggle = (clave) => setPermisos((prev) => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  /** Marca o desmarca un lote entero (el "todo" de un módulo). */
  const setLote = (claves, valor) => setPermisos((prev) => {
    const n = new Set(prev);
    for (const c of claves) { if (valor) n.add(c); else n.delete(c); }
    return n;
  });

  const totalSecciones = catalogo.reduce(
    (a, g) => a + g.secciones.filter((p) => permisos.has(p.clave)).length, 0,
  );

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar({ nombre, descripcion, permisos: [...permisos] });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <ModalShell
      title={esAlta ? 'Nuevo rol' : `Permisos de ${rol.nombre}`}
      size="lg"
      onClose={onCerrar}
      footer={[
        { texto: 'Cancelar', clase: 'btn-ghost', onClick: onCerrar },
        { texto: guardando ? 'Guardando…' : `Guardar (${permisos.size} permisos)`, clase: 'btn-primary', onClick: guardar },
      ]}
    >
      <div className={s['form-grid']}>
        <div className={s.field}>
          <label>Nombre <span className={s.req}>*</span></label>
          <input autoFocus={esAlta} value={nombre} placeholder="Ej: Encargado de depósito" onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className={s.field}>
          <label>Descripción</label>
          <input value={descripcion} placeholder="Qué hace este rol en el día a día" onChange={(e) => setDescripcion(e.target.value)} />
        </div>
      </div>

      <div className={cx(s.callout, totalSecciones === 0 ? s.warn : s.info)} style={{ margin: '4px 0 10px' }}>
        {totalSecciones === 0
          ? <>Sin <strong>ninguna sección</strong> marcada, este rol entra al sistema y no ve nada de nada.</>
          : <><strong>Secciones</strong> = qué pantallas ve · <strong>Acciones</strong> = qué operaciones puede hacer dentro de lo que ve. Un módulo sin secciones desaparece entero del menú.</>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--crm-space-4)' }}>
        {catalogo.map((g) => {
          const clavesGrupo = [...g.secciones, ...g.acciones].map((p) => p.clave);
          return (
            <div key={g.grupo} className={s.card} style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <CheckTodo claves={clavesGrupo} permisos={permisos} onSet={setLote} label={g.grupo} />
                <span className={s.muted} style={{ fontSize: 11.5 }}>
                  {g.secciones.filter((p) => permisos.has(p.clave)).length}/{g.secciones.length} secc.
                </span>
              </div>
              <ListaPermisos titulo="Secciones" items={g.secciones} permisos={permisos} toggle={toggle} />
              <ListaPermisos titulo="Acciones" items={g.acciones} permisos={permisos} toggle={toggle} />
            </div>
          );
        })}
      </div>
      <div className={s.hint}>
        Los cambios llegan a los usuarios con este rol al recargar la pantalla (F5) —
        sin volver a iniciar sesión.
      </div>
    </ModalShell>
  );
}

/* ---------------- Página ---------------- */

export function GerenciaPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { planIncluye, limites } = usePlan();
  // Solo las secciones del rol: lo no asignado no existe en el menú. El plan
  // NO filtra acá a propósito — una sección que el rol puede ver pero el plan
  // no incluye sigue en el sub-menú (con su candado), para que el dueño vea
  // qué se desbloquea si sube de plan en vez de que desaparezca sin explicación.
  const secciones = useMemo(() => GERENCIA_SECCIONES.filter((x) => can(x.permiso)), [can]);
  const [seccion, setSeccion] = useState(secciones[0]?.id);
  const [tab, setTab] = useState('usuarios');
  const [usuarios, setUsuarios] = useState(null);
  const [roles, setRoles] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [modal, setModal] = useState(null); // {tipo:'usuario'|'rol'|'sucursal', datos}

  /*
   * Solo se pide si el rol PUEDE ver Usuarios y roles. Antes se pedía siempre,
   * y como los tres endpoints exigen `gerencia.usuarios`, el rol Administrador
   * —que tiene las otras cinco secciones de Gerencia pero no esta— se comía
   * TRES 403 cada vez que entraba, con un aviso de error que ni siquiera se ve
   * (vive dentro del panel de usuarios, que ese rol no abre).
   */
  const cargar = useCallback(async () => {
    if (!can('gerencia.usuarios')) { setUsuarios([]); return; }
    try {
      const [us, rs, sc] = await Promise.all([
        httpClient.get('/usuarios'),
        httpClient.get('/roles'),
        httpClient.get('/sucursales'),
      ]);
      setUsuarios(us); setRoles(rs); setSucursales(sc);
    } catch (e) {
      setAviso({ tipo: 'err', texto: e?.data?.message || 'No se pudo conectar con la API.' });
      setUsuarios([]);
    }
  }, [can]);
  useEffect(() => { cargar(); }, [cargar]);

  /*
   * El catálogo de permisos va APARTE y una sola vez: es una constante del
   * servidor (8 grupos, 71 claves, ~5 KB). Estaba adentro de `cargar()`, que
   * corre después de cada guardado, así que desactivar cinco usuarios se
   * bajaba cinco veces la misma tabla que nunca cambia.
   */
  useEffect(() => {
    if (!can('gerencia.usuarios')) return;
    httpClient.get('/roles/permisos').then(setCatalogo).catch(() => setCatalogo([]));
  }, [can]);

  // El aviso se va solo: es una confirmación, no un estado permanente.
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const ultimoError = useRef(null);
  const mutar = useCallback(async (fn, okMsg) => {
    try {
      await fn();
      setAviso({ tipo: 'ok', texto: okMsg });
      await cargar();
      return true;
    } catch (e) {
      ultimoError.current = e?.data?.message || 'No se pudo guardar.';
      setAviso({ tipo: 'err', texto: ultimoError.current });
      return false;
    }
  }, [cargar]);

  const nombreRol = useMemo(() => new Map(roles.map((r) => [r.id, r.nombre])), [roles]);

  const pagUsuarios = usePaginado(usuarios ?? [], 'gerenciaUsuarios');

  // El plan pone un tope a las sucursales (null = sin tope): al llegar, el botón avisa en vez de fallar al guardar.
  const topeSucursales = limites.sucursales ?? null;
  const sucursalesAlTope = topeSucursales !== null && sucursales.length >= topeSucursales;
  if (!secciones.length) {
    return (
      <div style={{ padding: 'var(--crm-space-6)' }}>
        <PanelHead title="Gerencia" desc="Usuarios, roles y permisos del sistema." />
        <div className={cx(s.callout, s.warn)}>
          Tu rol no tiene ninguna sección de <strong>Gerencia</strong> asignada.
        </div>
      </div>
    );
  }

  // Si el permiso de la sección activa se fue (rol editado), cae a la primera visible.
  const activa = secciones.find((x) => x.id === seccion) ?? secciones[0];
  const activaBloqueadaPorPlan = !activa.pronto && !planIncluye(activa.permiso);

  const panelUsuarios = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead
        title="Usuarios y roles"
        desc={`Sesión de ${user?.name ?? '—'} (superadmin). Los usuarios entran con su contraseña; cada rol define qué puede hacer cada uno.`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Cada pestaña ofrece SU alta: sin esta separación, la de
                sucursales ofrecía "+ Nuevo rol", que no es lo que se mira. */}
            {tab === 'usuarios' && (
              <Btn variant="btn-primary" onClick={() => setModal({ tipo: 'usuario', datos: null })}>+ Nuevo usuario</Btn>
            )}
            {tab === 'roles' && (
              <Btn variant="btn-primary" onClick={() => setModal({ tipo: 'rol', datos: null })}>+ Nuevo rol</Btn>
            )}
            {tab === 'sucursales' && (
              <Btn
                variant="btn-primary"
                disabled={sucursalesAlTope}
                onClick={() => setModal({ tipo: 'sucursal', datos: null })}
              >
                + Nueva sucursal
              </Btn>
            )}
            <AyudaButton categoriaId="gerencia-usuarios" />
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 8 }}>
        {[['usuarios', 'Usuarios'], ['roles', 'Roles y permisos'], ['sucursales', 'Sucursales']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cx(s.badge)}
            style={{
              cursor: 'pointer', padding: '7px 16px', fontSize: 13,
              border: `1px solid ${tab === id ? 'var(--crm-color-primary)' : 'var(--crm-color-border)'}`,
              ...(tab === id
                ? { background: 'var(--crm-color-primary)', color: 'var(--crm-color-primary-contrast)' }
                : {}),
            }}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {aviso && (
        <div className={cx(s.callout, aviso.tipo === 'ok' ? s.info : s.warn)} style={{ margin: 0 }}>
          {aviso.texto}
        </div>
      )}

      {tab === 'usuarios' && (
        <Table
          cols={[
            { h: 'Usuario' }, { h: 'Rol' }, { h: 'Estado' }, { h: 'Contraseña' },
            { h: 'Acciones', cls: 'actions-col' },
          ]}
          empty={usuarios === null ? 'Cargando…' : 'Sin usuarios.'}
          pag={pagUsuarios}
        >
          {pagUsuarios.visibles.map((u) => {
            const esSuper = u.rolClave === 'superadmin';
            return (
              <tr key={u.id} style={u.activo ? undefined : { opacity: 0.55 }}>
                <td>
                  <strong>{u.nombre}</strong>
                  {esSuper && <span className={cx(s.pill, s['st-disponible'])} style={{ marginLeft: 6 }}>Superadmin</span>}
                </td>
                <td>{nombreRol.get(u.rolId) ?? u.rolNombre}</td>
                <td>
                  <span className={cx(s.pill, u.activo ? s['st-disponible'] : s['est-cancelada'])}>
                    {u.activo ? 'Activo' : 'Desactivado'}
                  </span>
                </td>
                <td>{u.tienePassword ? '••••••' : <span style={{ color: 'var(--crm-color-accent-2)', fontWeight: 600 }}>sin definir</span>}</td>
                <td className={s['actions-col']}>
                  <div className={s['row-actions']}>
                    <Btn variant="btn-edit" small onClick={() => setModal({ tipo: 'usuario', datos: u })}>Editar</Btn>
                    <Btn
                      small
                      variant={u.activo ? 'btn-delete' : 'btn-ingreso'}
                      onClick={() => mutar(
                        () => httpClient.patch(`/usuarios/${u.id}`, { activo: !u.activo }),
                        u.activo ? `${u.nombre} desactivado.` : `${u.nombre} reactivado.`,
                      )}
                    >
                      {u.activo ? 'Desactivar' : 'Reactivar'}
                    </Btn>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {tab === 'roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--crm-space-4)' }}>
          {roles.map((r) => {
            const esSuper = r.clave === 'superadmin';
            return (
              <div key={r.id} className={s.card} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{r.nombre}</strong>
                  {r.esSistema && <span className={cx(s.pill, s['est-pendiente'])}>Sistema</span>}
                  <span style={{ flex: 1 }} />
                  <span className={s.muted} style={{ fontSize: 12.5 }}>{r.usuarios} usuario(s)</span>
                </div>
                <div className={s.muted} style={{ fontSize: 13 }}>{r.descripcion || '—'}</div>
                <div style={{ fontSize: 12.5 }}>
                  {r.permisos.includes('*')
                    ? <strong style={{ color: 'var(--crm-color-primary)' }}>Todos los permisos</strong>
                    : `${r.permisos.length} permiso(s)`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  {esSuper ? (
                    <span className={s.muted} style={{ fontSize: 12.5 }}>Maneja todo el sistema — no se toca.</span>
                  ) : (
                    <>
                      <Btn variant="btn-edit" small onClick={() => setModal({ tipo: 'rol', datos: r })}>Editar permisos</Btn>
                      {!r.esSistema && r.usuarios === 0 && (
                        <Btn variant="btn-delete" small onClick={() => mutar(
                          () => httpClient.delete(`/roles/${r.id}`), `Rol ${r.nombre} eliminado.`,
                        )}>Eliminar</Btn>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'sucursales' && (
        <>
          <div className={cx(s.callout, s.info)}>
            Cada local tiene <strong>su propio punto de venta de ARCA</strong>, declarado contra su
            domicilio y con su numeración correlativa aparte. El <strong>domicilio</strong> de acá
            es el que sale impreso en la factura de ese local — no el de la empresa.
          </div>
          {sucursalesAlTope && (
            <div className={cx(s.callout, s.warn)}>
              Tu plan admite hasta <strong>{topeSucursales} sucursal{topeSucursales === 1 ? '' : 'es'}</strong> y ya
              están cargadas. Para sumar otra hay que subir de plan: hablá con CheCAT.
            </div>
          )}
          <Table
            cols={[
              { h: 'Sucursal' }, { h: 'Tipo' }, { h: 'Punto de venta' },
              { h: 'Domicilio del comprobante' }, { h: 'Acciones', cls: 'actions-col' },
            ]}
            empty="Sin sucursales."
          >
            {sucursales.map((su) => (
              <tr key={su.id}>
                <td><strong>{su.nombre}</strong></td>
                <td className={s.muted}>{su.tipo === 'distribuidora' ? 'Distribuidora' : 'Express'}</td>
                <td style={{ fontFamily: 'var(--crm-font-mono, monospace)' }}>
                  {su.puntoVenta || <span className={s.muted}>—</span>}
                </td>
                <td>{su.direccion || <span className={s.muted}>—</span>}</td>
                <td className={s['actions-col']}>
                  <div className={s['row-actions']}>
                    <Btn variant="btn-edit" small onClick={() => setModal({ tipo: 'sucursal', datos: su })}>Editar</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <div className={s.hint}>
            Dejar el punto de venta vacío es válido con <strong>un solo local</strong>: ahí se usa el
            de la configuración del servidor. Con varios, cada uno necesita el suyo. El estado de la
            conexión y el último número autorizado de cada punto de venta están en{' '}
            <strong>Ventas › Configuración</strong>.
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ padding: 'var(--crm-space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead title="Gerencia" desc="Administración y tablero de gestión del negocio." />

      {/* Mismo shell que Compras/Almacén: sub-menú lateral + panel activo. */}
      <div className={s.shell}>
        <nav className={s.subnav} aria-label="Secciones de Gerencia">
          {secciones.map((x) => {
            const Icon = x.icon;
            return (
              <button
                key={x.id}
                type="button"
                className={cx(s.subnavItem, activa.id === x.id && s.subnavItemActive)}
                onClick={() => setSeccion(x.id)}
              >
                <span className={s.subnavIcon}><Icon fontSize="small" /></span>
                <span className={s.subnavLabel}>{x.label}</span>
                {x.pronto && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', padding: '2px 7px',
                    borderRadius: 999, border: '1px solid var(--crm-color-border)',
                    color: 'var(--crm-color-text-muted)', whiteSpace: 'nowrap',
                  }}>
                    PRONTO
                  </span>
                )}
                {!x.pronto && !planIncluye(x.permiso) && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', padding: '2px 7px',
                    borderRadius: 999, border: '1px solid var(--crm-color-warning)',
                    color: 'var(--crm-color-warning)', whiteSpace: 'nowrap',
                  }}>
                    PLAN
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={s.content}>
          {/* Cada sección construida tiene su panel; lo agendado dice "pronto";
              lo construido que el plan no trae dice "mejorá tu plan". */}
          {activaBloqueadaPorPlan ? <MejoraTuPlan seccion={activa} />
            : activa.id === 'rentabilidad' ? <RentabilidadPanel />
              : activa.id === 'reportes' ? <ReportesVentasPanel />
                : activa.id === 'valorizacion' ? <ValorizacionPanel />
                  : activa.id === 'auditoria' ? <AuditoriaPanel />
                    : activa.id === 'configuracion' ? <ConfiguracionPanel />
                      : activa.pronto ? <Proximamente seccion={activa} /> : panelUsuarios}
        </div>
      </div>

      {modal?.tipo === 'usuario' && (
        <UsuarioModal
          usuario={modal.datos}
          roles={roles}
          onCerrar={() => setModal(null)}
          onGuardar={(payload) => (modal.datos
            ? mutar(() => httpClient.patch(`/usuarios/${modal.datos.id}`, payload), 'Usuario actualizado.')
            : mutar(() => httpClient.post('/usuarios', payload), 'Usuario creado.'))}
        />
      )}
      {modal?.tipo === 'sucursal' && (
        <SucursalModal
          sucursal={modal.datos}
          sucursales={sucursales}
          onCerrar={() => setModal(null)}
          onGuardar={async (payload) => {
            const ok = await (modal.datos
              ? mutar(() => httpClient.patch(`/sucursales/${modal.datos.id}`, payload), 'Sucursal actualizada.')
              : mutar(() => httpClient.post('/sucursales', payload), 'Sucursal creada.'));
            return ok ? null : ultimoError.current;
          }}
        />
      )}
      {modal?.tipo === 'rol' && (
        <RolModal
          rol={modal.datos}
          catalogo={catalogo}
          onCerrar={() => setModal(null)}
          onGuardar={(payload) => (modal.datos
            ? mutar(() => httpClient.patch(`/roles/${modal.datos.id}`, payload), 'Permisos actualizados.')
            : mutar(() => httpClient.post('/roles', payload), 'Rol creado.'))}
        />
      )}
    </div>
  );
}
