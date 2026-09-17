import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PercentOutlinedIcon from "@mui/icons-material/PercentOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { listDocuments, getBillingSummary } from "./api/billingApi";
import { DOC_TYPES, DOC_STATUS, TAX_CONDITIONS } from "./lib/fiscal";
import { formatDate, money, monthLabel } from "./lib/time";
import EmitirNotaModal from "./components/EmitirNotaModal";
import "./Comprobantes.css";

const TABS = [
  { key: "", label: "Todos" },
  { key: "factura", label: "Facturas" },
  { key: "nota_credito", label: "Notas de crédito" },
  { key: "nota_debito", label: "Notas de débito" },
  { key: "__anulados__", label: "Anulados" },
];

const Comprobantes = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [emitOpen, setEmitOpen] = useState(false);
  const [, setTick] = useState(0);

  const summary = getBillingSummary();
  const activeKey = TABS[tab].key;
  const rows = (
    activeKey === "__anulados__"
      ? listDocuments({ status: "anulado" })
      : listDocuments({ docType: activeKey || undefined })
  ).map((d) => ({ ...d, id: d.id }));

  const kpis = [
    { title: `Facturado neto · ${summary.month ? monthLabel(summary.month) : "—"}`, value: money(summary.facturadoNeto), icon: <DescriptionOutlinedIcon /> },
    { title: "IVA débito del mes", value: money(summary.ivaDebito), icon: <PercentOutlinedIcon /> },
    { title: "Notas de crédito del mes", value: String(summary.notasCreditoCount), hint: summary.notasCreditoMonto ? money(summary.notasCreditoMonto) : "Sin NC", icon: <UndoOutlinedIcon /> },
    { title: "Comprobantes emitidos", value: String(summary.comprobantesEmitidos), icon: <ReceiptLongOutlinedIcon /> },
  ];

  const columns = [
    {
      field: "fullNumber",
      headerName: "Comprobante",
      renderCell: (row) => (
        <Box className="cbte-cell">
          <span className="cbte-cell__label mono">
            {DOC_TYPES[row.docType]?.short} {row.letter} {row.fullNumber}
          </span>
          {row.orderId && (
            <RouterLink to={`/pedidos/${row.orderId}`} className="cbte-cell__order mono" onClick={(e) => e.stopPropagation()}>
              Pedido #{row.orderId}
            </RouterLink>
          )}
        </Box>
      ),
    },
    {
      field: "customerName",
      headerName: "Cliente",
      renderCell: (row) => (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <span>{row.customerName}</span>
          <StatusBadge {...(TAX_CONDITIONS[row.customerTaxCondition] || { label: row.customerTaxCondition, tone: "neutral" })} showDot={false} />
        </Box>
      ),
    },
    { field: "issueDate", headerName: "Fecha", renderCell: (row) => <span className="text-tertiary nowrap">{formatDate(row.issueDate)}</span> },
    { field: "totalNet", headerName: "Neto", align: "right", renderCell: (row) => <span className="mono">{money(row.totalNet)}</span> },
    { field: "totalVat", headerName: "IVA", align: "right", renderCell: (row) => <span className="mono">{money(row.totalVat)}</span> },
    { field: "total", headerName: "Total", align: "right", renderCell: (row) => <span className="mono" style={{ fontWeight: 600 }}>{money(row.total)}</span> },
    {
      field: "cae",
      headerName: "CAE",
      align: "center",
      renderCell: (row) => (row.cae ? <CheckCircleOutlineIcon sx={{ fontSize: 17, color: "var(--success-text)" }} titleAccess={row.cae} /> : <span className="text-tertiary">—</span>),
    },
    { field: "status", headerName: "Estado", align: "center", renderCell: (row) => <StatusBadge {...DOC_STATUS[row.status]} /> },
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
        title="Comprobantes"
        subtitle="Las facturas se emiten solas al pagarse el pedido. Acá se consultan y se emiten notas de crédito o débito."
        actions={<Button variant="secondary" startIcon={<AddIcon />} onClick={() => setEmitOpen(true)}>Emitir NC / ND</Button>}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/facturacion/${row.id}`)}
        emptyMessage="No hay comprobantes en esta vista."
      />

      <EmitirNotaModal
        open={emitOpen}
        onClose={() => setEmitOpen(false)}
        onEmitted={(doc) => { setEmitOpen(false); setTick((t) => t + 1); navigate(`/facturacion/${doc.id}`); }}
      />
    </Box>
  );
};

export default Comprobantes;
