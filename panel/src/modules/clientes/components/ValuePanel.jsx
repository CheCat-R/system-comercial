import { money, relativeFromToday } from "../lib/time";
import { segmentOf } from "../lib/segments";
import "./ValuePanel.css";

const Delta = ({ value, benchmark }) => {
  if (!benchmark) return null;
  const pct = Math.round(((value - benchmark) / benchmark) * 100);
  if (Math.abs(pct) < 1) return <span className="vp-delta vp-delta--flat">≈ promedio</span>;
  const up = pct > 0;
  return (
    <span className={`vp-delta ${up ? "vp-delta--up" : "vp-delta--down"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs. segmento
    </span>
  );
};

/**
 * Panel de valor del cliente: métricas duras + comparativa contra el promedio
 * de su segmento smart.
 * @param {object} metrics  CustomerMetrics
 * @param {object|null} segmentAverages  { ltv, aov, frequencyYear, count }
 */
const ValuePanel = ({ metrics, segmentAverages }) => {
  const seg = segmentOf(metrics.segmentKey);
  const hasOrders = metrics.ordersCount > 0;

  return (
    <div className="vp">
      <div className="vp-grid">
        <div className="vp-cell vp-cell--hero">
          <span className="vp-label">Lifetime value</span>
          <strong className="vp-value">{money(metrics.ltv)}</strong>
          {hasOrders && (
            <Delta value={metrics.ltv} benchmark={segmentAverages?.ltv} />
          )}
        </div>
        <div className="vp-cell">
          <span className="vp-label">Ticket promedio</span>
          <strong className="vp-value">{money(metrics.aov)}</strong>
          {hasOrders && <Delta value={metrics.aov} benchmark={segmentAverages?.aov} />}
        </div>
        <div className="vp-cell">
          <span className="vp-label">Pedidos pagados</span>
          <strong className="vp-value">{metrics.ordersCount}</strong>
          {metrics.refundsCount > 0 && (
            <span className="vp-sub">{metrics.refundsCount} devolución{metrics.refundsCount > 1 ? "es" : ""}</span>
          )}
        </div>
        <div className="vp-cell">
          <span className="vp-label">Frecuencia (12 m)</span>
          <strong className="vp-value">{metrics.frequencyYear}</strong>
          {segmentAverages && (
            <span className="vp-sub">promedio del segmento: {segmentAverages.frequencyYear}</span>
          )}
        </div>
        <div className="vp-cell">
          <span className="vp-label">Última compra</span>
          <strong className="vp-value vp-value--sm">
            {hasOrders ? relativeFromToday(metrics.lastOrderAt) : "Nunca"}
          </strong>
        </div>
        <div className="vp-cell">
          <span className="vp-label">Antigüedad</span>
          <strong className="vp-value vp-value--sm">
            {hasOrders ? relativeFromToday(metrics.firstOrderAt).replace("Hace ", "") : "—"}
          </strong>
        </div>
      </div>

      <p className="vp-foot">
        Segmento <span className={`tier-badge tier-badge--${seg.tone} tier-badge--sm`}>{seg.label}</span>
        {segmentAverages
          ? ` — se compara contra ${segmentAverages.count} cuenta${segmentAverages.count > 1 ? "s" : ""} del mismo segmento.`
          : " — sin pares para comparar todavía."}
      </p>
    </div>
  );
};

export default ValuePanel;
