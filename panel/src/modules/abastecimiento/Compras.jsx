/**
 * COMPRAS — los comprobantes del proveedor: facturas, remitos, liquidaciones
 * y notas. Arriba, lo que se le debe a todos, los remitos que esperan factura
 * y la plata pagada en sucursal que nadie aplicó todavía.
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
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi } from "./api/proveedoresApi";
import { comprasApi, TIPOS_COMPROBANTE, ESTADOS_COMPROBANTE, money, fecha } from "./api/comprasApi";
import "./Compras.css";

const TABS = [{ key: "", label: "Todos" }, { key: "factura", label: "Facturas" }, { key: "remito", label: "Remitos" }, { key: "notas", label: "Notas" }, { key: "liquidacion", label: "Liquidaciones" }];

const Compras = () => {
  const navigate = useNavigate();
  const { check, can, esJefe } = useAuth();
  const [tab, setTab] = useState(0);
  const [f, setF] = useState({ proveedorId: "", estado: "", desde: "", hasta: "" });
  const puedeCargar = check("facturas");
  const veLiq = can("liquidaciones");

  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });
  const params = useMemo(() => {
    const k = TABS[tab].key;
    return { proveedorId: f.proveedorId || undefined, estado: f.estado || undefined, desde: f.desde || undefined, hasta: f.hasta || undefined, tipo: k && k !== "notas" ? k : undefined, limit: 500 };
  }, [f, tab]);
  const lista = useQuery({ queryKey: ["comprobantes", "lista", params], queryFn: () => comprasApi.comprobantes.listar(params), placeholderData: (prev) => prev });
  const saldos = useQuery({ queryKey: ["comprobantes", "saldos"], queryFn: comprasApi.comprobantes.saldos });
  const remitos = useQuery({ queryKey: ["comprobantes", "remitos-pendientes"], queryFn: () => comprasApi.comprobantes.remitosPendientes() });
  const sinAplicar = useQuery({ queryKey: ["pagos", "sin-aplicar", "mercaderia"], queryFn: () => comprasApi.pagos.sinAplicar("mercaderia"), enabled: can("compras.pagos", "gastos.pagos_proveedor", "ventas.caja") });

  const rows = useMemo(() => {
    const k = TABS[tab].key;
    const base = lista.data || [];
    return k === "notas" ? base.filter((c) => c.tipo === "nota_credito" || c.tipo === "nota_debito") : base;
  }, [lista.data, tab]);
  const totalFiltro = useMemo(() => rows.filter((c) => c.estado === "confirmado").reduce((a, c) => a + (c.tipo === "nota_credito" ? -c.total : (c.tipo === "remito" || c.tipo === "orden_compra" ? 0 : c.total)), 0), [rows]);

  const columns = [
    { field: "fecha", headerName: "Fecha", renderCell: (c) => <span className="nowrap">{fecha(c.fecha)}</span> },
    { field: "etiqueta", headerName: "Comprobante", renderCell: (c) => <Box><strong>{c.etiqueta}</strong>{c.refEtiqueta && <Typography variant="caption" display="block" color="text.secondary">ajusta {c.refEtiqueta}</Typography>}{c.cae && <Typography variant="caption" display="block" color="text.secondary">CAE {c.cae}</Typography>}</Box> },
    { field: "proveedorNombre", headerName: "Proveedor" },
    { field: "tipo", headerName: "Tipo", renderCell: (c) => <StatusBadge tone={TIPOS_COMPROBANTE[c.tipo]?.tone} label={TIPOS_COMPROBANTE[c.tipo]?.corto || c.tipo} showDot={false} /> },
    { field: "recepcion", headerName: "Stock", renderCell: (c) => (c.recepcion ? <span className="text-tertiary">{c.tipo === "nota_credito" ? "devolvió" : "ingresó"}{c.sucursalNombre ? ` · ${c.sucursalNombre}` : ""}</span> : <span className="text-tertiary">—</span>) },
    { field: "total", headerName: "Total", align: "right", renderCell: (c) => <strong className={`compras-num ${c.tipo === "nota_credito" ? "compras-num--neg" : ""}`}>{c.tipo === "nota_credito" ? "−" : ""}{money(c.total)}</strong> },
    { field: "saldo", headerName: "Saldo", align: "right", renderCell: (c) => (["factura", "liquidacion", "nota_debito"].includes(c.tipo) && c.estado === "confirmado" ? (c.saldo > 0.009 ? <span className="compras-num compras-num--saldo">{money(c.saldo)}</span> : <span className="text-tertiary">pagada</span>) : <span className="text-tertiary">—</span>) },
    { field: "estado", headerName: "Estado", renderCell: (c) => <StatusBadge tone={ESTADOS_COMPROBANTE[c.estado]?.tone} label={ESTADOS_COMPROBANTE[c.estado]?.label || c.estado} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Compras" subtitle="Lo que el proveedor emite: la factura genera deuda y, con recepción, ingresa la mercadería; el remito solo ingresa; la nota de crédito ajusta."
        actions={(
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="secondary" onClick={() => navigate("/abastecimiento/pagos")}>Pagos a proveedores</Button>
            <Tooltip title={puedeCargar.allowed ? "" : puedeCargar.reason}><span><Button variant="primary" startIcon={<AddIcon />} disabled={!puedeCargar.allowed} onClick={() => navigate("/abastecimiento/compras/nuevo")}>Nuevo comprobante</Button></span></Tooltip>
          </Box>
        )} />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Deuda con proveedores" value={money(saldos.data?.total || 0)} hint="mercadería confirmada − pagado" icon={<AccountBalanceWalletOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Remitos sin facturar" value={String(remitos.data?.length || 0)} hint="ya ingresaron mercadería" icon={<LocalShippingOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Pagos sin aplicar" value={money(sinAplicar.data?.total || 0)} hint={sinAplicar.data ? `${sinAplicar.data.cantidad} pago(s) a cuenta` : "—"} icon={<PaymentsOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total del filtro" value={money(totalFiltro)} hint={`${rows.length} comprobante(s)`} icon={<ReceiptLongOutlinedIcon />} /></Grid>
      </Grid>

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>{TABS.filter((t) => t.key !== "liquidacion" || veLiq).map((t) => <Tab key={t.key} label={t.label} />)}</Tabs>
        <Box className="table-toolbar__filters compras-toolbar">
          <TextField select size="small" value={f.proveedorId} onChange={(e) => setF({ ...f, proveedorId: e.target.value })} sx={{ minWidth: 200 }} label="Proveedor">
            <MenuItem value="">Todos</MenuItem>{(proveedores.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}
          </TextField>
          <TextField select size="small" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} sx={{ minWidth: 140 }} label="Estado">
            <MenuItem value="">Todos</MenuItem>{Object.entries(ESTADOS_COMPROBANTE).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="Desde" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Hasta" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
      </Box>
      <DataTable columns={columns} data={rows} loading={lista.isLoading} emptyMessage="Sin comprobantes con ese filtro." onRowClick={(c) => navigate(`/abastecimiento/compras/${c.id}`)} pagination={{ pageSize: 25 }} />
      {esJefe && remitos.data?.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>Los remitos pendientes se convierten en factura desde su detalle cuando llega el papel: la mercadería no vuelve a ingresar.</Typography>}
    </Box>
  );
};

export default Compras;
