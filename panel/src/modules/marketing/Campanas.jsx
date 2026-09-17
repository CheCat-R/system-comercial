import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import AddIcon from "@mui/icons-material/Add";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import CampaignWizard from "./components/CampaignWizard";
import { listCampaigns, getMarketingSummary } from "./api/marketingApi";
import { CAMPAIGN_STATUS, OBJECTIVES, CHANNELS } from "./lib/marketing";
import { money, percent, formatDate } from "./lib/time";

const TABS = [
  { key: "", label: "Todas" },
  { key: "en_curso", label: "En curso" },
  { key: "programada", label: "Programadas" },
  { key: "finalizada", label: "Finalizadas" },
  { key: "__triggered__", label: "Automáticas" },
];

const Campanas = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [wizard, setWizard] = useState(false);
  const [, setTick] = useState(0);

  const summary = getMarketingSummary();
  const key = TABS[tab].key;
  const rows = (key === "__triggered__"
    ? listCampaigns({ triggered: true })
    : listCampaigns({ status: key || undefined })
  ).map((c) => ({ ...c, id: c.id }));

  const kpis = [
    { title: "Campañas en curso", value: String(summary.activeCampaigns), icon: <CampaignOutlinedIcon /> },
    { title: "Tasa de apertura promedio", value: percent(summary.avgOpenRate), icon: <MarkEmailReadOutlinedIcon /> },
    { title: "Ingreso atribuido", value: money(summary.attributedRevenue), hint: `${summary.conversions} conversiones`, icon: <PaymentsOutlinedIcon /> },
    { title: "Programadas", value: String(summary.scheduledCampaigns), icon: <BoltOutlinedIcon /> },
  ];

  const columns = [
    {
      field: "name", headerName: "Campaña",
      renderCell: (r) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600 }}>{r.name}</span>
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>
            {OBJECTIVES[r.objective]} · {CHANNELS[r.channel]?.label}
            {r.schedule?.type === "triggered" ? " · automática" : ""}
          </span>
        </Box>
      ),
    },
    { field: "audience", headerName: "Audiencia", renderCell: (r) => <span className="text-tertiary">{r.audience?.name || "—"}{r.audienceSnapshot?.length ? ` · ${r.audienceSnapshot.length}` : ""}</span> },
    { field: "sent", headerName: "Enviados", align: "right", renderCell: (r) => <span className="mono">{r.metrics.sent}</span> },
    { field: "open", headerName: "% abre", align: "right", renderCell: (r) => <span className="mono text-tertiary">{r.metrics.sent ? percent(r.metrics.openRate) : "—"}</span> },
    { field: "conv", headerName: "Conv.", align: "right", renderCell: (r) => <span className="mono">{r.metrics.conversions}</span> },
    { field: "revenue", headerName: "Ingreso atrib.", align: "right", renderCell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{money(r.metrics.revenue)}</span> },
    { field: "when", headerName: "Fecha", renderCell: (r) => <span className="text-tertiary nowrap">{formatDate(r.launchedAt || r.schedule?.sendAt || r.createdAt)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...CAMPAIGN_STATUS[r.status]} /> },
  ];

  const toolbar = (
    <Box className="table-tabs">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
        {TABS.map((t) => <Tab key={t.key} label={t.label} />)}
      </Tabs>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Campañas"
        subtitle="A quién le hablamos, con qué oferta, por qué canal — y si funcionó."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setWizard(true)}>Nueva campaña</Button>}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <DataTable toolbar={toolbar} columns={columns} data={rows} onRowClick={(r) => navigate(`/marketing/campanas/${r.id}`)} emptyMessage="No hay campañas en esta vista." />

      {wizard && <CampaignWizard onClose={() => setWizard(false)} onDone={(c) => { setWizard(false); setTick((t) => t + 1); navigate(`/marketing/campanas/${c.id}`); }} />}
    </Box>
  );
};

export default Campanas;
