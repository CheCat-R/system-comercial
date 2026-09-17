/**
 * Al agregar una sección: en blanco o desde una guardada.
 *
 * Una guardada se inserta **como copia** — cada página queda dueña de la suya.
 * Ver docs/MODULO-TIENDA-CMS.md §9.8.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";

import Modal from "../../../../components/Modal/Modal";
import Button from "../../../../components/Button/Button";
import { blockLabel } from "../../lib/blockSchemas";

const SectionPicker = ({ open, savedSections = [], onPickBlank, onPickSaved, onClose }) => (
  <Modal
    open={open} onClose={onClose} maxWidth="sm"
    title="Agregar sección"
    subtitle="Una sección vacía, o una de las que ya guardaste."
    actions={<Button variant="ghost" onClick={onClose}>Cancelar</Button>}
  >
    <Box className="st-picker">
      <button type="button" className="st-picker__item st-picker__item--wide" onClick={onPickBlank}>
        <span className="st-picker__icon"><AddIcon fontSize="small" /></span>
        <span className="st-picker__name">Sección en blanco</span>
        <span className="st-picker__desc">Elegís el layout y le agregás bloques.</span>
      </button>

      {savedSections.length > 0 && (
        <Box className="st-picker__family">
          <Box className="st-picker__familyhead">
            <Typography className="st-picker__familyname">Secciones guardadas</Typography>
            <Typography variant="caption" className="text-tertiary">
              Se insertan como copia: editarlas acá no toca las otras páginas.
            </Typography>
          </Box>

          <Box className="st-picker__grid">
            {savedSections.map((s) => (
              <button key={s.id} type="button" className="st-picker__item" onClick={() => onPickSaved(s.id)}>
                <span className="st-picker__icon"><BookmarkBorderOutlinedIcon fontSize="small" /></span>
                <span className="st-picker__name">{s.name}</span>
                <span className="st-picker__desc">
                  {s.description || s.section.blocks.map((b) => blockLabel(b.type)).join(" · ")}
                </span>
              </button>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  </Modal>
);

export default SectionPicker;
