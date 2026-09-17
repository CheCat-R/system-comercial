/**
 * Selector de bloques — el catálogo cerrado, agrupado por familia.
 *
 * Sólo ofrece tipos válidos para el tipo de página y respeta `maxPerPage`.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import Modal from "../../../../components/Modal/Modal";
import Button from "../../../../components/Button/Button";
import { blocksByFamily } from "../../lib/blockSchemas";
import { countBlocksOfType } from "../../lib/blocks";

const BlockPicker = ({ open, pageType, sections, isAdmin = false, onPick, onClose }) => {
  const families = blocksByFamily(pageType, { isAdmin });

  return (
    <Modal
      open={open} onClose={onClose} maxWidth="md"
      title="Agregar bloque"
      subtitle="El catálogo es cerrado: cada bloque sabe qué datos leer y cómo dibujarse."
      actions={<Button variant="ghost" onClick={onClose}>Cancelar</Button>}
    >
      <Box className="st-picker">
        {families.map((family) => (
          <Box key={family.key} className="st-picker__family">
            <Box className="st-picker__familyhead">
              <Typography className="st-picker__familyname">{family.label}</Typography>
              <Typography variant="caption" className="text-tertiary">{family.hint}</Typography>
            </Box>

            <Box className="st-picker__grid">
              {family.blocks.map((b) => {
                const Icon = b.icon;
                const atLimit = b.maxPerPage && countBlocksOfType(sections, b.type) >= b.maxPerPage;
                return (
                  <button
                    key={b.type} type="button" className="st-picker__item"
                    disabled={atLimit} onClick={() => onPick(b.type)}
                  >
                    <span className="st-picker__icon"><Icon fontSize="small" /></span>
                    <span className="st-picker__name">{b.label}</span>
                    <span className="st-picker__desc">
                      {atLimit ? `Ya hay ${b.maxPerPage} en esta página.` : b.description}
                    </span>
                  </button>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Modal>
  );
};

export default BlockPicker;
