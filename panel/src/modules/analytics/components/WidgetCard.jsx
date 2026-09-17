/**
 * Un widget del dashboard.
 *
 * **Un widget es una consulta con forma**: no guarda números, guarda el mismo
 * objeto `{ metrics, dimension, period, compare, filters }` que un reporte y lo
 * hace pasar por el mismo `query()` que el Explorador. Por eso nunca puede
 * mostrar un número distinto al de la pantalla donde se armó.
 *
 * En modo edición aparecen los controles: mover, ancho, quitar. Se mueve con
 * flechas y no arrastrando (§9.5), igual que el outline del Store Builder.
 */
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CloseIcon from "@mui/icons-material/Close";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import MetricCard from "./MetricCard";
import SeriesChart from "./SeriesChart";
import BarChart from "./BarChart";
import ResultTable from "./ResultTable";
import CohortMatrix from "./CohortMatrix";

const SIZES = [1, 2, 3];

const Body = ({ widget, run }) => {
  if (widget.type === "cohort") {
    if (run.cohorts?.restricted) {
      return (
        <Box className="an-widget__locked">
          <LockOutlinedIcon sx={{ fontSize: 16 }} /> {run.cohorts.reason}
        </Box>
      );
    }
    return <CohortMatrix matrix={run.cohorts.matrix} mode="retention" />;
  }

  const { result } = run;
  const primary = widget.query.metrics[0];

  if (widget.type === "kpi") {
    return (
      <Box className="an-widget__kpis">
        {result.totals.map((t) => <MetricCard key={t.key} measurement={t} compact />)}
      </Box>
    );
  }

  if (widget.type === "line") {
    return (
      <SeriesChart
        rows={result.rows} metricKey={primary}
        unit={result.totals[0]?.unit} boundary={result.boundary}
        comparisonLabel={result.comparison?.label}
      />
    );
  }

  if (widget.type === "bar") return <BarChart result={result} metricKey={primary} />;

  return <ResultTable result={result} />;
};

const WidgetCard = ({ widget, run, editing, onMove, onResize, onRemove, canMoveUp, canMoveDown }) => (
  <Card className={`entity-card an-widget an-widget--${widget.size}`}>
    <Box className="card-title-row">
      <div className="an-widget__title">
        <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>{widget.title}</Typography>
        <span className="an-widget__meta">
          {widget.type === "cohort"
            ? "Ventana propia: la matriz no usa período ni corte"
            : widget.metricLabels.join(" · ") || "—"}
          {widget.type !== "cohort" && run?.result && <> · {run.result.period.label}</>}
        </span>
      </div>

      {editing && (
        <Box className="an-widget__tools">
          <Box className="an-widget__sizes">
            {SIZES.map((s) => (
              <Tooltip key={s} title={`Ocupar ${s} de 3 columnas`}>
                <button
                  type="button"
                  className={`an-widget__size ${widget.size === s ? "is-on" : ""}`.trim()}
                  onClick={() => onResize(s)}
                  aria-label={`Ancho ${s} de 3`}
                >
                  {s}
                </button>
              </Tooltip>
            ))}
          </Box>
          <IconButton size="small" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Mover antes">
            <ArrowUpwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton size="small" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Mover después">
            <ArrowDownwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton size="small" onClick={onRemove} aria-label="Quitar widget">
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      )}
    </Box>

    <Body widget={widget} run={run} />
  </Card>
);

export default WidgetCard;
