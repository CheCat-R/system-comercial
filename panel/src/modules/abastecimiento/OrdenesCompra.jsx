import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import PendingOutlinedIcon from "@mui/icons-material/PendingOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { listPurchaseOrders, getPortfolioSummary } from "./api/supplyApi";
import { PO_STATUS } from "./lib/purchaseOrders";
import { money, formatDate } from "./lib/time";
import "./OrdenesCompra.css";

const STATUS_TABS = [
  { key: "", label: "Todas" },
  { key: "borrador", label: "Borrador" },
  { key: "enviada", label: "Enviada" },
  { key: "parcial", label: "Parcial" },
  { key: "recibida", label: "Recibida" },
  { key: "cerrada", label: "Cerrada" },
];

const OrdenesCompra = () => {
  const navigate = useNavigate();
  const { filtros, setFiltros } = useVistaGuardada("ordenes-compra", { tab: 0, search: "" });
  const { tab: statusTab, search } = filtros;

  const summary = getPortfolioSummary();
  const q = search.toLowerCase();
  const rows = listPurchaseOrders({ status: STATUS_TABS[statusTab].key || undefined })
    .filter((o) => !q || o.id.toLowerCase().includes(q) || o.supplierName.toLowerCase().includes(q));

  const pendingSkus = rows.reduce((s, o) => s + o.lines.filter((l) => l.pending > 0).length, 0);

  const kpis = [
    { title: "OC abiertas", value: String(summary.openOrders), icon: <ReceiptLongOutlinedIcon /> },
    { title: "Monto comprometido", value: money(summary.committedAmount), icon: <AccountBalanceWalletOutlinedIcon /> },
    { title: "Líneas pendientes de recibir", value: String(pendingSkus), icon: <PendingOutlinedIcon /> },
  ];

  const columns = [
    { field: "id", headerName: "OC", renderCell: (row) => <span className="mono">{row.id}</span> },
    { field: "supplierName", headerName: "Proveedor" },
    { field: "warehouseName", headerName: "Depósito destino" },
    { field: "expectedDate", headerName: "Fecha esperada", renderCell: (row) => formatDate(row.expectedDate) },
    { field: "total", headerName: "Monto", align: "right", renderCell: (row) => money(row.total) },
    {
      field: "pct", headerName: "% recibido", align: "right",
      renderCell: (row) => (
        <>
          <span className="oc-pct-bar"><span className="oc-pct-bar__fill" style={{ width: `${row.pct}%` }} /></span>
          {row.pct}%
        </>
      ),
    },
    { field: "status", headerName: "Estado", align: "center", renderCell: (row) => <StatusBadge {...PO_STATUS[row.status]} /> },
  ];

  const toolbar = (
    <>
      <Box className="table-tabs">
        <Tabs value={statusTab} onChange={(_, v) => setFiltros({ tab: v })} variant="scrollable" scrollButtons={false}>
          {STATUS_TABS.map((t) => <Tab key={t.key} label={t.label} />)}
        </Tabs>
      </Box>
      <Box className="table-toolbar">
        <TextField
          size="small"
          placeholder="Buscar por # OC o proveedor…"
          value={search}
          onChange={(e) => setFiltros({ search: e.target.value })}
          className="table-toolbar__search"
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
      </Box>
    </>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Órdenes de Compra"
        subtitle="Ciclo de compra: borrador, envío al proveedor y recepción."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => navigate("/abastecimiento/ordenes-compra/nueva")}>Nueva Orden de Compra</Button>}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 4 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/abastecimiento/ordenes-compra/${row.id}`)}
        emptyMessage="No hay Órdenes de Compra en esta vista."
      />
    </Box>
  );
};

export default OrdenesCompra;
