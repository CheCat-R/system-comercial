/**
 * Operaciones puras sobre el árbol de contenido (`sections[]`).
 *
 * Todo devuelve un árbol nuevo — nunca muta. Eso hace triviales el deshacer del
 * editor y el clonado draft ↔ published.
 */
import { BLOCK_SCHEMAS, getSchema, visibleFields } from "./blockSchemas";
import { DEFAULT_LAYOUT } from "./layout";
import { DEFAULT_VISIBILITY } from "./visibility";

let _uid = 0;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${(_uid++).toString(36)}`;

export const clone = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------------------------------------------ crear */

/** Props por defecto de un tipo, leídas del schema. */
export const defaultProps = (type) => {
  const schema = getSchema(type);
  if (!schema) return {};
  const props = {};
  schema.fields.forEach((f) => {
    props[f.key] = f.default !== undefined ? clone(f.default) : f.control === "switch" ? false : "";
  });
  return props;
};

export const createBlock = (type, overrides = {}) => ({
  id: uid("BL"),
  type,
  props: { ...defaultProps(type), ...(overrides.props || {}) },
  visibility: { ...DEFAULT_VISIBILITY },
  column: 0,
});

export const createSection = ({ name = "Sección", layout, blocks = [] } = {}) => ({
  id: uid("SC"),
  name,
  layout: { ...DEFAULT_LAYOUT, ...(layout || {}) },
  visibility: { ...DEFAULT_VISIBILITY },
  blocks,
});

/** Ítem nuevo para un campo `repeater`, con los defaults de sus sub-campos. */
export const createRepeaterItem = (field) => {
  const item = { _id: uid("IT") };
  (field.fields || []).forEach((f) => {
    item[f.key] = f.default !== undefined ? clone(f.default) : f.control === "switch" ? false : "";
  });
  return item;
};

/* --------------------------------------------------------------- recorrer */

export const findSection = (sections, sectionId) => sections.find((s) => s.id === sectionId) || null;

export const findBlock = (sections, blockId) => {
  for (const section of sections) {
    const block = section.blocks.find((b) => b.id === blockId);
    if (block) return { block, section };
  }
  return { block: null, section: null };
};

export const countBlocks = (sections) => sections.reduce((n, s) => n + s.blocks.length, 0);

export const countBlocksOfType = (sections, type) =>
  sections.reduce((n, s) => n + s.blocks.filter((b) => b.type === type).length, 0);

/* ------------------------------------------------------- editar secciones */

export const addSection = (sections, section = createSection(), index = null) => {
  const next = [...sections];
  next.splice(index == null ? next.length : index, 0, section);
  return next;
};

export const updateSection = (sections, sectionId, patch) =>
  sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s));

export const removeSection = (sections, sectionId) => sections.filter((s) => s.id !== sectionId);

export const duplicateSection = (sections, sectionId) => {
  const index = sections.findIndex((s) => s.id === sectionId);
  if (index < 0) return sections;
  const copy = clone(sections[index]);
  copy.id = uid("SC");
  copy.name = `${copy.name} (copia)`;
  copy.blocks = copy.blocks.map((b) => ({ ...b, id: uid("BL") }));
  return addSection(sections, copy, index + 1);
};

export const moveSection = (sections, sectionId, delta) => {
  const from = sections.findIndex((s) => s.id === sectionId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sections.length) return sections;
  const next = [...sections];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/* --------------------------------------------------------- editar bloques */

export const addBlock = (sections, sectionId, block, index = null) =>
  sections.map((s) => {
    if (s.id !== sectionId) return s;
    const blocks = [...s.blocks];
    blocks.splice(index == null ? blocks.length : index, 0, block);
    return { ...s, blocks };
  });

export const updateBlock = (sections, blockId, patch) =>
  sections.map((s) => ({
    ...s,
    blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
  }));

export const updateBlockProps = (sections, blockId, propsPatch) =>
  sections.map((s) => ({
    ...s,
    blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, props: { ...b.props, ...propsPatch } } : b)),
  }));

export const removeBlock = (sections, blockId) =>
  sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) }));

export const duplicateBlock = (sections, blockId) =>
  sections.map((s) => {
    const index = s.blocks.findIndex((b) => b.id === blockId);
    if (index < 0) return s;
    const copy = { ...clone(s.blocks[index]), id: uid("BL") };
    const blocks = [...s.blocks];
    blocks.splice(index + 1, 0, copy);
    return { ...s, blocks };
  });

/** Mueve dentro de la sección; si se pasa del borde, salta a la sección vecina. */
export const moveBlock = (sections, blockId, delta) => {
  const sIndex = sections.findIndex((s) => s.blocks.some((b) => b.id === blockId));
  if (sIndex < 0) return sections;
  const section = sections[sIndex];
  const bIndex = section.blocks.findIndex((b) => b.id === blockId);
  const target = bIndex + delta;

  if (target >= 0 && target < section.blocks.length) {
    const blocks = [...section.blocks];
    const [item] = blocks.splice(bIndex, 1);
    blocks.splice(target, 0, item);
    return sections.map((s, i) => (i === sIndex ? { ...s, blocks } : s));
  }

  const neighbour = sIndex + delta;
  if (neighbour < 0 || neighbour >= sections.length) return sections;
  const block = section.blocks[bIndex];
  return sections.map((s, i) => {
    if (i === sIndex) return { ...s, blocks: s.blocks.filter((b) => b.id !== blockId) };
    if (i === neighbour) {
      const blocks = [...s.blocks];
      blocks.splice(delta > 0 ? 0 : blocks.length, 0, block);
      return { ...s, blocks };
    }
    return s;
  });
};

/* ------------------------------------------------------------- validación */

/**
 * Problemas del árbol, para el editor y el panel "Necesita atención".
 * `resolve` viene de `tiendaApi` (necesita leer catálogo, banners y medios).
 * @returns {{ blockId, sectionId, level: "error"|"warning", message }[]}
 */
export const validateTree = (sections, resolve = {}) => {
  const issues = [];

  sections.forEach((section) => {
    if (section.blocks.length === 0) {
      issues.push({ sectionId: section.id, blockId: null, level: "warning", message: `La sección "${section.name}" está vacía.` });
    }

    section.blocks.forEach((block) => {
      const schema = getSchema(block.type);
      if (!schema) {
        issues.push({ sectionId: section.id, blockId: block.id, level: "error", message: `Tipo de bloque desconocido: ${block.type}.` });
        return;
      }

      // Sólo los campos que aplican con los valores actuales: un campo oculto
      // por `showIf` no puede ser obligatorio.
      visibleFields(schema, block.props).forEach((field) => {
        const value = block.props?.[field.key];
        const empty = value === "" || value == null || (Array.isArray(value) && value.length === 0);
        if (field.required && empty) {
          issues.push({ sectionId: section.id, blockId: block.id, level: "error", message: `${schema.label}: falta "${field.label}".` });
          return;
        }
        if (field.control === "repeater" && field.min && (value?.length || 0) < field.min) {
          issues.push({ sectionId: section.id, blockId: block.id, level: "warning", message: `${schema.label}: necesita al menos ${field.min} ítems.` });
        }
      });

      // Referencias rotas (regla §10.9): el bloque no rompe la página, pero avisa.
      const broken = resolve.checkBlock?.(block);
      if (broken) issues.push({ sectionId: section.id, blockId: block.id, level: broken.level || "warning", message: broken.message });
    });
  });

  Object.entries(BLOCK_SCHEMAS).forEach(([type, schema]) => {
    if (schema.maxPerPage && countBlocksOfType(sections, type) > schema.maxPerPage) {
      issues.push({ sectionId: null, blockId: null, level: "error", message: `Sólo puede haber ${schema.maxPerPage} bloque(s) "${schema.label}" por página.` });
    }
  });

  return issues;
};
