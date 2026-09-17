import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import RefundApprovalModal from "./components/RefundApprovalModal";
import { listRefunds, getRefundsSummary } from "./api/financeApi";
import { REFUND_STATUS } from "./lib/finance";
import { money, formatDate } from "./lib/time";

const TABS = [
  { key: "solicitado", label: "Pendientes" },
  { key: "ejecutado", label: "Ejecutados" },
  { key: "rechazado", label: "Rechazados" },
  { key: "", label: "Todos" },
];

const Reembolsos = () => {
  const [tab, setTab] = useState(0);
  const [active, setActive] = useState(null);
  const [, setTick] = useState(0);

  const summary = getRefundsSummary();
  const rows = listRefunds({ status: TABS[tab].key || undefined }).map((r) => ({ ...r, id: r.id }));

  const kpis = [
    { title: "Pendientes de aprobación", value: String(summary.pendingCount), hint: money(summary.pendingAmount), icon: <PendingActionsOutlinedIcon /> },
    { title: "Reembolsado", value: money(summary.executedAmount), hint: `${summary.executedCount} reembolso(s)`, icon: <UndoOutlinedIcon /> },
    { title: "Rechazados", value: String(summary.rejectedCount), icon: <BlockOutlinedIcon /> },
  ];

  const columns = [
    { field: "orderId", headerName: "Pedido", renderCell: (r) => (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <RouterLink to={`/pedidos/${r.orderId}`} className="mono" onClick={(e) => e.stopPropagation()}>Pedido #{r.orderId}</RouterLink>
        <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{r.customerName}</span>
      </Box>
    ) },
    { field: "amount", headerName: "Monto", align: "right", renderCell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{money(r.amount)}</span> },
    { field: "creditNoteLabel", headerName: "Nota de crédito", renderCell: (r) => r.creditNoteId
      ? <RouterLink to={`/facturacion/${r.creditNoteId}`} className="mono" onClick={(e) => e.stopPropagation()}>{r.creditNoteLabel}</RouterLink>
      : <span className="text-tertiary">—</span> },
    { field: "requestedBy", headerName: "Solicitado por", renderCell: (r) => <span className="text-tertiary">{r.requestedBy}</span> },
    { field: "requestedAt", headerName: "Fecha", renderCell: (r) => <span className="text-tertiary nowrap">{formatDate(r.requestedAt)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...REFUND_STATUS[r.status]} /> },
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
        title="Reembolsos"
        subtitle="Logística y CX solicitan la devolución del dinero; Finanzas la aprueba y ejecuta."
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 4 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={rows}
        onRowClick={(r) => r.status === "solicitado" && setActive(r)}
        emptyMessage="No hay reembolsos en esta vista."
      />

      {active && (
        <RefundApprovalModal
          key={active.id}
          refund={active}
          onClose={() => setActive(null)}
          onResolved={() => { setActive(null); setTick((t) => t + 1); }}
        />
      )}
    </Box>
  );
};

export default Reembolsos;
