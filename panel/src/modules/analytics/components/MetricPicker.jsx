/**
 * Selector de métricas.
 *
 * Muestra **la pregunta** de cada métrica, no sólo el nombre (§9.2): quien no
 * conoce el diccionario elige igual, porque lee qué responde cada una.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { AREAS, listMetrics, canSeeSensitive } from "../api/analyticsApi";

const MAX = 4;

const MetricPicker = ({ open, selected = [], role = "", onChange, onClose }) => {
  const sensitiveOk = canSeeSensitive(role);

  const toggle = (key) => {
    if (selected.includes(key)) {
      // Siempre queda al menos una: una consulta sin métrica no es una consulta.
      if (selected.length === 1) return;
      onChange(selected.filter((k) => k !== key));
      return;
    }
    if (selected.length >= MAX) return;
    onChange([...selected, key]);
  };

  return (
    <Modal
      open={open} onClose={onClose} maxWidth="md"
      title="Elegir métricas"
      subtitle={`Hasta ${MAX} por consulta. La primera manda en el gráfico y en el orden de la tabla.`}
      actions={<Button variant="primary" onClick={onClose}>Listo ({selected.length})</Button>}
    >
      <Box className="an-picker">
        {AREAS.map((area) => {
          const metrics = listMetrics({ area: area.key });
          return (
            <Box className="an-picker__area" key={area.key}>
              <Box className="an-picker__areahead">
                <Typography className="an-picker__areaname">{area.label}</Typography>
                <Typography variant="caption" className="text-tertiary">{area.hint}</Typography>
              </Box>

              <Box className="an-picker__grid">
                {metrics.map((m) => {
                  const isOn = selected.includes(m.key);
                  const locked = m.sensitive && !sensitiveOk;
                  const full = !isOn && selected.length >= MAX;
                  return (
                    <button
                      key={m.key} type="button"
                      className={`an-picker__item ${isOn ? "is-on" : ""}`.trim()}
                      disabled={locked || full}
                      onClick={() => toggle(m.key)}
                      title={locked ? "Tu rol no accede a métricas de costo" : full ? `Máximo ${MAX} métricas` : undefined}
                    >
                      <Checkbox size="small" checked={isOn} disabled={locked || full} tabIndex={-1} />
                      <span className="an-picker__text">
                        <span className="an-picker__name">
                          {m.label}
                          {locked && <LockOutlinedIcon sx={{ fontSize: 12, ml: 0.5, verticalAlign: "-1px" }} />}
                        </span>
                        <span className="an-picker__question">{m.question}</span>
                      </span>
                    </button>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Modal>
  );
};

export default MetricPicker;
