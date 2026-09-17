/**
 * Tira de salud (§9.6): conexiones caídas o degradadas, primero.
 *
 * En el caso normal está vacía, y por eso no se dibuja: un panel que siempre
 * muestra una franja de estado enseña a ignorarla.
 */
import Card from "@mui/material/Card";

import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { getState } from "../api/integrationsApi";

const HealthStrip = ({ alerts = [] }) => {
  if (!alerts.length) return null;

  return (
    <Card className="entity-card in-health">
      <div className="in-health__head">
        <WarningAmberOutlinedIcon />
        <strong>{alerts.length} integración(es) necesitan atención</strong>
      </div>
      {alerts.map((a) => (
        <div className="in-health__row" key={a.portKey}>
          <StatusBadge tone={getState(a.state).tone} label={getState(a.state).label} />
          <span className="in-health__label">{a.label}</span>
          <em>{a.message}</em>
        </div>
      ))}
    </Card>
  );
};

export default HealthStrip;
