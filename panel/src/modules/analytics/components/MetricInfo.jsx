/**
 * ⭐ La ficha del contrato de una métrica.
 *
 * Es la pieza que hace cumplir la regla del módulo del lado del usuario: todo
 * número del panel se puede abrir y ver de dónde salió. Sin esto, un tablero es
 * una máquina de discutir de qué se está hablando (docs/MODULO-ANALYTICS.md §1.1).
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { formatValue } from "../lib/format";

const Row = ({ label, children }) => (
  <Box className="an-info__row">
    <span className="an-info__label">{label}</span>
    <div className="an-info__value">{children}</div>
  </Box>
);

export const MetricContract = ({ metric, measurement }) => (
  <Box className="an-info">
    <Typography className="an-info__question">{metric.question}</Typography>

    <Row label="Fórmula">
      <code className="an-info__formula">{metric.formula}</code>
    </Row>

    <Row label="Sale de">
      <Box className="an-info__chips">
        {metric.source.map((s) => <span className="an-chip an-chip--source" key={s}>{s}</span>)}
      </Box>
    </Row>

    <Row label="Se calcula por">{metric.grain}</Row>

    {metric.excludes?.length > 0 && (
      <Row label="No incluye">
        <Box className="an-info__chips">
          {metric.excludes.map((e) => <span className="an-chip an-chip--exclude" key={e}>{e}</span>)}
        </Box>
      </Row>
    )}

    <Row label="Se puede cortar por">
      {metric.dimensions?.length
        ? metric.dimensions.join(" · ")
        : <em className="text-tertiary">Es un total del período: no admite cortes.</em>}
    </Row>

    {measurement && !measurement.restricted && (
      <Row label="En este período">
        <Box className="an-info__chips">
          <strong>{formatValue(measurement.value, metric.unit)}</strong>
          <span className={`an-chip ${measurement.lowSample ? "an-chip--warn" : ""}`.trim()}>
            n = {measurement.sample}
            {measurement.minSample ? ` (necesita ${measurement.minSample})` : ""}
          </span>
        </Box>
      </Row>
    )}

    {metric.sensitive && (
      <Box className="an-info__note an-info__note--lock">
        <StatusBadge tone="neutral" label="Restringida" showDot={false} />
        <span>Margen, costo o CAC: sólo la ven Admin y Dirección. El motor directamente no la calcula para otros roles.</span>
      </Box>
    )}

    {metric.caveat && (
      <Box className="an-info__note an-info__note--caveat">
        <StatusBadge tone="warning" label="Ojo" showDot={false} />
        <span>{metric.caveat}</span>
      </Box>
    )}
  </Box>
);

const MetricInfoModal = ({ metric, measurement, onClose }) => (
  <Modal
    open onClose={onClose} maxWidth="sm"
    title={metric.label}
    subtitle="Qué significa, cómo se calcula y de dónde sale"
    actions={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}
  >
    <MetricContract metric={metric} measurement={measurement} />
  </Modal>
);

export default MetricInfoModal;
