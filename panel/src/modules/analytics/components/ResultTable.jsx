/**
 * Tabla del Explorador: dimensión · métricas · comparación · Δ · % del total.
 *
 * El **% del total** sólo se muestra para métricas que se pueden sumar
 * (dinero, unidades, conteos). Un "% del total" sobre un promedio o un
 * porcentaje no significa nada, así que directamente no se dibuja.
 */
import { useState, Fragment } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import { formatValue, formatDelta, deltaTone, percent, safeDiv } from "../lib/format";

const ADDITIVE = ["money", "integer"];
const isAdditive = (unit, key) => ADDITIVE.includes(unit) && !key.includes("aov") && !key.includes("avg");

const Cell = ({ measurement, total, showShare, showCompare }) => {
  if (!measurement) return <td>—</td>;
  if (measurement.restricted) {
    return (
      <td className="an-table__restricted">
        <LockOutlinedIcon sx={{ fontSize: 13 }} /> sin acceso
      </td>
    );
  }

  const { value, unit, delta, reference } = measurement;
  const tone = deltaTone(delta, measurement.higherIsBetter);

  return (
    <>
      <td className="an-table__num">{formatValue(value, unit)}</td>
      {showCompare && (
        <td className="an-table__num an-table__compare">
          {formatValue(reference, unit)}
          {delta && (
            <span className={`an-table__delta an-table__delta--${tone}`}>
              {delta.direction === "up" && <ArrowUpwardIcon sx={{ fontSize: 11 }} />}
              {delta.direction === "down" && <ArrowDownwardIcon sx={{ fontSize: 11 }} />}
              {formatDelta(delta, unit)}
            </span>
          )}
        </td>
      )}
      {showShare && (
        <td className="an-table__num an-table__share">
          {total ? percent(safeDiv(value, total)) : "—"}
        </td>
      )}
    </>
  );
};

const ResultTable = ({ result }) => {
  const metrics = result.rows[0]?.values || result.totals;
  const [sortKey, setSortKey] = useState(metrics[0]?.key || null);
  const [sortDir, setSortDir] = useState("desc");

  if (!result.rows.length) {
    return <Box className="an-chart__empty">Elegí una dimensión para ver el detalle fila por fila.</Box>;
  }

  const showCompare = Boolean(result.comparison) || result.totals.some((t) => t.reference != null);
  const shares = metrics.map((m) => isAdditive(m.unit, m.key));

  const totalsByKey = new Map(result.totals.map((t) => [t.key, t.value]));

  const rows = [...result.rows].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a.values.find((v) => v.key === sortKey)?.value ?? -Infinity;
    const bv = b.values.find((v) => v.key === sortKey)?.value ?? -Infinity;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <Box className="an-table__wrap">
      <table className="an-table">
        <thead>
          <tr>
            <th className="an-table__dim">{result.dimension?.label}</th>
            {metrics.map((m, i) => (
              <th key={m.key} colSpan={1 + (showCompare ? 1 : 0) + (shares[i] ? 1 : 0)}>
                <button type="button" onClick={() => toggleSort(m.key)} className="an-table__sort">
                  {m.label}
                  {sortKey === m.key && (sortDir === "desc" ? " ↓" : " ↑")}
                </button>
              </th>
            ))}
            <th className="an-table__num">n</th>
          </tr>
          <tr className="an-table__subhead">
            <th />
            {metrics.map((m, i) => (
              <Fragment key={m.key}>
                <th className="an-table__num">valor</th>
                {showCompare && <th className="an-table__num">comparación</th>}
                {shares[i] && <th className="an-table__num">% del total</th>}
              </Fragment>
            ))}
            <th />
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="an-table__dim">{r.label}</td>
              {metrics.map((m, i) => (
                <Cell
                  key={m.key}
                  measurement={r.values.find((v) => v.key === m.key)}
                  total={totalsByKey.get(m.key)}
                  showShare={shares[i]}
                  showCompare={showCompare}
                />
              ))}
              <td className="an-table__num an-table__sample">{r.values[0]?.sample ?? "—"}</td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td className="an-table__dim">
              <Tooltip title="El total se calcula sobre todo el período, no como suma de las filas: un promedio o un porcentaje no se suman.">
                <span>Total</span>
              </Tooltip>
            </td>
            {metrics.map((m, i) => (
              <Cell
                key={m.key}
                measurement={result.totals.find((v) => v.key === m.key)}
                total={null}
                showShare={shares[i]}
                showCompare={showCompare}
              />
            ))}
            <td className="an-table__num an-table__sample">{result.totals[0]?.sample ?? "—"}</td>
          </tr>
        </tfoot>
      </table>
    </Box>
  );
};

export default ResultTable;
