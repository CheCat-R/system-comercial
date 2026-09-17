import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import MoreVertIcon from "@mui/icons-material/MoreVert";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { listIncidents, markIncidentInGestion, resolveIncident } from "./api/logisticaApi";
import { INCIDENT_TYPES, INCIDENT_STATUS, RESOLUTIONS } from "./lib/incidents";
import { formatDateTime } from "./lib/time";
import "./Incidencias.css";

const STATUS_TABS = [
  { key: "", label: "Todas" },
  { key: "abierta", label: "Abiertas" },
  { key: "en_gestion", label: "En gestión" },
  { key: "resuelta", label: "Resueltas" },
];

const Incidencias = () => {
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [tab, setTab] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const rows = listIncidents({ status: STATUS_TABS[tab].key || undefined }).map((i) => ({ ...i, id: i.id }));
  const resolvingIncident = listIncidents().find((i) => i.id === resolvingId) || null;

  const handleInGestion = () => {
    markIncidentInGestion(activeRow.id);
    setAnchor(null);
    setTick((t) => t + 1);
    showToast("Incidencia marcada en gestión", "info");
  };

  const handleResolve = (resolution) => {
    resolveIncident(resolvingId, { resolution, note: resolutionNote });
    setResolvingId(null);
    setResolutionNote("");
    setTick((t) => t + 1);
    showToast(resolution === "devolver" ? "Devolución registrada — stock repuesto y reembolso iniciado" : "Incidencia resuelta", "success");
  };

  const columns = [
    {
      field: "shipment", headerName: "Envío / Pedido",
      renderCell: (row) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <RouterLink to={`/logistica/${row.shipmentId}`} className="mono">{row.shipmentId}</RouterLink>
          <RouterLink to={`/pedidos/${row.orderId}`} className="mono text-tertiary" style={{ fontSize: "var(--text-xs)" }}>Pedido #{row.orderId}</RouterLink>
        </Box>
      ),
    },
    { field: "customerName", headerName: "Cliente" },
    { field: "type", headerName: "Tipo", renderCell: (row) => INCIDENT_TYPES[row.type] || row.type },
    {
      field: "age", headerName: "Antigüedad", align: "right",
      renderCell: (row) => {
        if (row.ageHours == null) return <span className="text-tertiary">—</span>;
        const hrs = Math.round(row.ageHours);
        return <span className={hrs >= 48 ? "log-incident-age--stale" : ""}>{hrs} hs</span>;
      },
    },
    { field: "openedAt", headerName: "Abierta", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.openedAt)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (row) => <StatusBadge {...INCIDENT_STATUS[row.status]} /> },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (row) => row.status !== "resuelta" && (
        <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(row); }} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const toolbar = (
    <Box className="table-tabs">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
        {STATUS_TABS.map((t) => <Tab key={t.key} label={t.label} />)}
      </Tabs>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Incidencias"
        subtitle="Vista transversal de problemas de entrega, para Soporte/CX."
      />

      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="No hay incidencias en esta vista." />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {activeRow?.status === "abierta" && <MenuItem onClick={handleInGestion}>Marcar en gestión</MenuItem>}
        <MenuItem onClick={() => { setResolvingId(activeRow.id); setAnchor(null); }}>Resolver</MenuItem>
      </Menu>

      <Modal
        open={Boolean(resolvingIncident)}
        onClose={() => setResolvingId(null)}
        title="Resolver incidencia"
        subtitle={resolvingIncident ? `${INCIDENT_TYPES[resolvingIncident.type]} · ${resolvingIncident.shipmentId}` : ""}
        actions={
          <>
            <Button variant="ghost" onClick={() => setResolvingId(null)}>Cancelar</Button>
            <Button variant="secondary" onClick={() => handleResolve("reintentar")}>Reintentar</Button>
            <Button variant="secondary" onClick={() => handleResolve("contactar_cliente")}>Contactar cliente</Button>
            <Button variant="danger" onClick={() => handleResolve("devolver")}>Devolver</Button>
          </>
        }
      >
        {resolvingIncident && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {resolvingIncident.description && <Typography variant="body2" color="text.secondary">{resolvingIncident.description}</Typography>}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, p: 2, borderRadius: "var(--radius-md)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning-text)" }}>
              <WarningAmberOutlinedIcon />
              <Typography variant="body2">{RESOLUTIONS.devolver.hint}</Typography>
            </Box>
            <TextField
              label="Nota (opcional)" size="small" fullWidth multiline minRows={2}
              value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)}
            />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Incidencias;
