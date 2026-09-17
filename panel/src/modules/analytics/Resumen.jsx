/**
 * Resumen ejecutivo — lo que se mira todos los días, en un scroll.
 *
 * Seis KPIs con su delta y su `n`, la serie principal con la frontera
 * historia/vivo, tres cortes rápidos y el panel "Qué mirar".
 * Ver docs/MODULO-ANALYTICS.md §9.1.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

import MetricCard from "./components/MetricCard";
import PeriodPicker from "./components/PeriodPicker";
import SeriesChart from "./components/SeriesChart";
import { getSummary } from "./api/analyticsApi";
import { formatValue, safeDiv } from "./lib/format";
import "./Analytics.css";

/** Barra proporcional para los cortes rápidos: sin librería, como todo el panel. */
const RankRow = ({ label, value, max, unit, extra }) => (
  <div className="an-rank">
    <span className="an-rank__label">{label}</span>
    <span className="an-rank__track">
      <span className="an-rank__bar" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </span>
    <span className="an-rank__value">
      {formatValue(value, unit)}
      {extra && <em>{extra}</em>}
    </span>
  </div>
);

const LEVEL_TONE = { warning: "warning", info: "info", error: "danger" };
/** Una alerta de umbral y un objetivo incumplido no pesan igual: se nombran distinto. */
const LEVEL_LABEL = { error: "Alerta", warning: "Aviso", info: "Nota" };

const Resumen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || "";

  const [range, setRange] = useState({ period: "last90", compare: "previous", range: null });

  const summary = useMemo(
    () => getSummary({ period: range.period, range: range.range, compare: range.compare, role }),
    [range, role]
  );

  const maxProduct = Math.max(...summary.topProducts.map((r) => r.values[0]?.value || 0), 1);
  const maxCategory = Math.max(...summary.byCategory.map((r) => r.values[0]?.value || 0), 1);
  const channelTotal = summary.byChannel.reduce((s, r) => s + (r.values[0]?.value || 0), 0);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Analytics"
        subtitle="Qué pasó y por qué. Todo número se puede abrir para ver su fórmula y de qué módulo sale."
        actions={
          <Button variant="secondary" startIcon={<MenuBookOutlinedIcon />} onClick={() => navigate("/analytics/metricas")}>
            Diccionario de métricas
          </Button>
        }
      />

      <PeriodPicker
        value={range}
        onChange={setRange}
        sources={summary.sources}
        partial={summary.period.isPartial}
      />

      <Grid container spacing={2.5}>
        {summary.kpis.map((k) => (
          <Grid key={k.key} size={{ xs: 12, sm: 6, lg: 2 }}>
            <MetricCard measurement={k} compact />
          </Grid>
        ))}
      </Grid>

      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
            Ingresos netos {summary.granularityLabel}
          </Typography>
          <Typography variant="caption" className="text-tertiary">{summary.sources.text}</Typography>
        </Box>
        <SeriesChart
          rows={summary.series}
          metricKey="revenue_net"
          unit="money"
          boundary={summary.boundary}
          comparisonLabel={summary.comparison?.label}
        />
      </Card>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Top productos</Typography>
            {summary.topProducts.length === 0 ? (
              <Typography variant="body2" className="text-tertiary">Sin ventas en el período.</Typography>
            ) : (
              summary.topProducts.map((r) => (
                <RankRow
                  key={r.key} label={r.label} unit="money"
                  value={r.values[0]?.value || 0} max={maxProduct}
                  extra={` · ${r.values[1]?.value || 0} u.`}
                />
              ))
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 3 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Por categoría</Typography>
            {summary.byCategory.map((r) => (
              <RankRow key={r.key} label={r.label} unit="money" value={r.values[0]?.value || 0} max={maxCategory} />
            ))}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card className="entity-card">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Por canal</Typography>
              <Typography variant="caption" className="text-tertiary">Proxy, no adquisición</Typography>
            </Box>
            {summary.byChannel.map((r) => {
              const value = r.values[0]?.value || 0;
              return (
                <div className="an-channel" key={r.key}>
                  <div>
                    <strong>{r.label}</strong>
                    <em>{r.values[1]?.value || 0} pedidos</em>
                  </div>
                  <span>
                    {formatValue(value, "money")}
                    <em>{formatValue(safeDiv(value, channelTotal), "percent")}</em>
                  </span>
                </div>
              );
            })}
          </Card>
        </Grid>
      </Grid>

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Qué mirar</Typography>
        {summary.attention.length === 0 ? (
          <Typography variant="body2" className="text-tertiary">
            Nada fuera de lo esperado: todos los KPIs están dentro del objetivo y con muestra suficiente.
          </Typography>
        ) : (
          <Box className="an-attention">
            {summary.attention.map((a, i) => (
              <div className={`an-attention__row ${a.level === "error" ? "an-attention__row--error" : ""}`.trim()} key={i}>
                <StatusBadge tone={LEVEL_TONE[a.level]} label={LEVEL_LABEL[a.level] || "Nota"} />
                <span>
                  {a.message}
                  {a.detail && <em className="an-attention__detail">{a.detail}</em>}
                </span>
              </div>
            ))}
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default Resumen;
