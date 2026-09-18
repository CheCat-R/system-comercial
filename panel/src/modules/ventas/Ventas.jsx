/**
 * VENTAS — "¿qué se vendió?" con todos sus cortes. Paginado de verdad,
 * totales del filtro entero (sin anuladas) y la pestaña ⚠ Sin facturar con los
 * tickets provisorios que esperan ARCA.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import StatCard from "../../components/Cards/StatCard/StatCard";
import { useAuth } from "../../context/AuthContext";
import { ventasApi, ESTADOS_VENTA, MEDIOS_PAGO, TIPOS_VENTA, etiquetaVenta, hoyISO, money, num, stamp } from "./api/ventasApi";
import "./Ventas.css";

const TABS = [{ key: "", label: "Todas" }, { key: "sinFacturar", label: "Sin facturar" }, { key: "anuladas", label: "Anuladas" }];

const Ventas = () => {
  const navigate = useNavigate();
  const { esJefe } = useAuth();
  const [tab, setTab] = useState(0);
  const [f, setF] = useState({ desde: hoyISO(), hasta: hoyISO(), q: "", medioPago: "", origen: "", sucursalId: "", usuarioId: "" });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const params = useMemo(() => ({
    desde: f.desde || undefined, hasta: f.hasta || undefined, q: f.q || undefined, medioPago: f.medioPago || undefined, origen: f.origen || undefined,
    sucursalId: f.sucursalId || undefined, usuarioId: f.usuarioId || undefined,
    estado: TABS[tab].key === "anuladas" ? "anulada" : undefined, sinFacturar: TABS[tab].key === "sinFacturar" ? "true" : undefined,
    offset: page * rowsPerPage, limit: rowsPerPage,
  }), [f, tab, page, rowsPerPage]);
  const q = useQuery({ queryKey: ["ventas", "listado", params], queryFn: () => ventasApi.listado(params), placeholderData: (prev) => prev });
  const t = q.data?.totales;

  const columns = [
    { field: "fecha", headerName: "Fecha", renderCell: (v) => <span className="nowrap">{stamp(v.fecha)}</span> },
    { field: "numero", headerName: "Comprobante", renderCell: (v) => <Box><strong>{etiquetaVenta(v)}</strong>{v.facturarPendiente && v.estado !== "anulada" && <Typography variant="caption" display="block" color="warning.main">provisorio · sin CAE</Typography>}{v.cae && <Typography variant="caption" display="block" color="text.secondary">CAE {v.cae}</Typography>}</Box> },
    { field: "clienteNombre", headerName: "Cliente" },
    { field: "cajeroNombre", headerName: "Vendedor", renderCell: (v) => <span className="text-tertiary">{v.cajeroNombre}{esJefe ? ` · ${v.sucursalNombre}` : ""}</span> },
    { field: "medios", headerName: "Pago", sortable: false, renderCell: (v) => <span className="text-tertiary">{v.condicionPago === "cuenta_corriente" ? "Cta. cte." : (v.medios || []).map((m) => MEDIOS_PAGO[m.medio] || m.medio).join(" + ") || "—"}</span> },
    { field: "renglones", headerName: "Reng.", align: "right" },
    { field: "total", headerName: "Total", align: "right", renderCell: (v) => <strong className={`ventas-num ${v.tipo.startsWith("nota_credito") ? "ventas-num--neg" : ""}`}>{v.tipo.startsWith("nota_credito") ? "−" : ""}{money(v.total)}</strong> },
    { field: "saldo", headerName: "Saldo", align: "right", renderCell: (v) => (v.saldo > 0.009 ? <span className="ventas-num ventas-num--saldo">{money(v.saldo)}</span> : <span className="text-tertiary">—</span>) },
    { field: "estado", headerName: "Estado", renderCell: (v) => <StatusBadge tone={ESTADOS_VENTA[v.estado]?.tone} label={ESTADOS_VENTA[v.estado]?.label || v.estado} /> },
  ];

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(0); };

  return (
    <Box className="page fade-in">
      <PageHeader title="Ventas" subtitle="Tickets, facturas y notas de crédito emitidos. Los borradores viven en el punto de venta." actions={<Button variant="primary" startIcon={<PointOfSaleIcon />} onClick={() => navigate("/ventas/pos")}>Punto de venta</Button>} />

      {t && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Vendido" value={money(t.plata)} hint={`${t.tickets} ticket(s) · promedio ${money(t.promedio)}`} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Neto / IVA" value={money(t.neto)} hint={`IVA ${money(t.iva)}`} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Descuentos" value={money(t.descuentos)} hint={t.ofertas?.ventas ? `${money(t.ofertas.plata)} en ${t.ofertas.ventas} venta(s) con promo` : "sin promos"} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Devuelto / anulado" value={money(t.plataAcreditada)} hint={`${t.notasCredito} NC · ${t.anuladas} anulada(s) por ${money(t.plataAnulada)}`} /></Grid>
        </Grid>
      )}

      <Box className="ventas-filtros">
        <TextField size="small" type="date" label="Desde" value={f.desde} onChange={set("desde")} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Hasta" value={f.hasta} onChange={set("hasta")} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" placeholder="Nº o cliente" value={f.q} onChange={set("q")} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" label="Medio" value={f.medioPago} onChange={set("medioPago")} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
        <TextField select size="small" label="Origen" value={f.origen} onChange={set("origen")} sx={{ minWidth: 140 }}><MenuItem value="">Todos</MenuItem><MenuItem value="pos">Mostrador</MenuItem><MenuItem value="presupuesto">Pedidos</MenuItem></TextField>
        {esJefe && <TextField select size="small" label="Sucursal" value={f.sucursalId} onChange={set("sucursalId")} sx={{ minWidth: 150 }}><MenuItem value="">Todas</MenuItem>{(boot.data?.sucursales || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}</TextField>}
        <TextField select size="small" label="Vendedor" value={f.usuarioId} onChange={set("usuarioId")} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem>{(boot.data?.usuarios || []).map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}</MenuItem>)}</TextField>
      </Box>

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }}>{TABS.map((x) => <Tab key={x.key} label={x.key === "sinFacturar" && t?.sinFacturar ? `${x.label} (${t.sinFacturar})` : x.label} />)}</Tabs>
        {t?.porMedio?.length > 0 && <span className="text-tertiary ventas-medios">{t.porMedio.map((m) => `${MEDIOS_PAGO[m.medio] || m.medio} ${money(m.importe)}`).join(" · ")}</span>}
      </Box>
      <DataTable columns={columns} data={q.data?.filas || []} loading={q.isLoading} emptyMessage="Sin ventas en este corte." onRowClick={(v) => navigate(`/ventas/${v.id}`)}
        pagination={{ page, rowsPerPage, totalCount: q.data?.total || 0, onPageChange: (_, p) => setPage(p), onRowsPerPageChange: (e) => { setRowsPerPage(Number(e.target.value)); setPage(0); } }} />
      {q.data && <Typography variant="caption" color="text.secondary">{num(q.data.total, 0)} comprobante(s) en el corte · tipos: {[...new Set((q.data.filas || []).map((v) => TIPOS_VENTA[v.tipo]?.label))].join(", ") || "—"}</Typography>}
    </Box>
  );
};

export default Ventas;
