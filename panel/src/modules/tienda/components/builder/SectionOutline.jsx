/**
 * Panel izquierdo del Store Builder: el árbol Secciones → Bloques.
 *
 * Sin drag & drop libre: reordenar es ↑ / ↓. Es menos vistoso y mucho más
 * predecible — y funciona igual con teclado.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import Button from "../../../../components/Button/Button";
import StatusBadge from "../../../../components/StatusBadge/StatusBadge";
import { getSchema, blockLabel } from "../../lib/blockSchemas";
import { describeLayout } from "../../lib/layout";
import { visibilityBadge } from "../../lib/visibility";
import { blockSummaryContext } from "../../api/tiendaApi";

const summaryFor = (block) => {
  const schema = getSchema(block.type);
  if (!schema?.summary) return null;
  try {
    return schema.summary(block.props || {}, blockSummaryContext(block));
  } catch {
    return null;
  }
};

const RowActions = ({ onUp, onDown, onToggle, hidden, disableUp, disableDown }) => (
  <span className="st-outline__actions">
    <IconButton size="small" onClick={onUp} disabled={disableUp} aria-label="subir"><ArrowUpwardIcon sx={{ fontSize: 14 }} /></IconButton>
    <IconButton size="small" onClick={onDown} disabled={disableDown} aria-label="bajar"><ArrowDownwardIcon sx={{ fontSize: 14 }} /></IconButton>
    <IconButton size="small" onClick={onToggle} aria-label={hidden ? "mostrar" : "ocultar"}>
      {hidden ? <VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />}
    </IconButton>
  </span>
);

/**
 * La fila es un `div[role=button]` y no un `<button>`: adentro lleva los
 * IconButton de reordenar y ocultar, y un botón no puede anidar botones.
 */
const Row = ({ className, onSelect, children }) => (
  <div
    className={className}
    role="button"
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); }
    }}
  >
    {children}
  </div>
);

const SectionOutline = ({
  sections, selectedId, issues = [],
  onSelect, onAddSection, onAddBlock,
  onMoveSection, onMoveBlock, onToggleSection, onToggleBlock,
}) => {
  const issuesFor = (id) => issues.filter((i) => i.blockId === id || (i.blockId === null && i.sectionId === id));

  return (
    <Box className="st-outline">
      <Box className="st-outline__head">
        <Typography className="st-outline__title">Estructura</Typography>
      </Box>

      <Box className="st-outline__list">
        {sections.length === 0 && (
          <Typography variant="body2" className="st-outline__empty">
            Todavía no hay secciones. Agregá la primera para empezar.
          </Typography>
        )}

        {sections.map((section, si) => {
          const badge = visibilityBadge(section.visibility);
          const sectionIssues = issuesFor(section.id);

          return (
            <Box key={section.id} className="st-outline__section">
              <Row
                className={`st-outline__row st-outline__row--section ${selectedId === section.id ? "is-selected" : ""}`.trim()}
                onSelect={() => onSelect({ kind: "section", id: section.id })}
              >
                <span className="st-outline__main">
                  <span className="st-outline__name">
                    {section.name || "Sección"}
                    {sectionIssues.length > 0 && (
                      <Tooltip title={sectionIssues[0].message}>
                        <WarningAmberOutlinedIcon className={`st-outline__warn st-outline__warn--${sectionIssues[0].level}`} sx={{ fontSize: 14 }} />
                      </Tooltip>
                    )}
                  </span>
                  <span className="st-outline__meta">{describeLayout(section.layout)}</span>
                </span>
                {badge && <StatusBadge tone={badge.tone} label={badge.label} showDot={false} />}
                <RowActions
                  hidden={section.visibility?.mode === "hidden"}
                  disableUp={si === 0} disableDown={si === sections.length - 1}
                  onUp={(e) => { e.stopPropagation(); onMoveSection(section.id, -1); }}
                  onDown={(e) => { e.stopPropagation(); onMoveSection(section.id, 1); }}
                  onToggle={(e) => { e.stopPropagation(); onToggleSection(section.id); }}
                />
              </Row>

              {section.blocks.map((block, bi) => {
                const blockIssues = issuesFor(block.id);
                const blockBadge = visibilityBadge(block.visibility);
                const summary = summaryFor(block);

                return (
                  <Row
                    key={block.id}
                    className={`st-outline__row st-outline__row--block ${selectedId === block.id ? "is-selected" : ""}`.trim()}
                    onSelect={() => onSelect({ kind: "block", id: block.id })}
                  >
                    <span className="st-outline__main">
                      <span className="st-outline__name">
                        {blockLabel(block.type)}
                        {blockIssues.length > 0 && (
                          <Tooltip title={blockIssues[0].message}>
                            <WarningAmberOutlinedIcon className={`st-outline__warn st-outline__warn--${blockIssues[0].level}`} sx={{ fontSize: 14 }} />
                          </Tooltip>
                        )}
                      </span>
                      {summary && <span className="st-outline__meta">{summary}</span>}
                    </span>
                    {blockBadge && <StatusBadge tone={blockBadge.tone} label={blockBadge.label} showDot={false} />}
                    <RowActions
                      hidden={block.visibility?.mode === "hidden"}
                      disableUp={si === 0 && bi === 0}
                      disableDown={si === sections.length - 1 && bi === section.blocks.length - 1}
                      onUp={(e) => { e.stopPropagation(); onMoveBlock(block.id, -1); }}
                      onDown={(e) => { e.stopPropagation(); onMoveBlock(block.id, 1); }}
                      onToggle={(e) => { e.stopPropagation(); onToggleBlock(block.id); }}
                    />
                  </Row>
                );
              })}

              <button type="button" className="st-outline__add" onClick={() => onAddBlock(section.id)}>
                <AddIcon sx={{ fontSize: 14 }} /> Bloque
              </button>
            </Box>
          );
        })}
      </Box>

      <Box className="st-outline__foot">
        <Button variant="secondary" size="small" fullWidth startIcon={<AddIcon />} onClick={onAddSection}>
          Agregar sección
        </Button>
      </Box>
    </Box>
  );
};

export default SectionOutline;
