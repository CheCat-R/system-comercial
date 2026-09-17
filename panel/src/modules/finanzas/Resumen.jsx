import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import PeriodPicker from "./components/PeriodPicker";
import PnlWaterfall from "./components/PnlWaterfall";
import {
  getAvailableMonths, getPnlSummary, getPnlWaterfall, getCashFlow,
  getProfitabilityBy, getFinanceAlerts,
} from "./api/financeApi";
import { money, percent, monthLabel, prevMonthKey } from "./lib/time";
import "./Resumen.css";

const deltaFor = (curr, prev, invert = false) => {
  if (prev == null || prev === 0) return undefined;
  const change = (curr - prev) / Math.abs(prev);
  const up = change >= 0;
  return { value: percent(Math.abs(change)), direction: (up ? !invert : invert) ? "up" : "down" };
};

const Resumen = () => {
  const [params, setParams] = useSearchParams();
  const months = getAvailableMonths();
  const month = params.get("period") || "";
  const setMonth = (v) => setParams(v ? { period: v } : {});

  const summary = getPnlSummary({ month: month || undefined });
  const waterfall = getPnlWaterfall({ month: month || undefined });
  const cash = getCashFlow({ month: month || undefined });
  const byChannel = getProfitabilityBy("canal", { month: month || undefined });
  const topProducts = getProfitabilityBy("producto", { month: month || undefined }).slice(0, 5);
  const alerts = getFinanceAlerts();

  const prev = month ? getPnlSummary({ month: prevMonthKey(month) }) : null;

  const kpis = [
    { title: "Ingresos netos", value: money(summary.revenueNet), icon: <PaymentsOutlinedIcon />, delta: prev && deltaFor(summary.revenueNet, prev.revenueNet), hint: month ? `vs. ${monthLabel(prevMonthKey(month))}` : `${summary.orders} pedidos` },
    { title: "Margen bruto", value: percent(summary.grossMarginPct), icon: <ShowChartOutlinedIcon />, hint: money(summary.grossMargin) },
    { title: "Margen de contribución", value: percent(summary.contributionMarginPct), icon: <SavingsOutlinedIcon />, hint: money(summary.contributionMargin) },
    { title: "Resultado", value: money(summary.netResult), icon: <AccountBalanceOutlinedIcon />, delta: prev && deltaFor(summary.netResult, prev.netResult), hint: `${money(summary.operatingExpenses)} en gastos operativos` },
  ];

  const maxChannel = Math.max(1, ...byChannel.map((c) => c.contributionMargin));
  const maxProduct = Math.max(1, ...topProducts.map((p) => p.contributionMargin));

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Finanzas"
        subtitle="Rentabilidad de la operación y flujo de fondos, calculados sobre pedidos, catálogo y logística."
        actions={<PeriodPicker value={month} onChange={setMonth} months={months} />}
      />

      {alerts.length > 0 && (
        <Box className="fin-alerts">
          {alerts.map((a) => (
            <Box key={a.key} className="fin-alert">
              <InfoOutlinedIcon fontSize="small" />
              <span>{a.text}</span>
            </Box>
          ))}
        </Box>
      )}

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card className="entity-card" sx={{ height: "100%" }}>
            <Typography variant="h6" className="card-title">
              Estado de resultados · {month ? monthLabel(month) : "todos los períodos"}
            </Typography>
            <PnlWaterfall rows={waterfall} />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Flujo de fondos</Typography>
            <Box className="fin-cash">
              <div className="fin-cash__row"><span>Cobros de pedidos</span><strong className="mono">{money(cash.cobros)}</strong></div>
              <div className="fin-cash__row fin-cash__row--out"><span>Comisiones de pasarela</span><strong className="mono">{money(-cash.comisionPasarela)}</strong></div>
              <div className="fin-cash__row fin-cash__row--out"><span>Envíos a transportistas</span><strong className="mono">{money(-cash.costoEnvios)}</strong></div>
              <div className="fin-cash__row fin-cash__row--out"><span>Reembolsos</span><strong className="mono">{money(-cash.reembolsos)}</strong></div>
              <div className="fin-cash__row fin-cash__row--net"><span>Neto</span><strong className="mono">{money(cash.neto)}</strong></div>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Pagos a proveedores, gastos operativos y la posición de IVA se suman en la Fase 3.
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Rentabilidad por canal</Typography>
            <Box className="fin-bars">
              {byChannel.map((c) => (
                <Box key={c.key} className="fin-bar">
                  <Box className="fin-bar__head">
                    <span>{c.label}</span>
                    <span className="mono">{money(c.contributionMargin)} · {percent(c.marginPct)}</span>
                  </Box>
                  <Box className="fin-bar__track"><Box className="fin-bar__fill" style={{ width: `${Math.max(4, (c.contributionMargin / maxChannel) * 100)}%` }} /></Box>
                </Box>
              ))}
              {byChannel.length === 0 && <Typography variant="body2" color="text.secondary">Sin ventas en el período.</Typography>}
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Top productos por contribución</Typography>
            <Box className="fin-bars">
              {topProducts.map((p) => (
                <Box key={p.key} className="fin-bar">
                  <Box className="fin-bar__head">
                    <span>{p.label}</span>
                    <span className="mono">{money(p.contributionMargin)} · {percent(p.marginPct)}</span>
                  </Box>
                  <Box className="fin-bar__track"><Box className="fin-bar__fill" style={{ width: `${Math.max(4, (p.contributionMargin / maxProduct) * 100)}%` }} /></Box>
                </Box>
              ))}
              {topProducts.length === 0 && <Typography variant="body2" color="text.secondary">Sin ventas en el período.</Typography>}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Resumen;
