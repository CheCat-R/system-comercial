/**
 * El padrón de usuarios, contra la API.
 *
 * El rol **es** un paquete de permisos y se resuelve del lado del servidor: acá
 * sólo se elige. Las reglas viven en la API y llegan como mensajes cuando se
 * rompen (último superadmin, rol de mando, contraseña corta), así que los
 * botones no adivinan: preguntan.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";

import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { seguridadApi } from "./api/seguridadApi";
import "./Seguridad.css";

const initials = (name = "") => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const FORM_VACIO = { nombre: "", rolId: "", password: "", activo: true, relevoCaja: false, pin: "" };

const Usuarios = () => {
  const { showToast } = useToast();
  const { user: me, check } = useAuth();
  const qc = useQueryClient();

  const { filtros, setFiltros } = useVistaGuardada("usuarios", { search: "", rol: "", estado: "" });
  const { search, rol: rolFiltro, estado } = filtros;
  const [abierto, setAbierto] = useState(null); // null | "alta" | usuario
  const [form, setForm] = useState(FORM_VACIO);

  const usuarios = useQuery({ queryKey: QK.usuarios, queryFn: seguridadApi.usuarios });
  const roles = useQuery({ queryKey: QK.roles, queryFn: seguridadApi.roles });

  const canManage = check("gerencia.usuarios");

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: QK.usuarios });
    qc.invalidateQueries({ queryKey: QK.roles });
    qc.invalidateQueries({ queryKey: QK.opciones });
  };

  const guardar = useMutation({
    mutationFn: (payload) => (abierto === "alta"
      ? seguridadApi.crearUsuario(payload)
      : seguridadApi.editarUsuario(abierto.id, payload)),
    onSuccess: () => {
      showToast(abierto === "alta" ? "Usuario creado." : "Usuario actualizado.", "success");
      invalidar();
      setAbierto(null);
    },
    onError: (err) => showToast(err?.message || "No se pudo guardar.", "error"),
  });

  const abrirAlta = () => {
    setForm({ ...FORM_VACIO, rolId: roles.data?.find((r) => r.clave === "cajero")?.id ?? "" });
    setAbierto("alta");
  };
  const abrirEdicion = (u) => {
    setForm({ nombre: u.nombre, rolId: u.rolId, password: "", activo: u.activo, relevoCaja: u.relevoCaja, pin: "" });
    setAbierto(u);
  };

  const enviar = (e) => {
    e.preventDefault();
    const payload = { nombre: form.nombre, rolId: Number(form.rolId), activo: form.activo, relevoCaja: form.relevoCaja };
    if (form.password) payload.password = form.password;
    if (form.pin) payload.pin = form.pin;
    if (abierto === "alta" && !form.password) { showToast("La contraseña es obligatoria en el alta.", "warning"); return; }
    guardar.mutate(payload);
  };

  const filas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usuarios.data || []).filter((u) => {
      if (rolFiltro && String(u.rolId) !== String(rolFiltro)) return false;
      if (estado === "activo" && !u.activo) return false;
      if (estado === "inactivo" && u.activo) return false;
      if (q && !u.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [usuarios.data, search, rolFiltro, estado]);

  const resumen = useMemo(() => {
    const us = usuarios.data || [];
    return {
      total: us.length,
      activos: us.filter((u) => u.activo).length,
      mando: us.filter((u) => u.permisos?.includes("*") || u.rolClave === "admin").length,
      sinPassword: us.filter((u) => !u.tienePassword).length,
      relevos: us.filter((u) => u.relevoCaja).length,
    };
  }, [usuarios.data]);

  const columns = [
    {
      field: "nombre", headerName: "Usuario", width: "34%",
      renderCell: (u) => (
        <Box className="sec-user">
          <Avatar className="sec-user__avatar">{initials(u.nombre)}</Avatar>
          <Box>
            <strong>{u.nombre}{u.id === me?.id && <span className="sec-chip sec-chip--inline">vos</span>}</strong>
            <span className="text-tertiary" style={{ display: "block", fontSize: "0.78rem" }}>
              {u.tienePassword ? "Con contraseña" : "Sin contraseña definida"}
            </span>
          </Box>
        </Box>
      ),
    },
    { field: "rolNombre", headerName: "Rol", renderCell: (u) => <StatusBadge tone={u.permisos?.includes("*") ? "danger" : "info"} label={u.rolNombre} showDot={false} /> },
    { field: "activo", headerName: "Estado", renderCell: (u) => <StatusBadge status={u.activo ? "activo" : "inactivo"} label={u.activo ? "Activo" : "Desactivado"} /> },
    { field: "relevoCaja", headerName: "Relevo de caja", renderCell: (u) => (u.relevoCaja ? <span className="sec-chip sec-chip--success">{u.tienePin ? "con PIN" : "sin PIN"}</span> : <span className="text-tertiary">—</span>) },
    { field: "permisos", headerName: "Permisos", align: "right", renderCell: (u) => <span className="nowrap">{u.permisos?.includes("*") ? "todos" : (u.permisos?.length ?? 0)}</span> },
  ];

  const rolElegido = roles.data?.find((r) => r.id === Number(form.rolId));
  const editandoMando = abierto !== "alta" && abierto && (abierto.permisos?.includes("*"));

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Usuarios"
        subtitle="El padrón del sistema. El rol no es una etiqueta: es un paquete de permisos que aplica la API en cada llamada."
        actions={(
          <Tooltip title={canManage.allowed ? "" : canManage.reason}>
            <span>
              <Button variant="primary" startIcon={<PersonAddAltOutlinedIcon />} disabled={!canManage.allowed} onClick={abrirAlta}>
                Nuevo usuario
              </Button>
            </span>
          </Tooltip>
        )}
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{resumen.total}</strong><span>usuarios</span></div>
        <div className="sec-summary__item"><strong>{resumen.activos}</strong><span>activos</span></div>
        <div className="sec-summary__item"><strong>{resumen.mando}</strong><span>de mando</span></div>
        <div className="sec-summary__item"><strong>{resumen.relevos}</strong><span>relevos de caja</span></div>
        <div className="sec-summary__item"><strong>{resumen.sinPassword}</strong><span>sin contraseña</span></div>
      </Box>

      <Card className="entity-card sec-note">
        <StatusBadge tone="info" label="Alta por administración" showDot={false} />
        <span>
          Nadie se registra solo. Las bajas <strong>desactivan, no borran</strong>: el usuario está en
          los historiales. Desactivar o cambiar la contraseña <strong>cierra sus sesiones al instante</strong>.
        </span>
      </Card>

      <Box className="table-tabs">
        <TextField select size="small" label="Rol" value={rolFiltro} onChange={(e) => setFiltros({ rol: e.target.value })} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {(roles.data || []).map((r) => <MenuItem key={r.id} value={r.id}>{r.nombre}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Estado" value={estado} onChange={(e) => setFiltros({ estado: e.target.value })} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="activo">Activos</MenuItem>
          <MenuItem value="inactivo">Desactivados</MenuItem>
        </TextField>
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="Buscar por nombre…" value={search} onChange={(e) => setFiltros({ search: e.target.value })} sx={{ minWidth: 260 }} />
      </Box>

      <DataTable
        columns={columns}
        data={filas}
        loading={usuarios.isLoading}
        emptyMessage={usuarios.isError ? "No se pudo cargar el padrón." : "Nadie coincide con ese filtro."}
        onRowClick={canManage.allowed ? abrirEdicion : undefined}
      />

      <Modal
        open={Boolean(abierto)}
        onClose={() => setAbierto(null)}
        title={abierto === "alta" ? "Nuevo usuario" : `Editar a ${abierto?.nombre ?? ""}`}
        subtitle={abierto === "alta" ? "Entra con nombre + contraseña + sucursal." : "Vacío = no cambiar la contraseña ni el PIN."}
        actions={(
          <>
            <Button variant="ghost" onClick={() => setAbierto(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-usuario" loading={guardar.isPending}>Guardar</Button>
          </>
        )}
      >
        <Box component="form" id="form-usuario" className="sec-form" onSubmit={enviar}>
          {editandoMando && !me?.permisos?.includes("*") && (
            <Box className="sec-callout sec-callout--step">Ese usuario es superadmin: sólo él puede editarse.</Box>
          )}
          <TextField label="Nombre" size="small" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <TextField select label="Rol" size="small" required value={form.rolId} onChange={(e) => setForm({ ...form, rolId: e.target.value })}
            helperText={rolElegido?.descripcion || ""}>
            {(roles.data || []).map((r) => <MenuItem key={r.id} value={r.id}>{r.nombre}</MenuItem>)}
          </TextField>
          <TextField
            label={abierto === "alta" ? "Contraseña" : "Nueva contraseña"} type="password" size="small" autoComplete="new-password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            helperText="Mínimo 8 caracteres." required={abierto === "alta"}
          />
          <FormControlLabel control={<Switch checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />} label="Puede entrar (activo)" />
          <FormControlLabel control={<Switch checked={form.relevoCaja} onChange={(e) => setForm({ ...form, relevoCaja: e.target.checked })} />} label="Puede relevar la caja de otro (firma con PIN)" />
          {form.relevoCaja && (
            <TextField label="PIN del relevo" size="small" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              helperText={abierto !== "alta" && abierto?.tienePin ? "Ya tiene PIN. Vacío = conservarlo." : "4 a 6 dígitos."} />
          )}
        </Box>
      </Modal>
    </Box>
  );
};

export default Usuarios;
