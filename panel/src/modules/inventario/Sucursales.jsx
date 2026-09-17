/**
 * Sucursales y equipos, contra la API.
 *
 * El modelo del sistema es una DISTRIBUIDORA (la central: el depósito de donde
 * sale y a donde entra la mercadería) y N locales EXPRESS. Cada sucursal tiene
 * su punto de venta de ARCA y su domicilio impreso en la factura.
 *
 * Los EQUIPOS (terminales) fijan en qué sucursal opera todo el que se siente
 * ahí: el token vive en el navegador de esa máquina y se muestra UNA sola vez.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { seguridadApi } from "../seguridad/api/seguridadApi";
import { leerTokenTerminal, guardarTokenTerminal } from "../../app/api/sesion";
import "./Sucursales.css";

const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca");

const Sucursales = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const qc = useQueryClient();
  const puedeSucursales = check("gerencia.usuarios");
  const puedeTerminales = check("sistema.terminales");

  const [modal, setModal] = useState(null);       // { id?, nombre, tipo, puntoVenta, direccion }
  const [terminalModal, setTerminalModal] = useState(null); // { id?, nombre, sucursalId, activa }
  const [tokenNuevo, setTokenNuevo] = useState(null); // { nombre, token }
  const [esteEquipo, setEsteEquipo] = useState(Boolean(leerTokenTerminal()));

  const sucursales = useQuery({ queryKey: QK.sucursales, queryFn: seguridadApi.sucursales });
  const terminales = useQuery({ queryKey: QK.terminales, queryFn: seguridadApi.terminales, enabled: puedeTerminales.allowed });

  const err = (e) => showToast(e?.message || "No se pudo guardar.", "error");
  const okSuc = (msg) => { showToast(msg, "success"); qc.invalidateQueries({ queryKey: QK.sucursales }); qc.invalidateQueries({ queryKey: QK.opciones }); setModal(null); };

  const guardarSucursal = useMutation({
    mutationFn: (m) => (m.id ? seguridadApi.editarSucursal(m.id, m) : seguridadApi.crearSucursal(m)),
    onSuccess: () => okSuc("Sucursal guardada."), onError: err,
  });
  const borrarSucursal = useMutation({
    mutationFn: (id) => seguridadApi.borrarSucursal(id),
    onSuccess: () => okSuc("Sucursal borrada."), onError: err,
  });
  const guardarTerminal = useMutation({
    mutationFn: (m) => (m.id ? seguridadApi.editarTerminal(m.id, m) : seguridadApi.crearTerminal(m)),
    onSuccess: (r, m) => {
      qc.invalidateQueries({ queryKey: QK.terminales });
      setTerminalModal(null);
      if (!m.id && r?.token) setTokenNuevo({ nombre: r.terminal?.nombre, token: r.token });
      else showToast("Equipo guardado.", "success");
    },
    onError: err,
  });
  const borrarTerminal = useMutation({
    mutationFn: (id) => seguridadApi.borrarTerminal(id),
    onSuccess: () => { showToast("Equipo borrado.", "info"); qc.invalidateQueries({ queryKey: QK.terminales }); }, onError: err,
  });

  const vincularEsteEquipo = (token) => {
    guardarTokenTerminal(token);
    setEsteEquipo(true);
    showToast("Este navegador quedó registrado como ese equipo: al entrar, la sucursal ya viene dada.", "success");
  };
  const desvincular = () => { guardarTokenTerminal(""); setEsteEquipo(false); showToast("Este navegador ya no es una terminal.", "info"); };

  const columnasTerminales = [
    { field: "nombre", headerName: "Equipo", renderCell: (t) => <Box className="inv-wh-row"><ComputerOutlinedIcon fontSize="small" /><span className="inv-wh-row__name">{t.nombre}</span></Box> },
    { field: "sucursalNombre", headerName: "Sucursal" },
    { field: "activa", headerName: "Estado", renderCell: (t) => <StatusBadge status={t.activa ? "activo" : "inactivo"} label={t.activa ? "Activa" : "Dada de baja"} /> },
    { field: "ultimoUso", headerName: "Último uso", renderCell: (t) => <span className="text-tertiary nowrap">{stamp(t.ultimoUso)}</span> },
    {
      field: "acciones", headerName: "", align: "right", sortable: false,
      renderCell: (t) => (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Tooltip title="Editar"><IconButton size="small" onClick={(e) => { e.stopPropagation(); setTerminalModal({ id: t.id, nombre: t.nombre, sucursalId: t.sucursalId, activa: t.activa }); }}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Borrar"><IconButton size="small" onClick={(e) => { e.stopPropagation(); borrarTerminal.mutate(t.id); }}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Sucursales y equipos"
        subtitle="Una distribuidora (la central) y los locales. Cada uno con su punto de venta de ARCA y su domicilio."
        actions={(
          <Tooltip title={puedeSucursales.allowed ? "" : puedeSucursales.reason}>
            <span>
              <Button variant="primary" startIcon={<AddIcon />} disabled={!puedeSucursales.allowed}
                onClick={() => setModal({ nombre: "", tipo: "express", puntoVenta: "", direccion: "" })}>
                Nueva sucursal
              </Button>
            </span>
          </Tooltip>
        )}
      />

      <Box sx={{ display: "grid", gap: 2 }}>
        {(sucursales.data || []).map((s) => (
          <Card className="entity-card inv-branch-header" key={s.id}>
            <Box className="inv-branch-header__summary">
              <Box className="inv-branch-summary__title">
                <Typography className="inv-branch-summary__name">{s.nombre}</Typography>
                <StatusBadge tone={s.tipo === "distribuidora" ? "info" : "success"} label={s.tipo === "distribuidora" ? "Distribuidora · central" : "Express"} showDot={false} />
              </Box>
              <Typography className="inv-branch-summary__address" variant="body2" color="text.secondary">
                {s.direccion || "Sin domicilio"} · Punto de venta ARCA: {s.puntoVenta || "sin cargar"}
              </Typography>
            </Box>
            <Box className="inv-branch-header__actions">
              <Button size="small" variant="ghost" startIcon={<EditOutlinedIcon />} disabled={!puedeSucursales.allowed}
                onClick={() => setModal({ id: s.id, nombre: s.nombre, tipo: s.tipo, puntoVenta: s.puntoVenta, direccion: s.direccion })}>
                Editar
              </Button>
              <Button size="small" variant="danger" disabled={!puedeSucursales.allowed} onClick={() => borrarSucursal.mutate(s.id)}>Borrar</Button>
            </Box>
          </Card>
        ))}
        {sucursales.isLoading && <Typography color="text.secondary">Cargando…</Typography>}
      </Box>

      <Card className="entity-card" sx={{ mt: 3 }}>
        <Box className="table-tabs" sx={{ mb: 1 }}>
          <Box>
            <Typography className="card-title">Equipos (terminales)</Typography>
            <Typography variant="body2" color="text.secondary">
              El equipo sabe en qué sucursal está, así la cajera no tiene que acordarse. Registrarlo es decidir dónde opera todo el que se siente ahí.
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          {esteEquipo && <Button size="small" variant="ghost" onClick={desvincular}>Este navegador es una terminal · desvincular</Button>}
          <Tooltip title={puedeTerminales.allowed ? "" : puedeTerminales.reason}>
            <span>
              <Button size="small" variant="secondary" startIcon={<AddIcon />} disabled={!puedeTerminales.allowed}
                onClick={() => setTerminalModal({ nombre: "", sucursalId: sucursales.data?.[0]?.id ?? "", activa: true })}>
                Registrar equipo
              </Button>
            </span>
          </Tooltip>
        </Box>
        {puedeTerminales.allowed
          ? <DataTable columns={columnasTerminales} data={terminales.data || []} loading={terminales.isLoading} emptyMessage="Ningún equipo registrado todavía." />
          : <Typography variant="body2" color="text.secondary">{puedeTerminales.reason}</Typography>}
      </Card>

      {/* ---------------- sucursal ---------------- */}
      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? "Editar sucursal" : "Nueva sucursal"}
        actions={(
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button variant="primary" loading={guardarSucursal.isPending} onClick={() => guardarSucursal.mutate(modal)}>Guardar</Button>
          </>
        )}>
        {modal && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" required value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} />
            <TextField select label="Tipo" size="small" value={modal.tipo} onChange={(e) => setModal({ ...modal, tipo: e.target.value })}
              helperText="Una sola distribuidora: es de donde sale y a donde entra la mercadería.">
              <MenuItem value="distribuidora">Distribuidora (central)</MenuItem>
              <MenuItem value="express">Express (local)</MenuItem>
            </TextField>
            <TextField label="Punto de venta ARCA" size="small" value={modal.puntoVenta} onChange={(e) => setModal({ ...modal, puntoVenta: e.target.value })}
              helperText="Cinco dígitos. Cada local tiene el suyo: la numeración es correlativa por punto de venta." />
            <TextField label="Domicilio comercial" size="small" value={modal.direccion} onChange={(e) => setModal({ ...modal, direccion: e.target.value })}
              helperText="El que ARCA tiene declarado para ese punto de venta: va impreso en la factura." />
          </Box>
        )}
      </Modal>

      {/* ---------------- terminal ---------------- */}
      <Modal open={Boolean(terminalModal)} onClose={() => setTerminalModal(null)} title={terminalModal?.id ? "Editar equipo" : "Registrar equipo"}
        actions={(
          <>
            <Button variant="ghost" onClick={() => setTerminalModal(null)}>Cancelar</Button>
            <Button variant="primary" loading={guardarTerminal.isPending} onClick={() => guardarTerminal.mutate(terminalModal)}>Guardar</Button>
          </>
        )}>
        {terminalModal && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" required value={terminalModal.nombre} onChange={(e) => setTerminalModal({ ...terminalModal, nombre: e.target.value })}
              helperText='Cómo lo llaman en el local: "Caja 1", "Mostrador".' />
            <TextField select label="Sucursal" size="small" value={terminalModal.sucursalId} onChange={(e) => setTerminalModal({ ...terminalModal, sucursalId: e.target.value })}>
              {(sucursales.data || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            {terminalModal.id && (
              <FormControlLabel control={<Switch checked={terminalModal.activa} onChange={(e) => setTerminalModal({ ...terminalModal, activa: e.target.checked })} />}
                label="Activa (dada de baja, el login vuelve a preguntar la sucursal)" />
            )}
          </Box>
        )}
      </Modal>

      {/* ---------------- token recién creado ---------------- */}
      <Modal open={Boolean(tokenNuevo)} onClose={() => setTokenNuevo(null)} title={`Equipo "${tokenNuevo?.nombre}" registrado`}
        subtitle="El token se muestra UNA sola vez. Si este navegador es ese equipo, vinculalo ahora."
        actions={(
          <>
            <Button variant="ghost" onClick={() => setTokenNuevo(null)}>Cerrar</Button>
            <Button variant="primary" startIcon={<LinkOutlinedIcon />} onClick={() => { vincularEsteEquipo(tokenNuevo.token); setTokenNuevo(null); }}>
              Este navegador es ese equipo
            </Button>
          </>
        )}>
        <TextField fullWidth size="small" value={tokenNuevo?.token ?? ""} slotProps={{ input: { readOnly: true } }} helperText="Para vincular otra máquina, pegá el token en su navegador desde esta misma pantalla." />
      </Modal>
    </Box>
  );
};

export default Sucursales;
