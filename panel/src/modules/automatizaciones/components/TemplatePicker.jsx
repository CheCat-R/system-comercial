/**
 * De dónde arranca una automatización nueva (§9.7).
 *
 * **Las plantillas son las reglas de fábrica**, no un segundo catálogo que
 * mantener sincronizado: empezar de una plantilla es duplicarla y editar la
 * copia. Entre las siete se ejercitan las dos familias de disparador y los tres
 * niveles de acción, así que también sirven de documentación de lo que el motor
 * puede hacer.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import AddIcon from "@mui/icons-material/Add";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { listTemplates, ACTION_TIERS } from "../api/automationsApi";

const TemplatePicker = ({ onPick, onClose }) => {
  const templates = listTemplates();

  return (
    <Modal
      open onClose={onClose} maxWidth="sm"
      title="Nueva automatización"
      subtitle="Arrancá de cero o partí de una plantilla y editala. Las plantillas son las automatizaciones de fábrica."
      actions={<Button variant="ghost" onClick={onClose}>Cancelar</Button>}
    >
      <Box className="au-picker">
        <button type="button" className="au-picker__item au-picker__item--blank" onClick={() => { onPick(null); onClose(); }}>
          <span className="au-picker__label">
            <strong><AddIcon sx={{ fontSize: 15, verticalAlign: "-3px" }} /> Empezar de cero</strong>
            <em>Elegís el disparador, las condiciones y las acciones</em>
          </span>
        </button>

        <span className="au-picker__grouplabel">Plantillas</span>

        {templates.map((t) => (
          <button type="button" className="au-picker__item" key={t.id} onClick={() => { onPick(t.id); onClose(); }}>
            <span className="au-picker__label">
              <strong><BoltOutlinedIcon sx={{ fontSize: 14, verticalAlign: "-2px" }} /> {t.name}</strong>
              <em>{t.sentence}</em>
            </span>
            <span className="au-picker__badges">
              <StatusBadge
                tone={t.kind === "state" ? "warning" : "info"}
                label={t.kind === "state" ? "observado" : "evento"}
                showDot={false}
              />
              <span className="au-chip">{t.subjectLabel}</span>
              {t.tiers.includes("sensitive") && (
                <Tooltip title="Incluye una acción sensible: no se ejecuta sola.">
                  <span className="au-chip au-chip--sensitive">sensible</span>
                </Tooltip>
              )}
            </span>
          </button>
        ))}
      </Box>
    </Modal>
  );
};

export default TemplatePicker;
