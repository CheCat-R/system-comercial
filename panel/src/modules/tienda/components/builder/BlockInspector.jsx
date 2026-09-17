/**
 * Panel derecho del Store Builder.
 *
 * No tiene un formulario por bloque: recorre `schema.fields` y delega en
 * `SchemaField`. Agregar un tipo de bloque no toca este archivo.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";

import Button from "../../../../components/Button/Button";
import StatusBadge from "../../../../components/StatusBadge/StatusBadge";
import SchemaField from "./SchemaField";
import VisibilityForm from "./VisibilityForm";
import SectionLayoutForm from "./SectionLayoutForm";
import { getSchema, visibleFields } from "../../lib/blockSchemas";

const Header = ({ kind, title, subtitle }) => (
  <Box className="st-inspector__head">
    <span className="st-inspector__kind">{kind}</span>
    <Typography className="st-inspector__title">{title}</Typography>
    {subtitle && <Typography variant="caption" className="st-inspector__sub">{subtitle}</Typography>}
  </Box>
);

const Issues = ({ issues }) =>
  !issues?.length ? null : (
    <Box className="st-inspector__issues">
      {issues.map((issue, i) => (
        <div key={i} className={`st-issue st-issue--${issue.level}`}>
          <StatusBadge tone={issue.level === "error" ? "danger" : "warning"} label={issue.level === "error" ? "Error" : "Aviso"} />
          <span>{issue.message}</span>
        </div>
      ))}
    </Box>
  );

const BlockInspector = ({
  selection, refs, issues = [],
  onChangeProps, onChangeVisibility, onChangeSectionName, onChangeSectionLayout,
  onDuplicate, onDelete, onSaveAsTemplate,
}) => {
  if (!selection) {
    return (
      <Box className="st-inspector st-inspector--empty">
        <Typography variant="body2" className="text-tertiary">
          Elegí una sección o un bloque para editarlo.
        </Typography>
      </Box>
    );
  }

  /* ------------------------------------------------------------- sección */
  if (selection.kind === "section") {
    const section = selection.section;
    return (
      <Box className="st-inspector">
        <Header kind="Sección" title={section.name || "Sección"} subtitle={`${section.blocks.length} bloque(s)`} />
        <Issues issues={issues} />

        <SectionLayoutForm
          section={section}
          onChangeName={onChangeSectionName}
          onChangeLayout={onChangeSectionLayout}
        />

        <Divider className="st-inspector__divider" />
        <VisibilityForm visibility={section.visibility} audiences={refs.audiences} onChange={onChangeVisibility} />

        <Divider className="st-inspector__divider" />
        <Box className="st-inspector__actions">
          <Button variant="secondary" size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={onDuplicate}>Duplicar</Button>
          <Button variant="danger" size="small" startIcon={<DeleteOutlineIcon />} onClick={onDelete}>Eliminar</Button>
        </Box>
        <Button
          variant="ghost" size="small" startIcon={<BookmarkBorderOutlinedIcon />}
          disabled={section.blocks.length === 0}
          onClick={onSaveAsTemplate}
        >
          Guardar como sección reutilizable
        </Button>
      </Box>
    );
  }

  /* -------------------------------------------------------------- bloque */
  const block = selection.block;
  const schema = getSchema(block.type);

  if (!schema) {
    return (
      <Box className="st-inspector">
        <Header kind="Bloque" title={block.type} />
        <Typography variant="body2" className="text-tertiary">
          Este tipo de bloque no está en el catálogo. Puede venir de una versión anterior.
        </Typography>
        <Box className="st-inspector__actions">
          <Button variant="danger" size="small" startIcon={<DeleteOutlineIcon />} onClick={onDelete}>Eliminar</Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="st-inspector">
      <Header kind="Bloque" title={schema.label} subtitle={schema.description} />
      <Issues issues={issues} />

      <Box className="st-inspector__group">
        {visibleFields(schema, block.props).map((field) => (
          <SchemaField
            key={field.key} field={field} refs={refs}
            value={block.props?.[field.key]}
            onChange={(value) => onChangeProps({ [field.key]: value })}
          />
        ))}
      </Box>

      <Divider className="st-inspector__divider" />
      <VisibilityForm visibility={block.visibility} audiences={refs.audiences} onChange={onChangeVisibility} />

      <Divider className="st-inspector__divider" />
      <Box className="st-inspector__actions">
        <Button variant="secondary" size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={onDuplicate}>Duplicar</Button>
        <Button variant="danger" size="small" startIcon={<DeleteOutlineIcon />} onClick={onDelete}>Eliminar</Button>
      </Box>
    </Box>
  );
};

export default BlockInspector;
