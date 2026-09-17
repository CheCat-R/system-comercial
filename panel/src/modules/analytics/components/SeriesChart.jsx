/**
 * Serie temporal en SVG propio — sin librería de gráficos, como el resto del panel.
 *
 * Dibuja tres cosas que la mayoría de los gráficos de tablero omiten y hacen
 * falta acá: la línea de comparación, **la frontera entre la historia generada y
 * los datos vivos** (§8.5), y las etiquetas de los extremos del eje.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { formatValue } from "../lib/format";

const W = 1000;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 26, left: 8 };

const SeriesChart = ({ rows = [], metricKey = "revenue_net", unit = "money", boundary = null, comparisonLabel }) => {
  const [hover, setHover] = useState(null);

  const points = rows.map((r) => {
    const m = r.values.find((v) => v.key === metricKey);
    return { label: r.label, value: m?.value ?? 0, reference: m?.reference ?? null };
  });

  if (points.length < 2) {
    return (
      <Box className="an-chart__empty">
        No hay suficientes puntos en este período para dibujar una serie.
      </Box>
    );
  }

  const values = points.map((p) => p.value);
  const refs = points.map((p) => p.reference).filter((v) => v != null);
  const max = Math.max(...values, ...refs, 1);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v) => PAD.top + innerH - (v / max) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const refPath = refs.length === points.length
    ? points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.reference)}`).join(" ")
    : null;

  return (
    <Box className="an-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="an-chart__svg" role="img" aria-label="Serie temporal">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={PAD.left} x2={W - PAD.right} y1={y(max * g)} y2={y(max * g)} className="an-chart__grid" />
        ))}

        {/* Frontera historia / dato vivo: es información, no decoración. */}
        {boundary != null && (
          <g>
            <line
              x1={PAD.left + boundary * innerW} x2={PAD.left + boundary * innerW}
              y1={PAD.top} y2={PAD.top + innerH}
              className="an-chart__boundary"
            />
            <text x={PAD.left + boundary * innerW + 6} y={PAD.top + 12} className="an-chart__boundary-label">
              datos vivos →
            </text>
          </g>
        )}

        <path d={areaPath} className="an-chart__area" />
        {refPath && <path d={refPath} className="an-chart__reference" />}
        <path d={linePath} className="an-chart__line" />

        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3} className="an-chart__dot" />
            <rect
              x={x(i) - innerW / points.length / 2} y={PAD.top}
              width={innerW / points.length} height={innerH}
              className="an-chart__hit"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}

        <text x={PAD.left} y={H - 8} className="an-chart__axis">{points[0].label}</text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="an-chart__axis">
          {points[points.length - 1].label}
        </text>
      </svg>

      <Box className="an-chart__legend">
        <span className="an-chart__key an-chart__key--main">Período actual</span>
        {refPath && <span className="an-chart__key an-chart__key--ref">{comparisonLabel || "Comparación"}</span>}
        {hover != null && (
          <Typography variant="caption" className="an-chart__readout">
            <strong>{points[hover].label}</strong> · {formatValue(points[hover].value, unit)}
            {points[hover].reference != null && ` · antes ${formatValue(points[hover].reference, unit)}`}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default SeriesChart;
