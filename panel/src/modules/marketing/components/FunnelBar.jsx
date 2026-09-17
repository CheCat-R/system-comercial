import Box from "@mui/material/Box";
import { percent } from "../lib/time";
import "../Marketing.css";

/**
 * Embudo de una campaña: enviados → entregados → abiertos → clicks → conversiones.
 * Barras CSS proporcionales al total de enviados (sin librería de charts).
 */
const FunnelBar = ({ metrics }) => {
  const { sent = 0, delivered = 0, opened = 0, clicked = 0, conversions = 0 } = metrics || {};
  const base = Math.max(1, sent);
  const steps = [
    { label: "Enviados", value: sent },
    { label: "Entregados", value: delivered },
    { label: "Abiertos", value: opened },
    { label: "Clicks", value: clicked },
    { label: "Conversiones", value: conversions, accent: true },
  ];

  return (
    <Box className="mkt-funnel">
      {steps.map((s) => (
        <Box key={s.label} className="mkt-funnel__row">
          <span className="mkt-funnel__label">{s.label}</span>
          <Box className="mkt-funnel__track">
            <Box className={`mkt-funnel__fill ${s.accent ? "mkt-funnel__fill--accent" : ""}`} style={{ width: `${Math.max(2, (s.value / base) * 100)}%` }} />
          </Box>
          <span className="mkt-funnel__value mono">
            {s.value}
            {sent > 0 && s.label !== "Enviados" && <span className="mkt-funnel__pct"> · {percent(s.value / base)}</span>}
          </span>
        </Box>
      ))}
    </Box>
  );
};

export default FunnelBar;
