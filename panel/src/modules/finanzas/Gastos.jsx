import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import PeriodPicker from "./components/PeriodPicker";
import ExpenseModal from "./components/ExpenseModal";
import { listExpenses, getExpensesSummary, getAvailableMonths, markExpensePaid, deleteExpense } from "./api/financeApi";
import { EXPENSE_CATEGORIES, RECURRENCE, EXPENSE_STATUS } from "./lib/finance";
import { money, formatDate } from "./lib/time";

const TABS = [
  { key: "", label: "Todos" },
  { key: "pendiente", label: "Pendientes" },
  { key: "pagado", label: "Pagados" },
  { key: "__recurrentes__", label: "Recurrentes" },
];

const Gastos = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const puedeBorrarGasto = check("finanzas.borrar_gasto");
  const [params, setParams] = useSearchParams();
  const month = params.get("period") || "";
  const [tab, setTab] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const months = getAvailableMonths();
  const summary = getExpensesSummary({ month: month || undefined });
  const key = TABS[tab].key;
  const rows = (key === "__recurrentes__"
    ? listExpenses({ month: month || undefined }).filter((e) => e.recurrence !== "unico")
    : listExpenses({ status: key || undefined, month: month || undefined })
  ).map((e) => ({ ...e, id: e.id }));

  const kpis = [
    { title: "Total del período", value: money(summary.total), icon: <ReceiptLongOutlinedIcon /> },
    { title: "Pendientes de pago", value: money(summary.pending), hint: `${summary.pendingCount} gasto(s)`, icon: <PendingActionsOutlinedIcon /> },
    { title: "Gastos recurrentes", value: String(summary.recurring), icon: <RepeatOutlinedIcon /> },
    { title: "Centro de costo top", value: summary.topCenter?.name || "—", hint: summary.topCenter ? money(summary.topCenter.amount) : "", icon: <ApartmentOutlinedIcon /> },
  ];

  const columns = [
    { field: "description", headerName: "Concepto", renderCell: (r) => (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <span>{r.description}</span>
        <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{EXPENSE_CATEGORIES[r.category] || r.category}</span>
      </Box>
    ) },
    { field: "costCenterName", headerName: "Centro de costo", renderCell: (r) => <span className="text-tertiary">{r.costCenterName}</span> },
    { field: "amount", headerName: "Monto", align: "right", renderCell: (r) => <span className="mono">{money(r.amount)}</span> },
    { field: "date", headerName: "Fecha", renderCell: (r) => <span className="text-tertiary nowrap">{formatDate(r.date)}</span> },
    { field: "recurrence", headerName: "Recurrencia", align: "center", renderCell: (r) => <StatusBadge {...RECURRENCE[r.recurrence]} showDot={false} /> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...EXPENSE_STATUS[r.status]} /> },
    { field: "actions", headerName: "", align: "right", width: 48, renderCell: (r) => (
      <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(r); }} aria-label="acciones"><MoreVertIcon fontSize="small" /></IconButton>
    ) },
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
        title="Gastos operativos"
        subtitle="El único dato de Finanzas que se carga a mano — el resto del P&L es derivado."
        actions={
          <>
            <PeriodPicker value={month} onChange={(v) => setParams(v ? { period: v } : {})} months={months} />
            <Button variant="primary" startIcon={<AddIcon />} onClick={() => { setEditing(null); setModalOpen(true); }}>Nuevo gasto</Button>
          </>
        }
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>
        ))}
      </Grid>

      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="No hay gastos en esta vista." />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {activeRow?.status === "pendiente" && (
          <MenuItem onClick={() => { markExpensePaid(activeRow.id); setAnchor(null); refresh(); showToast("Gasto marcado como pagado", "success"); }}>
            Marcar pagado
          </MenuItem>
        )}
        <MenuItem onClick={() => { setEditing(activeRow); setAnchor(null); setModalOpen(true); }}>Editar</MenuItem>
        {/* ⭐ Borrar un gasto cambia un P&L que alguien ya miró: es «con motivo»
            en el catálogo. Acá se muestra apagado con el porqué, en vez de dejar
            que el clic termine en un toast rojo. */}
        <Tooltip title={puedeBorrarGasto.allowed ? "Borrar un gasto cambia un P&L que alguien ya miró." : puedeBorrarGasto.reason}>
          <span>
            <MenuItem
              disabled={!puedeBorrarGasto.allowed}
              onClick={() => { deleteExpense(activeRow.id); setAnchor(null); refresh(); showToast("Gasto eliminado", "info"); }}
            >
              Eliminar
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>

      {modalOpen && (
        <ExpenseModal
          expense={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refresh(); }}
        />
      )}
    </Box>
  );
};

export default Gastos;
