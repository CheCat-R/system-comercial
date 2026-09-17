import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import MessageTemplateEditor from "./components/MessageTemplateEditor";
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, listSends, listSubscriptions } from "./api/marketingApi";
import { CHANNELS, TEMPLATE_CATEGORY, SEND_STATUS, SUBSCRIPTION_STATUS } from "./lib/marketing";
import { formatDateTime } from "./lib/time";

const EMPTY_TPL = { name: "", channel: "email", category: "promocional", subject: "", body: "" };

const Comunicacion = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const templates = listTemplates();
  const sends = listSends();
  const subs = listSubscriptions();

  const tplColumns = [
    { field: "name", headerName: "Plantilla", renderCell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { field: "channel", headerName: "Canal", renderCell: (r) => <StatusBadge tone="neutral" label={CHANNELS[r.channel]?.label || r.channel} showDot={false} /> },
    { field: "category", headerName: "Tipo", renderCell: (r) => <span className="text-tertiary">{TEMPLATE_CATEGORY[r.category] || r.category}</span> },
    { field: "subject", headerName: "Asunto", renderCell: (r) => <span className="text-tertiary">{r.subject || "—"}</span> },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (r) => <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(r); }} aria-label="acciones"><MoreVertIcon fontSize="small" /></IconButton>,
    },
  ];

  const sendColumns = [
    { field: "customerName", headerName: "Cliente" },
    { field: "campaignName", headerName: "Campaña", renderCell: (r) => <span className="text-tertiary">{r.campaignName}</span> },
    { field: "channel", headerName: "Canal", renderCell: (r) => CHANNELS[r.channel]?.label || r.channel },
    { field: "sentAt", headerName: "Enviado", renderCell: (r) => <span className="text-tertiary nowrap">{formatDateTime(r.sentAt)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...SEND_STATUS[r.status]} /> },
  ];

  const subColumns = [
    { field: "customerName", headerName: "Cliente" },
    { field: "channel", headerName: "Canal", renderCell: (r) => CHANNELS[r.channel]?.label || r.channel },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...SUBSCRIPTION_STATUS[r.status]} /> },
    { field: "source", headerName: "Motivo", renderCell: (r) => <span className="text-tertiary">{r.source}</span> },
    { field: "unsubscribedAt", headerName: "Fecha", renderCell: (r) => <span className="text-tertiary nowrap">{r.unsubscribedAt ? formatDateTime(r.unsubscribedAt) : "—"}</span> },
  ];

  const handleSaveTpl = () => {
    const d = modal.draft;
    if (!d.name?.trim()) return showToast("Poné un nombre", "warning");
    if (modal.id) updateTemplate(modal.id, d); else createTemplate(d);
    showToast(modal.id ? "Plantilla actualizada" : "Plantilla creada", "success");
    setModal(null); refresh();
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Comunicación"
        subtitle="Plantillas de mensaje, registro de envíos y consentimiento por canal."
        actions={tab === 0 && <Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({ draft: EMPTY_TPL })}>Nueva plantilla</Button>}
      />

      <Box className="surface" sx={{ overflow: "hidden" }}>
        <Box className="table-tabs">
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label={`Plantillas (${templates.length})`} />
            <Tab label={`Envíos (${sends.length})`} />
            <Tab label={`Suscripciones (${subs.length})`} />
          </Tabs>
        </Box>

        {tab === 0 && <DataTable columns={tplColumns} data={templates.map((t) => ({ ...t, id: t.id }))} onRowClick={(r) => setModal({ draft: r, id: r.id })} emptyMessage="Sin plantillas." />}
        {tab === 1 && <DataTable columns={sendColumns} data={sends.map((s) => ({ ...s, id: s.id }))} emptyMessage="Todavía no se envió ninguna campaña." />}
        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, pb: 1.5 }}>
              Marketing <strong>no envía</strong> a un canal en baja. Lo que no figura acá se asume suscripto.
            </Typography>
            <DataTable columns={subColumns} data={subs.map((s, i) => ({ ...s, id: `${s.accountId}-${s.channel}-${i}` }))} emptyMessage="Nadie se dio de baja." />
          </Box>
        )}
      </Box>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ draft: activeRow, id: activeRow.id }); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem onClick={() => { deleteTemplate(activeRow.id); setAnchor(null); refresh(); showToast("Plantilla eliminada", "info"); }}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={modal.id ? "Editar plantilla" : "Nueva plantilla"}
          maxWidth="md"
          actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" onClick={handleSaveTpl}>Guardar</Button></>}
        >
          <Box sx={{ pt: 1 }}>
            <MessageTemplateEditor value={modal.draft} onChange={(draft) => setModal((m) => ({ ...m, draft }))} />
          </Box>
        </Modal>
      )}

      <Box sx={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
        Los envíos y aperturas también aparecen en el timeline de cada cliente en{" "}
        <RouterLink to="/clientes" className="mono">Clientes</RouterLink>.
      </Box>
    </Box>
  );
};

export default Comunicacion;
