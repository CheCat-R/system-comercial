import Box from "@mui/material/Box";
import { money, percent } from "../lib/time";
import "./PnlWaterfall.css";

/**
 * Cascada de P&L: lista con subtotal corriente y una barra CSS proporcional al ingreso.
 * Sin librería de charts (mismo criterio que el resto de los mocks del panel).
 */
const PnlWaterfall = ({ rows }) => {
  const base = Math.max(1, ...rows.filter((r) => r.kind !== "cost").map((r) => Math.abs(r.amount)));

  return (
    <Box className="pnl-waterfall">
      {rows.map((r) => {
        const w = Math.min(100, (Math.abs(r.amount) / base) * 100);
        return (
          <Box key={r.key} className={`pnl-row pnl-row--${r.kind}`}>
            <Box className="pnl-row__head">
              <span className="pnl-row__label">
                {r.kind === "cost" ? "− " : ""}{r.label}
                {r.pending && <span className="pnl-row__pending"> · {r.pending}</span>}
              </span>
              <span className="pnl-row__amount mono">
                {r.pending ? "—" : money(r.amount)}
                {r.pct != null && <span className="pnl-row__pct"> · {percent(r.pct)}</span>}
              </span>
            </Box>
            {!r.pending && (
              <Box className="pnl-row__bar">
                <Box className="pnl-row__bar-fill" style={{ width: `${w}%` }} />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default PnlWaterfall;
