import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";

import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { SegmentBadge } from "./components/SegmentBadge";
import { SEGMENTS } from "./lib/segments";
import { RFM_LABELS } from "./lib/rfm";
import {
  getRfmConfig, setRfmConfig, resetRfmConfig, getSegmentDistribution,
  getManualSegments, createManualSegment, updateManualSegment, deleteManualSegment,
  sendToCampaign, getCustomerAnalytics,
} from "./api/clientsApi";
import { money } from "./lib/time";
import "./Segmentos.css";

const TONES = ["accent", "info", "success", "warning", "danger", "neutral"];
const DIM_HELP = {
  recency: "Días desde la última compra. Menos días = mejor score.",
  frequency: "Pedidos en los últimos 12 meses. Más pedidos = mejor score.",
  monetary: "Valor total gastado (LTV) en $. Más gasto = mejor score.",
};

const Segmentos = () => {
  const { showToast } = useToast();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const [cfg, setCfg] = useState(getRfmConfig);
  const segments = getManualSegments();

  const [modal, setModal] = useState(null); // { id?, name, description, color }
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);

  const setBand = (dim, i) => (e) => {
    const next = { ...cfg, [dim]: cfg[dim].map((v, idx) => (idx === i ? e.target.value : v)) };
    setCfg(next);
  };

  const applyConfig = () => {
    const before = new Map(getSegmentDistribution());
    setRfmConfig(cfg);
    const after = getSegmentDistribution();
    let moved = 0;
    new Set([...before.keys(), ...after.keys()]).forEach((k) => {
      moved += Math.abs((after.get(k) || 0) - (before.get(k) || 0));
    });
    refresh();
    showToast(
      moved ? `Umbrales guardados · ${Math.round(moved / 2)} cuenta(s) cambiaron de segmento` : "Umbrales guardados",
      "success"
    );
  };

  const restore = () => {
    setCfg(resetRfmConfig());
    refresh();
    showToast("Umbrales restaurados a los valores por defecto", "info");
  };

  const saveSegment = () => {
    if (!modal.name?.trim()) {
      showToast("Poné un nombre al segmento", "warning");
      return;
    }
    if (modal.id) updateManualSegment(modal.id, { name: modal.name, description: modal.description, color: modal.color });
    else createManualSegment(modal);
    setModal(null);
    refresh();
    showToast(modal.id ? "Segmento actualizado" : "Segmento creado", "success");
  };

  const columns = [
    {
      field: "name",
      headerName: "Segmento",
      width: "30%",
      renderCell: (s) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <span className={`seg-swatch seg-swatch--${s.color}`} />
          <strong>{s.name}</strong>
        </Box>
      ),
    },
    { field: "description", headerName: "Descripción", renderCell: (s) => <span className="text-tertiary">{s.description || "—"}</span> },
    { field: "count", headerName: "Cuentas", align: "right", renderCell: (s) => s.count },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (s) => (
        <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(s); }} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Box className="page fade-in" key={tick}>
      <PageHeader
        title="Segmentos"
        subtitle="Umbrales del scoring RFM y listas manuales de cuentas."
      />

      {/* Distribución + resumen para Analytics */}
      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Distribución de la cartera</Typography>
        <Box className="seg-dist">
          {Object.values(SEGMENTS).map((s) => (
            <div key={s.key} className="seg-dist__item">
              <SegmentBadge segmentKey={s.key} size="sm" />
              <strong>{getSegmentDistribution().get(s.key) || 0}</strong>
            </div>
          ))}
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Valor por segmento</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Este agregado es el que consume el módulo Analytics (<span className="mono">getCustomerAnalytics()</span>).
        </Typography>
        <div className="tbl-scroll-lite">
          <table className="seg-analytics">
            <thead>
              <tr><th>Segmento</th><th>Cuentas</th><th>LTV total</th><th>LTV prom.</th><th>Ticket prom.</th></tr>
            </thead>
            <tbody>
              {Object.entries(getCustomerAnalytics().bySegment)
                .sort((a, b) => b[1].ltv - a[1].ltv)
                .map(([key, v]) => (
                  <tr key={key}>
                    <td><SegmentBadge segmentKey={key} size="sm" /></td>
                    <td>{v.count}</td>
                    <td>{money(v.ltv)}</td>
                    <td>{money(v.ltvAvg)}</td>
                    <td>{money(v.aovAvg)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Umbrales RFM */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Umbrales RFM</Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="ghost" size="small" startIcon={<RestartAltIcon />} onClick={restore}>Restaurar</Button>
            <Permitido permiso="clientes.rfm">
              <Button variant="primary" size="small" onClick={applyConfig}>Guardar</Button>
            </Permitido>
          </Box>
        </Box>

        {["recency", "frequency", "monetary"].map((dim) => (
          <Box key={dim} className="seg-band">
            <Box className="seg-band__label">
              <strong>{RFM_LABELS[dim === "recency" ? "r" : dim === "frequency" ? "f" : "m"].name}</strong>
              <span>{DIM_HELP[dim]}</span>
            </Box>
            <Box className="seg-band__inputs">
              {cfg[dim].map((v, i) => (
                <TextField
                  key={i}
                  size="small"
                  type="number"
                  label={`Score ${5 - i}`}
                  value={v}
                  onChange={setBand(dim, i)}
                />
              ))}
            </Box>
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary" className="seg-band__note">
          Recencia: días máximos para cada score (menor es mejor). Frecuencia y Monto: mínimo para cada score (mayor es mejor).
        </Typography>
      </Card>

      {/* Segmentos manuales */}
      <Card className="entity-card" sx={{ p: 0 }}>
        <Box className="card-title-row" sx={{ p: 3, pb: 2, mb: 0 }}>
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Segmentos manuales</Typography>
          <Button variant="primary" size="small" startIcon={<AddIcon />}
            onClick={() => setModal({ name: "", description: "", color: "accent" })}>
            Nuevo segmento
          </Button>
        </Box>
        <DataTable columns={columns} data={segments} emptyMessage="Sin segmentos manuales." />
      </Card>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ ...activeRow }); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem
          disabled={!activeRow?.accountIds?.length}
          onClick={() => {
            const res = sendToCampaign({ audienceName: activeRow.name, accountIds: activeRow.accountIds });
            setAnchor(null);
            showToast(`Audiencia «${res.audienceName}» (${res.count} cuentas) enviada a Marketing`, "success");
          }}
        >
          Enviar a campaña
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            deleteManualSegment(activeRow.id);
            setAnchor(null);
            refresh();
            showToast(`Segmento «${activeRow.name}» eliminado`, "info");
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? "Editar segmento" : "Nuevo segmento manual"}
        actions={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button variant="primary" onClick={saveSegment}>Guardar</Button>
          </>
        }
      >
        {modal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={modal.name}
              onChange={(e) => setModal({ ...modal, name: e.target.value })} />
            <TextField label="Descripción" size="small" fullWidth multiline minRows={2} value={modal.description}
              onChange={(e) => setModal({ ...modal, description: e.target.value })} />
            <TextField select label="Color" size="small" fullWidth value={modal.color}
              onChange={(e) => setModal({ ...modal, color: e.target.value })}>
              {TONES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Segmentos;
