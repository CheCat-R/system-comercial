import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import AddShoppingCartOutlinedIcon from "@mui/icons-material/AddShoppingCartOutlined";
import RemoveShoppingCartOutlinedIcon from "@mui/icons-material/RemoveShoppingCartOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import PercentOutlinedIcon from "@mui/icons-material/PercentOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { listAbandonedCarts, getAbandonedCartsSummary, sendCartRecovery, generateSampleCart } from "./api/marketingApi";
import { CART_STATUS } from "./lib/loyalty";
import { money, percent, relativeFromToday } from "./lib/time";

const TABS = [
  { key: "", label: "Todos" },
  { key: "abierto", label: "Abiertos" },
  { key: "recuperado", label: "Recuperados" },
  { key: "perdido", label: "Perdidos" },
];

const Carritos = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const summary = getAbandonedCartsSummary();
  const rows = listAbandonedCarts({ status: TABS[tab].key || undefined }).map((c) => ({ ...c, id: c.id }));

  const kpis = [
    { title: "Carritos abiertos", value: String(summary.openCount), icon: <RemoveShoppingCartOutlinedIcon /> },
    { title: "Valor en carritos abiertos", value: money(summary.openValue), icon: <PaidOutlinedIcon /> },
    { title: "Tasa de recuperación", value: percent(summary.recoveryRate), icon: <PercentOutlinedIcon /> },
    { title: "Ingreso recuperado", value: money(summary.recoveredRevenue), icon: <ReplayOutlinedIcon /> },
  ];

  const handleRecovery = (cart) => {
    try {
      const { couponCode } = sendCartRecovery(cart.id);
      refresh();
      showToast(`Recuperación enviada a ${cart.customerName} · cupón ${couponCode}`, "success");
    } catch (e) {
      showToast(e.message, "warning");
    }
  };

  const columns = [
    {
      field: "customerName", headerName: "Cliente",
      renderCell: (r) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <RouterLink to={`/clientes/${r.accountId}`} style={{ fontWeight: 600 }}>{r.customerName}</RouterLink>
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>
            {r.items.map((it) => `${it.qty}× ${it.name}`).join(" · ")}
          </span>
        </Box>
      ),
    },
    {
      field: "subtotal", headerName: "Ítems", align: "right",
      renderCell: (r) => (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span className="mono" style={{ fontWeight: 600 }}>{money(r.subtotal)}</span>
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{r.itemCount} u.</span>
        </Box>
      ),
    },
    { field: "lastActivityAt", headerName: "Abandonado", renderCell: (r) => <span className="text-tertiary nowrap">{relativeFromToday(r.lastActivityAt)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...(CART_STATUS[r.status] || { label: r.status, tone: "neutral" })} /> },
    {
      field: "campaignName", headerName: "Recuperación",
      renderCell: (r) => r.campaignName
        ? <span className="text-tertiary">{r.campaignName}{r.couponCode ? <> · <span className="mono">{r.couponCode}</span></> : null}</span>
        : <span className="text-tertiary">—</span>,
    },
    {
      field: "recoveredOrderId", headerName: "Pedido", align: "center",
      renderCell: (r) => r.recoveredOrderId
        ? <RouterLink to={`/pedidos/${r.recoveredOrderId}`} className="mono">#{r.recoveredOrderId}</RouterLink>
        : <span className="text-tertiary">—</span>,
    },
    {
      field: "actions", headerName: "", align: "right", width: 170,
      renderCell: (r) => (r.status === "abierto" && !r.recoveryCampaignId
        ? <Button variant="secondary" size="small" onClick={() => handleRecovery(r)}>Enviar recuperación</Button>
        : r.status === "abierto" && r.recoveryCampaignId
          ? <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>enviada</span>
          : null),
    },
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
        title="Carritos abandonados"
        subtitle="Carritos que no llegaron a pedido y su flujo de recuperación."
        actions={
          <Button
            variant="secondary" startIcon={<AddShoppingCartOutlinedIcon />}
            onClick={() => { const c = generateSampleCart(); refresh(); showToast(`Carrito de ejemplo · ${c.customerName}`, "info"); }}
          >
            Generar carrito de ejemplo
          </Button>
        }
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="No hay carritos en esta vista." />
    </Box>
  );
};

export default Carritos;
