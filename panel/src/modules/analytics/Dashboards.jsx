/**
 * Dashboards personalizados — la lista (§9.5).
 *
 * Un dashboard es una grilla de widgets, y cada widget es una consulta con
 * forma. Los de fábrica no se borran: se duplican y se edita la copia, igual
 * que los reportes.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import {
  listDashboards, createDashboard, duplicateDashboard, deleteDashboard, setDefaultDashboard,
} from "./api/analyticsApi";
import "./Analytics.css";

const Dashboards = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [anchor, setAnchor] = useState(null);
  const [active, setActive] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dashboards = useMemo(() => listDashboards(), [version]);

  const handleCreate = () => {
    const created = createDashboard(form);
    setNewOpen(false);
    setForm({ name: "", description: "" });
    showToast("Dashboard creado. Agregale widgets.", "success");
    navigate(`/analytics/dashboards/${created.id}`);
  };

  const handleDelete = () => {
    const result = deleteDashboard(active.id);
    setAnchor(null);
    if (!result.ok) { showToast(result.error, "error"); return; }
    refresh();
    showToast("Dashboard eliminado", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Dashboards"
        subtitle="Grillas de widgets. Un widget es una consulta guardada con una forma: siempre coincide con el Explorador."
        actions={
          <Button variant="primary" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
            Nuevo dashboard
          </Button>
        }
      />

      <Box className="an-dashgrid">
        {dashboards.map((d) => (
          <Card
            key={d.id}
            className="entity-card an-dashcard"
            role="button" tabIndex={0}
            onClick={() => navigate(`/analytics/dashboards/${d.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/analytics/dashboards/${d.id}`); }
            }}
          >
            <Box className="card-title-row">
              <Box className="an-dashcard__title">
                <DashboardOutlinedIcon sx={{ fontSize: 18 }} />
                <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>{d.name}</Typography>
              </Box>
              <IconButton
                size="small" aria-label="acciones"
                onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); setActive(d); }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>

            <Typography variant="body2" className="text-secondary">{d.description}</Typography>

            <Box className="an-dashcard__foot">
              {d.isDefault && <StatusBadge tone="success" label="Por defecto" showDot={false} />}
              {d.system && <StatusBadge tone="neutral" label="De fábrica" showDot={false} />}
              <span className="an-chip">{d.widgetCount} widget(s)</span>
              {[...new Set(d.widgets.map((w) => w.typeLabel))].map((t) => (
                <span className="an-chip" key={t}>{t}</span>
              ))}
            </Box>
          </Card>
        ))}
      </Box>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { navigate(`/analytics/dashboards/${active.id}`); setAnchor(null); }}>Abrir</MenuItem>
        <MenuItem
          disabled={active?.isDefault}
          onClick={() => { setDefaultDashboard(active.id); setAnchor(null); refresh(); showToast("Es el dashboard por defecto", "success"); }}
        >
          Marcar como predeterminado
        </MenuItem>
        <MenuItem onClick={() => { duplicateDashboard(active.id); setAnchor(null); refresh(); showToast("Dashboard duplicado", "success"); }}>
          Duplicar
        </MenuItem>
        <MenuItem disabled={active?.system} onClick={handleDelete}>Eliminar</MenuItem>
      </Menu>

      {newOpen && (
        <Modal
          open onClose={() => setNewOpen(false)} maxWidth="xs"
          title="Nuevo dashboard"
          subtitle="Arranca vacío: los widgets se agregan desde adentro, con una consulta o un reporte guardado."
          actions={
            <>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
              <Button variant="primary" disabled={!form.name.trim()} onClick={handleCreate}>Crear</Button>
            </>
          }
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              size="small" fullWidth label="Nombre" value={form.name} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              size="small" fullWidth multiline rows={2} label="Para qué sirve"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Box>
        </Modal>
      )}
    </Box>
  );
};

export default Dashboards;
