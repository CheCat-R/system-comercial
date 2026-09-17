/**
 * La matriz de cohortes, en CSS grid — sin librería, como el resto del panel.
 *
 * Fila = mes de primera compra. Columna = meses transcurridos desde esa alta.
 * Celda = qué proporción de la camada volvió a comprar, o cuánto lleva dejado
 * por cliente si se mira el LTV acumulado.
 *
 * **El triángulo vacío es información, no un bug de renderizado**: la cohorte
 * de junio no tiene mes+6 porque todavía no pasó. Se dibuja rayado y el
 * tooltip lo dice, en lugar de pintar un 0 % que se leería como una fuga.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import { formatValue } from "../lib/format";
import { monthLabel } from "../lib/cohorts";

/** Intensidad del tinte: 0,08 mínimo para que la celda con dato nunca sea invisible. */
const tint = (ratio) => 0.08 + Math.min(1, Math.max(0, ratio)) * 0.62;

const CohortMatrix = ({ matrix, mode = "retention", max }) => {
  if (!matrix?.rows?.length) {
    return <Box className="an-chart__empty">No hay cohortes completas para dibujar todavía.</Box>;
  }

  const isLtv = mode === "ltv";
  // El LTV acumulado necesita una escala común a toda la matriz; la retención
  // ya viene normalizada de fábrica entre 0 y 1.
  const ceiling = isLtv
    ? max || Math.max(...matrix.rows.flatMap((r) => r.cells.map((c) => c.cumPerCustomer || 0)), 1)
    : 1;

  return (
    <Box className="an-matrix__scroll">
      <table className="an-matrix">
        <thead>
          <tr>
            <th className="an-matrix__rowhead">Cohorte</th>
            <th className="an-matrix__size">Clientes</th>
            {matrix.offsets.map((o) => (
              <th key={o} className="an-matrix__colhead">mes {o}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.key}>
              <th className="an-matrix__rowhead">{row.label}</th>
              <td className="an-matrix__size">{row.size}</td>

              {row.cells.map((cell) => {
                if (!cell.mature) {
                  return (
                    <Tooltip key={cell.offset} title={`${row.label} + ${cell.offset} meses todavía no ocurrió. Vacío, no cero.`}>
                      <td className="an-matrix__cell an-matrix__cell--future"><span /></td>
                    </Tooltip>
                  );
                }

                const value = isLtv ? cell.cumPerCustomer : cell.retention;
                const alpha = tint((isLtv ? cell.cumPerCustomer / ceiling : cell.retention) || 0);
                const title = isLtv
                  ? `${row.label} + ${cell.offset}: ${formatValue(cell.cumPerCustomer, "money")} acumulados por cliente (${formatValue(cell.cumRevenue, "money")} entre ${row.size}).`
                  : `${row.label} + ${cell.offset}: volvieron ${cell.active} de ${row.size} · ${formatValue(cell.revenue, "money")} en el mes.`;

                return (
                  <Tooltip key={cell.offset} title={title}>
                    <td
                      className={`an-matrix__cell ${cell.offset === 0 ? "is-base" : ""}`.trim()}
                      style={{ background: `rgb(var(--an-tint) / ${alpha.toFixed(3)})` }}
                    >
                      {formatValue(value, isLtv ? "money" : "percent")}
                    </td>
                  </Tooltip>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="an-matrix__foot">
        Hasta <strong>{monthLabel(matrix.lastCompleteMonth)}</strong>, el último mes íntegro ·
        {" "}{matrix.rows.length} cohortes · {matrix.totalAccounts} clientes.
        {" "}El <strong>mes 0</strong> debería dar 100 %, y cuando no lo da es por una razón concreta:
        {" "}la camada tiene un cliente cuya primera compra terminó <strong>devuelta</strong>. La
        cohorte lo cuenta como alta —igual que la métrica «clientes nuevos»— pero la celda no lo
        cuenta como venta.
      </p>
    </Box>
  );
};

export default CohortMatrix;
