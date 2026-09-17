import Box from "@mui/material/Box";
import { vatRateLabel } from "../lib/taxes";
import { money } from "../lib/time";
import "./TaxBreakdown.css";

/**
 * Descomposición neto + IVA por alícuota + percepciones + total. Se usa en el detalle de
 * comprobante y en la preview de emisión de NC/ND. Si la letra es "B" el IVA no se discrimina
 * (va como "IVA contenido", informativo).
 */
const TaxBreakdown = ({ doc, discriminated }) => {
  const showVat = discriminated ?? doc.letter === "A";
  const rates = [...new Set([...Object.keys(doc.netByRate || {}), ...Object.keys(doc.vatByRate || {})])]
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Box className="tax-breakdown">
      {rates.map((rate) => {
        const net = doc.netByRate?.[String(rate)] || 0;
        return (
          <div className="tax-breakdown__row" key={rate}>
            <span>{rate === 0 ? "Importe no gravado" : `Neto gravado ${vatRateLabel(rate)}`}</span>
            <span className="mono">{money(net)}</span>
          </div>
        );
      })}

      {showVat &&
        rates
          .filter((r) => r > 0)
          .map((rate) => (
            <div className="tax-breakdown__row" key={`iva-${rate}`}>
              <span>IVA {vatRateLabel(rate)}</span>
              <span className="mono">{money(doc.vatByRate?.[String(rate)] || 0)}</span>
            </div>
          ))}

      {(doc.perceptions || []).map((p, i) => (
        <div className="tax-breakdown__row" key={`perc-${i}`}>
          <span>Percepción {p.tax} {p.jurisdiction}</span>
          <span className="mono">{money(p.amount)}</span>
        </div>
      ))}

      {!showVat && doc.totalVat > 0 && (
        <div className="tax-breakdown__row tax-breakdown__row--muted">
          <span>IVA contenido</span>
          <span className="mono">{money(doc.totalVat)}</span>
        </div>
      )}

      <div className="tax-breakdown__row tax-breakdown__row--total">
        <span>Total</span>
        <span className="mono">{money(doc.total)}</span>
      </div>
    </Box>
  );
};

export default TaxBreakdown;
