/**
 * ESTADOS DE CUENTA — una fila por proveedor con movimiento: mercadería +
 * gastos + ajustes − pagos, los compromisos pendientes y el saldo proyectado.
 * El detalle de cada uno es el mayor DEBE/HABER.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { comprasApi, money, fecha, norm } from "./api/comprasApi";
import "./Compras.css";

const ESTADOS = { vencido: { label: "Vencido", tone: "danger" }, pendiente: { label: "Pendiente", tone: "warning" }, al_dia: { label: "Al día", tone: "success" }, a_favor: { label: "A favor", tone: "info" } };
const TABS = [{ key: "", label: "Todos" }, { key: "vencido", label: "Vencidos" }, { key: "pendiente", label: "Con saldo" }, { key: "a_favor", label: "A favor" }];

const EstadosDeCuenta = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const edoc = useQuery({ queryKey: ["edoc", "global"], queryFn: comprasApi.edoc.global });
  const filas = useMemo(() => edoc.data || [], [edoc.data]);
  const rows = useMemo(() => filas.filter((f) => (!TABS[tab].key || f.estado === TABS[tab].key) && (!q || norm(f.nombre).includes(norm(q)))), [filas, tab, q]);
  const total = filas.reduce((a, f) => a + f.saldo, 0);
  const vencidos = filas.filter((f) => f.estado === "vencido").reduce((a, f) => a + f.saldo, 0);
  const proyectado = filas.reduce((a, f) => a + f.saldoProyectado, 0);

  return (
    <Box className="page fade-in">
      <PageHeader title="Estados de cuenta" subtitle="Cuánto se le debe a cada proveedor y desde cuándo. El saldo proyectado descuenta lo ya comprometido." />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Deuda total" value={money(total)} hint={`${filas.length} proveedor(es) con movimiento`} icon={<AccountBalanceWalletOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Vencida" value={money(vencidos)} hint="pasó el plazo de pago del proveedor" icon={<EventBusyOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Saldo proyectado" value={money(proyectado)} hint="deuda − compromisos pendientes" icon={<TrendingDownOutlinedIcon />} /></Grid>
      </Grid>
      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>{TABS.map((t) => <Tab key={t.key} label={t.label} />)}</Tabs>
        <TextField size="small" placeholder="Buscar proveedor…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 260 }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Box>
      <DataTable columns={[
        { field: "nombre", headerName: "Proveedor", renderCell: (f) => <Box><strong>{f.nombre}</strong><Typography variant="caption" display="block" color="text.secondary">{f.diasPago ? `${f.diasPago} días` : "sin plazo"} · {f.modoCuenta === "libre" ? "cuenta libre" : "por facturas"}{f.conciliadoHasta ? ` · conciliado ${fecha(f.conciliadoHasta)}` : ""}</Typography></Box> },
        { field: "mercaderia", headerName: "Mercadería", align: "right", renderCell: (f) => money(f.mercaderia) },
        { field: "gastos", headerName: "Gastos", align: "right", renderCell: (f) => (f.gastos ? money(f.gastos) : <span className="text-tertiary">—</span>) },
        { field: "pagado", headerName: "Pagado", align: "right", renderCell: (f) => <span className="edoc-mov--haber">{money(f.pagado)}</span> },
        { field: "saldo", headerName: "Saldo", align: "right", renderCell: (f) => <strong className={f.saldo > 0.009 ? "compras-num--saldo" : ""}>{money(f.saldo)}</strong> },
        { field: "saldoProyectado", headerName: "Proyectado", align: "right", renderCell: (f) => <span className="text-tertiary">{money(f.saldoProyectado)}</span> },
        { field: "ultimoPago", headerName: "Último pago", renderCell: (f) => <span className="text-tertiary">{fecha(f.ultimoPago)}</span> },
        { field: "estado", headerName: "Estado", renderCell: (f) => <StatusBadge tone={ESTADOS[f.estado]?.tone} label={ESTADOS[f.estado]?.label} /> },
      ]} data={rows} loading={edoc.isLoading} emptyMessage="Ningún proveedor con movimiento." onRowClick={(f) => navigate(`/abastecimiento/cuentas/${f.id}`)} pagination={{ pageSize: 25 }} />
    </Box>
  );
};

export default EstadosDeCuenta;
