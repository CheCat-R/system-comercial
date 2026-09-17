/**
 * KPI con su delta, su `n` y el acceso a su contrato.
 *
 * Tres decisiones que no son cosméticas:
 *  · El delta muestra **el valor de referencia**, no sólo el porcentaje: un
 *    "+24 %" no dice si fue de 4 a 5 o de 400 a 496 (§4).
 *  · Debajo de `minSample` la tarjeta se atenúa y lo dice (§8.6).
 *  · Una métrica restringida no muestra un valor tapado: muestra que el motor
 *    no la calculó (§10).
 */
import { useState } from "react";
import Card from "@mui/material/Card";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";

import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import MetricInfoModal from "./MetricInfo";
import { formatValue, formatDelta, deltaTone } from "../lib/format";

const MetricCard = ({ measurement, compact = false }) => {
  const [info, setInfo] = useState(false);

  if (!measurement) return null;

  if (measurement.restricted) {
    return (
      <Card className="an-kpi an-kpi--restricted">
        <span className="an-kpi__label">{measurement.label}</span>
        <span className="an-kpi__locked">
          <LockOutlinedIcon sx={{ fontSize: 16 }} />
          Sin acceso
        </span>
        <span className="an-kpi__foot">Tu rol no ve métricas de costo.</span>
      </Card>
    );
  }

  const { metric, value, unit, delta, reference, referenceLabel, sample, lowSample, minSample } = measurement;
  const tone = deltaTone(delta, measurement.higherIsBetter);

  return (
    <>
      <Card className={`an-kpi ${lowSample ? "is-low-sample" : ""} ${compact ? "an-kpi--compact" : ""}`.trim()}>
        <div className="an-kpi__head">
          <span className="an-kpi__label">{measurement.label}</span>
          <Tooltip title="Ver fórmula y origen">
            <IconButton size="small" className="an-kpi__info" onClick={() => setInfo(true)} aria-label={`Ficha de ${measurement.label}`}>
              <InfoOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </div>

        <strong className="an-kpi__value">{formatValue(value, unit)}</strong>

        {delta ? (
          <span className={`an-kpi__delta an-kpi__delta--${tone}`}>
            {delta.direction === "up" && <ArrowUpwardIcon sx={{ fontSize: 13 }} />}
            {delta.direction === "down" && <ArrowDownwardIcon sx={{ fontSize: 13 }} />}
            {formatDelta(delta, unit)}
          </span>
        ) : (
          <span className="an-kpi__delta an-kpi__delta--neutral">Sin comparación</span>
        )}

        <span className="an-kpi__foot">
          {reference != null && (
            <>{referenceLabel}: {formatValue(reference, unit)} · </>
          )}
          n = {sample}
          {lowSample && (
            <Tooltip title={`Necesita al menos ${minSample} casos para ser estable. ${metric.caveat || ""}`}>
              <em className="an-kpi__warn"> · muestra baja</em>
            </Tooltip>
          )}
        </span>
      </Card>

      {info && <MetricInfoModal metric={metric} measurement={measurement} onClose={() => setInfo(false)} />}
    </>
  );
};

export default MetricCard;
