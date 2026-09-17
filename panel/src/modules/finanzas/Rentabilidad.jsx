import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import PercentOutlinedIcon from "@mui/icons-material/PercentOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import PeriodPicker from "./components/PeriodPicker";
import MarginBreakdown from "./components/MarginBreakdown";
import { DIMENSIONS, getAvailableMonths, getProfitabilityBy, getPnlSummary } from "./api/financeApi";
import { money, percent, formatDate } from "./lib/time";

const marginCell = (v) => (
  <span className="mono" style={{ fontWeight: 600, color: v < 0 ? "var(--danger-text)" : "inherit" }}>{money(v)}</span>
);
const pctCell = (v) => <span className="mono" style={{ color: v < 0 ? "var(--danger-text)" : "var(--text-secondary)" }}>{percent(v)}</span>;

const Rentabilidad = () => {
  const [params, setParams] = useSearchParams();
  const months = getAvailableMonths();
  const month = params.get("period") || "";
  const dimension = params.get("dim") || "pedido";
  const [selected, setSelected] = useState(null);

  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  const summary = getPnlSummary({ month: month || undefined });
  const rows = getProfitabilityBy(dimension, { month: month || undefined }).map((r) => ({ ...r, id: r.id || r.key }));

  const kpis = [
    { title: "Ingresos netos", value: money(summary.revenueNet), icon: <PaymentsOutlinedIcon />, hint: `${summary.orders} pedidos concretados` },
    { title: "Margen de contribución", value: money(summary.contributionMargin), icon: <SavingsOutlinedIcon /> },
    { title: "Margen %", value: percent(summary.contributionMarginPct), icon: <PercentOutlinedIcon /> },
    { title: "Ticket promedio", value: money(summary.avgTicket), icon: <ShoppingBagOutlinedIcon /> },
  ];

  const orderColumns = [
    {
      field: "orderId", headerName: "Pedido", renderCell: (r) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <span className="mono" style={{ fontWeight: 600 }}>#{r.orderId}</span>
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{r.customerName}</span>
        </Box>
      ),
    },
    { field: "channel", headerName: "Canal", renderCell: (r) => <span className="text-tertiary nowrap">{r.channel}</span> },
    { field: "date", headerName: "Fecha", renderCell: (r) => <span className="text-tertiary nowrap">{formatDate(r.date)}</span> },
    { field: "revenueNet", headerName: "Ingreso neto", align: "right", renderCell: (r) => <span className="mono">{money(r.revenueNet)}</span> },
    { field: "cogs", headerName: "COGS", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(-r.cogs)}</span> },
    { field: "shippingCost", headerName: "Envío", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(-r.shippingCost)}</span> },
    { field: "gatewayFee", headerName: "Comisiones", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(-r.gatewayFee)}</span> },
    { field: "contributionMargin", headerName: "Margen", align: "right", renderCell: (r) => marginCell(r.contributionMargin) },
    { field: "marginPct", headerName: "%", align: "right", renderCell: (r) => pctCell(r.marginPct) },
  ];

  const productColumns = [
    { field: "label", headerName: dimension === "categoria" ? "Categoría" : "Producto" },
    { field: "units", headerName: "Unidades", align: "right", renderCell: (r) => <span className="mono">{r.units}</span> },
    { field: "revenueNet", headerName: "Ingreso", align: "right", renderCell: (r) => <span className="mono">{money(r.revenueNet)}</span> },
    { field: "cogs", headerName: "COGS", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(-r.cogs)}</span> },
    { field: "allocatedCost", headerName: "Costo asignado", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(-r.allocatedCost)}</span> },
    { field: "contributionMargin", headerName: "Margen", align: "right", renderCell: (r) => marginCell(r.contributionMargin) },
    { field: "marginPct", headerName: "%", align: "right", renderCell: (r) => pctCell(r.marginPct) },
  ];

  const groupColumns = [
    { field: "label", headerName: DIMENSIONS.find((d) => d.key === dimension)?.label.replace("Por ", "") || "Grupo" },
    { field: "orders", headerName: "Pedidos", align: "right", renderCell: (r) => <span className="mono">{r.orders}</span> },
    { field: "revenueNet", headerName: "Ingreso neto", align: "right", renderCell: (r) => <span className="mono">{money(r.revenueNet)}</span> },
    { field: "contributionMargin", headerName: "Margen", align: "right", renderCell: (r) => marginCell(r.contributionMargin) },
    { field: "marginPct", headerName: "%", align: "right", renderCell: (r) => pctCell(r.marginPct) },
    { field: "avgTicket", headerName: "Ticket prom.", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(r.avgTicket)}</span> },
  ];

  const columns =
    dimension === "pedido" ? orderColumns :
    dimension === "producto" || dimension === "categoria" ? productColumns :
    groupColumns;

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Rentabilidad"
        subtitle="P&L calculado en vivo — nada de esto se edita a mano."
        actions={<PeriodPicker value={month} onChange={(v) => setParam({ period: v })} months={months} />}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <ToggleButtonGroup
        size="small" exclusive value={dimension}
        onChange={(_, v) => v && setParam({ dim: v === "pedido" ? "" : v })}
        sx={{ flexWrap: "wrap" }}
      >
        {DIMENSIONS.map((d) => <ToggleButton key={d.key} value={d.key}>{d.label}</ToggleButton>)}
      </ToggleButtonGroup>

      <DataTable
        columns={columns}
        data={rows}
        onRowClick={dimension === "pedido" ? (r) => setSelected(r) : undefined}
        emptyMessage="Sin ventas concretadas en este período."
      />

      <MarginBreakdown row={selected} onClose={() => setSelected(null)} />
    </Box>
  );
};

export default Rentabilidad;
