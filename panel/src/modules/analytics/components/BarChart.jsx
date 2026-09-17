/**
 * Barras horizontales para cortes que no son de tiempo.
 *
 * Horizontales y no verticales porque las etiquetas son nombres de producto o
 * de cliente: en vertical se rotan y dejan de leerse. Con `comparación` dibuja
 * una marca fina en el valor de referencia, así se ve el movimiento sin sumar
 * una segunda barra que compite por la atención.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import { formatValue, formatDelta, deltaTone } from "../lib/format";

const MAX_ROWS = 12;

const BarChart = ({ result, metricKey }) => {
  const key = metricKey || result.totals[0]?.key;
  const metric = result.totals.find((t) => t.key === key);

  if (!result.rows.length) {
    return <Box className="an-chart__empty">Elegí una dimensión para comparar valores.</Box>;
  }
  if (metric?.restricted) {
    return <Box className="an-chart__empty">Tu rol no accede a esta métrica.</Box>;
  }

  const rows = result.rows
    .map((r) => ({ ...r, m: r.values.find((v) => v.key === key) }))
    .filter((r) => r.m && r.m.value != null)
    .sort((a, b) => b.m.value - a.m.value)
    .slice(0, MAX_ROWS);

  if (!rows.length) return <Box className="an-chart__empty">Sin datos para esta métrica en el período.</Box>;

  const max = Math.max(...rows.map((r) => Math.max(r.m.value, r.m.reference ?? 0)), 1);
  const unit = rows[0].m.unit;

  return (
    <Box className="an-bars">
      {rows.map((r) => {
        const tone = deltaTone(r.m.delta, r.m.higherIsBetter);
        return (
          <div className="an-bars__row" key={r.key}>
            <span className="an-bars__label" title={r.label}>{r.label}</span>

            <span className="an-bars__track">
              <span className="an-bars__bar" style={{ width: `${Math.max(1.5, (r.m.value / max) * 100)}%` }} />
              {r.m.reference != null && (
                <Tooltip title={`Comparación: ${formatValue(r.m.reference, unit)}`}>
                  <span className="an-bars__ref" style={{ left: `${(r.m.reference / max) * 100}%` }} />
                </Tooltip>
              )}
            </span>

            <span className="an-bars__value">
              {formatValue(r.m.value, unit)}
              {r.m.delta && <em className={`an-bars__delta an-bars__delta--${tone}`}>{formatDelta(r.m.delta, unit)}</em>}
            </span>
          </div>
        );
      })}

      {result.rows.length > MAX_ROWS && (
        <span className="an-bars__more">
          Se muestran las {MAX_ROWS} primeras de {result.rows.length}. La tabla las tiene todas.
        </span>
      )}
    </Box>
  );
};

export default BarChart;
