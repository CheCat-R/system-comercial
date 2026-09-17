import Tooltip from "@mui/material/Tooltip";
import { RFM_LABELS } from "../lib/rfm";
import { segmentOf } from "../lib/segments";
import "./RfmScorecard.css";

const Meter = ({ dim, score }) => {
  const { name, hint } = RFM_LABELS[dim];
  return (
    <Tooltip title={hint} arrow>
      <div className="rfm-meter">
        <div className="rfm-meter__head">
          <span className="rfm-meter__dim">{dim.toUpperCase()}</span>
          <span className="rfm-meter__name">{name}</span>
        </div>
        <div className="rfm-meter__dots" role="img" aria-label={`${name}: ${score} de 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={`rfm-dot ${n <= score ? "is-on" : ""}`} />
          ))}
        </div>
      </div>
    </Tooltip>
  );
};

/**
 * Scorecard RFM: 3 medidores 1–5 + segmento resultante + el "por qué".
 * @param {{r,f,m,segmentKey,segmentReason,ordersCount}} metrics
 */
const RfmScorecard = ({ metrics }) => {
  const seg = segmentOf(metrics.segmentKey);

  if (!metrics.ordersCount) {
    return (
      <div className="rfm-card">
        <div className="rfm-empty">
          Sin pedidos todavía — el scoring RFM aparece con la primera compra.
        </div>
      </div>
    );
  }

  return (
    <div className="rfm-card">
      <div className="rfm-meters">
        <Meter dim="r" score={metrics.r} />
        <Meter dim="f" score={metrics.f} />
        <Meter dim="m" score={metrics.m} />
      </div>
      <div className="rfm-result">
        <div className="rfm-result__row">
          <span className={`tier-badge tier-badge--${seg.tone}`}>{seg.label}</span>
          <span className="rfm-result__code">{metrics.r}·{metrics.f}·{metrics.m}</span>
        </div>
        <p className="rfm-result__why">{metrics.segmentReason}</p>
      </div>
    </div>
  );
};

export default RfmScorecard;
