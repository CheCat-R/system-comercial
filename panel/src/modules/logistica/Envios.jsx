import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { listShipments, getPortfolioSummary } from "./api/logisticaApi";
import { SHIPMENT_STATUS } from "./lib/logistics";
import { formatDateTime, money } from "./lib/time";
import "./Envios.css";

const STATUS_TABS = [
  { key: "", label: "Todos" },
  { key: "pendiente_preparacion", label: "Por preparar" },
  { key: "en_picking", label: "En picking" },
  { key: "en_packing", label: "En packing" },
  { key: "listo_despacho", label: "Listos" },
  { key: "en_transito", label: "En tránsito" },
  { key: "en_reparto", label: "En reparto" },
  { key: "entregado", label: "Entregados" },
  { key: "__incidencia__", label: "Con incidencia" },
];

const Envios = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const summary = getPortfolioSummary();
  const activeKey = STATUS_TABS[tab].key;
  const rows = (activeKey === "__incidencia__"
    ? listShipments().filter((s) => s.hasOpenIncident)
    : listShipments({ status: activeKey || undefined })
  ).map((s) => ({ ...s, id: s.id }));

  const kpis = [
    { title: "Por preparar", value: String(summary.porPreparar), icon: <ScheduleOutlinedIcon /> },
    { title: "En proceso (picking/packing)", value: String(summary.enProceso), icon: <Inventory2OutlinedIcon /> },
    { title: "En tránsito / reparto", value: String(summary.enTransito), icon: <LocalShippingOutlinedIcon /> },
    { title: "Tiempo prom. de preparación", value: summary.avgPrepHours ? `${summary.avgPrepHours.toFixed(1)} hs` : "—", icon: <ErrorOutlineOutlinedIcon /> },
    {
      title: "Envíos con incidencia",
      value: summary.dispatchedCount ? `${summary.incidentRate.toFixed(0)}%` : "—",
      hint: summary.dispatchedCount ? `${summary.incidentCount} de ${summary.dispatchedCount} despachados` : "Sin envíos despachados todavía",
      icon: <ReportProblemOutlinedIcon />,
    },
  ];

  const columns = [
    {
      field: "id",
      headerName: "Envío",
      renderCell: (row) => (
        <Box className="log-shipment-cell">
          <span className="mono">{row.id}</span>
          <RouterLink to={`/pedidos/${row.orderId}`} className="log-shipment-cell__order mono" onClick={(e) => e.stopPropagation()}>
            Pedido #{row.orderId}
          </RouterLink>
        </Box>
      ),
    },
    { field: "customerName", headerName: "Cliente" },
    { field: "warehouseName", headerName: "Origen" },
    {
      field: "carrier",
      headerName: "Transportista",
      renderCell: (row) => (
        <Box className="log-carrier-cell">
          <span>{row.carrierName || "—"}</span>
          {row.methodName && <span className="log-carrier-cell__method">{row.methodName}</span>}
        </Box>
      ),
    },
    { field: "zoneName", headerName: "Zona", renderCell: (row) => row.zoneName || "—" },
    { field: "weightKg", headerName: "Peso", align: "right", renderCell: (row) => (row.weightKg ? `${row.weightKg} kg` : "—") },
    { field: "cost", headerName: "Costo", align: "right", renderCell: (row) => money(row.cost) },
    { field: "createdAt", headerName: "Creado", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.createdAt)}</span> },
    {
      field: "status",
      headerName: "Estado",
      align: "center",
      renderCell: (row) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, justifyContent: "center" }}>
          {row.hasOpenIncident && <WarningAmberOutlinedIcon sx={{ fontSize: 16, color: "var(--danger-text)" }} titleAccess="Incidencia abierta" />}
          <StatusBadge {...SHIPMENT_STATUS[row.status]} />
        </Box>
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
      <PageHeader title="Envíos" subtitle="Preparación, despacho y seguimiento de cada pedido pagado." />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 4 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      {summary.costByZone.length > 0 && (
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Costo de envío promedio por zona</Typography>
          <Box className="log-zone-cost-grid">
            {summary.costByZone.map((z) => (
              <Box key={z.zoneId} className="log-zone-cost-tile">
                <span className="log-zone-cost-tile__zone">{z.zoneName}</span>
                <span className="log-zone-cost-tile__cost">{money(z.avgCost)}</span>
                <span className="log-zone-cost-tile__count">{z.count} envío{z.count === 1 ? "" : "s"} despachado{z.count === 1 ? "" : "s"}</span>
              </Box>
            ))}
          </Box>
        </Card>
      )}

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/logistica/${row.id}`)}
        emptyMessage="No hay envíos en esta vista — se crean solos apenas un pedido se marca como pagado."
      />
    </Box>
  );
};

export default Envios;
