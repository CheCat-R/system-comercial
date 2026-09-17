/**
 * El padrón de usuarios (§7).
 *
 * Reemplaza al scaffold que vivía dentro del componente con un `useState` y
 * cuatro personas con roles de un equipo de desarrollo. Acá el rol **es** un
 * paquete de permisos, y cada acción se pide al `api/`, que la puede rechazar:
 * los botones no desaparecen, se muestran deshabilitados **con el motivo**.
 */
import { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";

import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import StepUpDialog from "./components/StepUpDialog";
import ChangeLog from "./components/ChangeLog";
import ReasonDialog from "./components/ReasonDialog";

import {
  listUsers, getUser, inviteUser, setUserRole, setUserStatus, setException, unlockUser,
  listRoles, ACCOUNT_STATES, getSecuritySummary, listPermissions, getPermission, getGrade,
} from "./api/securityApi";
import "./Seguridad.css";

const stamp = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "nunca");

const initials = (name = "") => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const Usuarios = () => {
  const { showToast } = useToast();
  const { user: me, check } = useAuth();

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const { filtros, setFiltros } = useVistaGuardada("usuarios", { search: "", rol: "", estado: "" });
  const { search, rol: roleKey, estado: status } = filtros;
  const [openInvite, setOpenInvite] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", roleKey: "lectura", title: "" });
  const [newPermission, setNewPermission] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [permissionAsk, setPermissionAsk] = useState(null);
  const [askError, setAskError] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const users = useMemo(() => listUsers({ search, roleKey, status }), [search, roleKey, status, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getSecuritySummary(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const detail = useMemo(() => (detailId ? getUser(detailId) : null), [detailId, version]);

  const roles = listRoles();
  const canManage = check("seguridad.usuarios");
  const canPermissions = check("seguridad.permisos");

  const run = (result, okMessage) => {
    if (!result.ok) {
      // Quedar en la cola no es un error: es el resultado esperado de una
      // operación de grado «con aprobación». Se dice distinto a propósito.
      showToast(result.error, result.queued ? "info" : "warning");
      if (result.needsStepUp) setStepUp(true);
      refresh();
      return false;
    }
    if (okMessage) showToast(okMessage, "success");
    refresh();
    return true;
  };

  /**
   * ⭐ Cambiar permisos es `con aprobación` **y** con step-up: es el permiso que
   * otorga permisos. La pantalla pide el motivo antes; el resto lo decide el
   * portón, y por eso el pedido queda en la cola aunque quien lo pida sea
   * administrador.
   */
  const askReason = (action, title, preview, exec) =>
    setPermissionAsk({ action, title, preview, exec });

  const handleInvite = () => {
    if (run(inviteUser(form), `Invitación enviada a ${form.email}.`)) {
      setOpenInvite(false);
      setForm({ name: "", email: "", roleKey: "lectura", title: "" });
    }
  };

  const columns = [
    {
      field: "name", headerName: "Usuario",
      renderCell: (u) => (
        <Box className="sec-user">
          <Avatar className="sec-user__avatar">{initials(u.name)}</Avatar>
          <div>
            <strong>{u.name}{u.id === me?.id && <span className="sec-chip sec-chip--inline">vos</span>}</strong>
            <em>{u.email}</em>
          </div>
        </Box>
      ),
    },
    {
      field: "roleKey", headerName: "Rol",
      renderCell: (u) => (
        <Tooltip title={u.roleMeta.hint}>
          <span className={`sec-chip sec-chip--${u.roleMeta.tone}`}>{u.roleMeta.label}</span>
        </Tooltip>
      ),
    },
    {
      field: "permissions", headerName: "Permisos", align: "center",
      renderCell: (u) => (
        <Tooltip title="Permisos efectivos: los del rol, más o menos las excepciones nominales.">
          <span className="text-tertiary nowrap">{u.permissions.length}</span>
        </Tooltip>
      ),
    },
    {
      field: "exceptions", headerName: "Excepciones", align: "center",
      renderCell: (u) => {
        const n = (u.extraPermissions?.length || 0) + (u.deniedPermissions?.length || 0);
        return n === 0
          ? <span className="text-tertiary">—</span>
          : <span className="sec-chip sec-chip--warning">{n}</span>;
      },
    },
    {
      field: "status", headerName: "Estado",
      renderCell: (u) => (
        <Tooltip title={u.locked ? `Bloqueada ${u.lockMinutes} min más` : u.statusMeta.hint}>
          <span><StatusBadge tone={u.statusMeta.tone} label={u.locked ? "Bloqueada" : u.statusMeta.label} /></span>
        </Tooltip>
      ),
    },
    {
      field: "lastLoginAt", headerName: "Último ingreso",
      renderCell: (u) => <span className="text-tertiary nowrap">{stamp(u.lastLoginAt)}</span>,
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Usuarios"
        subtitle="El padrón del panel. El rol no es una etiqueta: es un paquete de permisos, y se resuelve en un solo lugar."
        actions={(
          <Tooltip title={canManage.allowed ? "" : canManage.reason}>
            <span>
              <Button
                variant="primary" startIcon={<PersonAddAltOutlinedIcon />}
                disabled={!canManage.allowed} onClick={() => setOpenInvite(true)}
              >
                Invitar
              </Button>
            </span>
          </Tooltip>
        )}
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{summary.users}</strong><span>usuarios</span></div>
        <div className="sec-summary__item"><strong>{summary.active}</strong><span>activos</span></div>
        <div className="sec-summary__item"><strong>{summary.admins}</strong><span>administradores</span></div>
        <div className="sec-summary__item"><strong>{summary.invited}</strong><span>invitados sin entrar</span></div>
        <div className="sec-summary__item"><strong>{summary.suspended + summary.blocked}</strong><span>sin acceso</span></div>
        <div className="sec-summary__item"><strong>{summary.exceptions}</strong><span>excepciones nominales</span></div>
      </Box>

      <Card className="entity-card sec-note">
        <StatusBadge tone="info" label="Alta por invitación" showDot={false} />
        <span>
          Nadie se registra solo en un panel de gestión. Una cuenta invitada existe, puede entrar, y
          recién entonces pasa a <strong>activa</strong>. Y las bajas <strong>desactivan, no
          borran</strong>: borrar al usuario dejaría huérfano su rastro de auditoría.
        </span>
      </Card>

      <Box className="table-tabs">
        <TextField select size="small" label="Rol" value={roleKey} onChange={(e) => setFiltros({ rol: e.target.value })} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {roles.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Estado" value={status} onChange={(e) => setFiltros({ estado: e.target.value })} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.values(ACCOUNT_STATES).map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small" placeholder="Buscar por nombre o email…"
          value={search} onChange={(e) => setFiltros({ search: e.target.value })} sx={{ minWidth: 260 }}
        />
      </Box>

      <DataTable
        columns={columns}
        data={users}
        emptyMessage="Nadie coincide con ese filtro."
        onRowClick={(row) => setDetailId(row.id)}
      />

      {/* ------------------------------------------------------ invitar */}
      {openInvite && (
        <Modal
          open onClose={() => setOpenInvite(false)} maxWidth="sm"
          title="Invitar a alguien"
          subtitle="La cuenta queda invitada hasta que entre por primera vez."
          actions={(
            <>
              <Button variant="ghost" onClick={() => setOpenInvite(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleInvite}>Invitar</Button>
            </>
          )}
        >
          <Box className="sec-form">
            <TextField size="small" fullWidth label="Nombre y apellido" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField size="small" fullWidth label="Email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField size="small" fullWidth label="Puesto (opcional)" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField select size="small" fullWidth label="Rol" value={form.roleKey}
              onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
              {roles.map((r) => (
                <MenuItem key={r.key} value={r.key}>{r.label} — {r.hint}</MenuItem>
              ))}
            </TextField>
          </Box>
        </Modal>
      )}

      {/* ------------------------------------------------------- detalle */}
      {detail && (
        <Modal
          open onClose={() => setDetailId(null)} maxWidth="md"
          title={detail.name}
          subtitle={`${detail.email} · ${detail.title || "sin puesto declarado"}`}
          actions={<Button variant="ghost" onClick={() => setDetailId(null)}>Cerrar</Button>}
        >
          <Box className="sec-form">
            <Box className="sec-kv">
              <span>Estado</span>
              <div>
                <StatusBadge tone={detail.statusMeta.tone} label={detail.statusMeta.label} />
                <em className="sec-hint">{detail.statusMeta.hint}</em>
              </div>
              <span>Contraseña</span>
              <div>
                {detail.passwordSet ? "Definida" : "Todavía no la definió"}
                <em className="sec-hint">⭐ El panel no guarda contraseñas: sólo si está definida.</em>
              </div>
              <span>Creada</span><div>{stamp(detail.createdAt)}{detail.invitedBy && ` · invitada por ${getUser(detail.invitedBy)?.name || detail.invitedBy}`}</div>
              <span>Último ingreso</span><div>{stamp(detail.lastLoginAt)}</div>
            </Box>

            {/* ⭐ El permiso que otorga permisos pide re-autenticarse. Sin una
                 salida acá, quedaría bloqueado sin forma de cumplirlo. */}
            {canPermissions.needsStepUp && (
              <Box className="sec-callout sec-callout--step">
                <span>
                  <strong>Cambiar roles y permisos pide confirmar tu identidad.</strong>{" "}
                  Tu sesión está abierta, pero esta acción quiere saber que sos vos, ahora.
                </span>
                <Button variant="primary" onClick={() => setStepUp(true)}>Confirmar identidad</Button>
              </Box>
            )}

            {/* rol */}
            <div>
              <span className="sec-label">Rol</span>
              <Tooltip title={canPermissions.allowed ? "" : canPermissions.reason}>
                <span>
                  <TextField
                    select size="small" fullWidth value={detail.roleKey}
                    disabled={!canPermissions.allowed || detail.id === me?.id}
                    onChange={(e) => askReason(
                      "seguridad.permisos",
                      `Cambiar el rol de ${detail.name}`,
                      `${detail.roleMeta.label} → ${roles.find((r) => r.key === e.target.value)?.label}`,
                      (reason) => setUserRole(detail.id, e.target.value, { reason }),
                    )}
                    helperText={detail.id === me?.id
                      ? "Nadie puede editar su propio rol. Pedíselo a otro administrador."
                      : (canPermissions.allowed ? detail.roleMeta.hint : canPermissions.reason)}
                  >
                    {roles.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
                  </TextField>
                </span>
              </Tooltip>
            </div>

            {/* estado */}
            <div>
              <span className="sec-label">Acceso</span>
              <Box className="sec-row">
                {Object.values(ACCOUNT_STATES).filter((s) => s.key !== "bloqueada").map((s) => (
                  <Button
                    key={s.key}
                    variant={detail.status === s.key ? "primary" : "secondary"}
                    disabled={!canManage.allowed}
                    onClick={() => run(setUserStatus(detail.id, s.key), `La cuenta quedó ${s.label.toLowerCase()}.`)}
                  >
                    {s.label}
                  </Button>
                ))}
                {detail.locked && (
                  <Button
                    variant="danger" startIcon={<LockOpenOutlinedIcon />} disabled={!canManage.allowed}
                    onClick={() => run(unlockUser(detail.id), "Cuenta desbloqueada.")}
                  >
                    Desbloquear ({detail.lockMinutes} min)
                  </Button>
                )}
              </Box>
            </div>

            {/* excepciones */}
            <div>
              <span className="sec-label">Excepciones nominales</span>
              <p className="sec-hint">
                ⭐ Un permiso suelto por encima o por debajo del rol, <strong>visible como
                excepción</strong> — en vez de diluido en un rol nuevo llamado «Operaciones 2».
              </p>

              <Box className="sec-exceptions">
                {[...(detail.extraPermissions || []).map((k) => ({ key: k, mode: "permitir" })),
                  ...(detail.deniedPermissions || []).map((k) => ({ key: k, mode: "denegar" }))]
                  .map(({ key, mode }) => {
                    const permission = getPermission(key);
                    return (
                      <div className={`sec-exception is-${mode}`} key={`${mode}-${key}`}>
                        <span className={`sec-chip sec-chip--${mode === "permitir" ? "success" : "danger"}`}>
                          {mode === "permitir" ? "+" : "−"}
                        </span>
                        <div>
                          <strong>{permission?.label || key}</strong>
                          <em>{key} · {getGrade(permission?.grade).label}</em>
                        </div>
                        <Box sx={{ flex: 1 }} />
                        <Button
                          variant="ghost" disabled={!canPermissions.allowed}
                          onClick={() => askReason(
                            "seguridad.permisos",
                            `Quitar la excepción de ${detail.name}`,
                            `${permission?.label || key}: vuelve a lo que da el rol`,
                            (reason) => setException(detail.id, key, "quitar", { reason }),
                          )}
                        >
                          Quitar
                        </Button>
                      </div>
                    );
                  })}

                {(detail.extraPermissions?.length || 0) + (detail.deniedPermissions?.length || 0) === 0 && (
                  <p className="sec-hint">Sin excepciones: tiene exactamente lo que da su rol.</p>
                )}
              </Box>

              <Box className="sec-row">
                <TextField
                  select size="small" label="Permiso" value={newPermission}
                  onChange={(e) => setNewPermission(e.target.value)} sx={{ minWidth: 320 }}
                  disabled={!canPermissions.allowed}
                >
                  {listPermissions().map((p) => (
                    <MenuItem key={p.key} value={p.key}>{p.module} · {p.label}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="secondary" disabled={!canPermissions.allowed || !newPermission}
                  onClick={() => askReason(
                    "seguridad.permisos",
                    `Permitir un permiso suelto a ${detail.name}`,
                    `${getPermission(newPermission)?.label}: permitido por encima del rol`,
                    (reason) => setException(detail.id, newPermission, "permitir", { reason }),
                  )}
                >
                  Permitir
                </Button>
                <Button
                  variant="secondary" disabled={!canPermissions.allowed || !newPermission}
                  onClick={() => askReason(
                    "seguridad.permisos",
                    `Revocar un permiso a ${detail.name}`,
                    `${getPermission(newPermission)?.label}: denegado aunque el rol lo incluya`,
                    (reason) => setException(detail.id, newPermission, "denegar", { reason }),
                  )}
                >
                  Denegar
                </Button>
              </Box>
            </div>

            <ChangeLog
              subjectType="user"
              subjectId={detail.id}
              title="Qué se le cambió a esta cuenta"
              limit={4}
              card={false}
            />

            <Box className="sec-callout">
              <span>
                Permisos efectivos: <strong>{detail.permissions.length}</strong> de{" "}
                {listPermissions().length}. Se calculan del rol más las excepciones, y se resuelven
                en <code className="sec-code">seguridad/lib/roles.js</code> — el mismo lugar para
                todo el panel.
              </span>
            </Box>
          </Box>
        </Modal>
      )}

      <ReasonDialog
        open={Boolean(permissionAsk)}
        action={permissionAsk?.action || "seguridad.permisos"}
        title={permissionAsk?.title}
        preview={permissionAsk?.preview}
        error={askError}
        onClose={() => { setPermissionAsk(null); setAskError(null); }}
        onConfirm={(reason) => {
          const result = permissionAsk.exec(reason);
          setPermissionAsk(null);
          setAskError(null);
          run(result, "Cambio aplicado.");
        }}
      />

      <StepUpDialog
        open={stepUp}
        action="Cambiar roles y permisos"
        onClose={() => setStepUp(false)}
        onDone={() => { showToast("Identidad confirmada. Volvé a intentar el cambio.", "success"); refresh(); }}
      />
    </Box>
  );
};

export default Usuarios;
