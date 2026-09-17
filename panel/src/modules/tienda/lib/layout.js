/**
 * Tokens de layout de la Sección — el **único** nivel donde se decide el aspecto.
 *
 * Es un set cerrado a propósito: sin CSS libre, sin márgenes negativos, sin z-index.
 * Si algo no se puede armar con estos tokens, falta un tipo de bloque, no falta
 * libertad. Ver docs/MODULO-TIENDA-CMS.md §5.
 */

export const WIDTHS = [
  { value: "full", label: "Completo", hint: "Sin margen lateral" },
  { value: "wide", label: "Ancho", hint: "1280 px" },
  { value: "narrow", label: "Angosto", hint: "720 px — ideal para texto" },
];

export const BACKGROUNDS = [
  { value: "surface", label: "Base" },
  { value: "sunken", label: "Hundido" },
  { value: "accent-subtle", label: "Acento suave" },
  { value: "inverted", label: "Invertido" },
];

export const SPACINGS = [
  { value: "none", label: "Sin espacio" },
  { value: "sm", label: "Chico" },
  { value: "md", label: "Medio" },
  { value: "lg", label: "Grande" },
  { value: "xl", label: "Extra" },
];

export const COLUMN_RATIOS = [
  { value: "equal", label: "Iguales" },
  { value: "1-2", label: "1 / 2" },
  { value: "2-1", label: "2 / 1" },
];

export const DEFAULT_LAYOUT = {
  width: "wide",
  background: "surface",
  spacing: "lg",
  columns: 1,
  columnRatio: "equal",
  mobileStack: true,
};

/** Clases CSS que consume el renderer (ver Tienda.css). */
export const layoutClassName = (layout = {}) => {
  const l = { ...DEFAULT_LAYOUT, ...layout };
  return [
    "st-section",
    `st-section--w-${l.width}`,
    `st-section--bg-${l.background}`,
    `st-section--sp-${l.spacing}`,
  ].join(" ");
};

export const gridStyle = (layout = {}) => {
  const l = { ...DEFAULT_LAYOUT, ...layout };
  if (l.columns <= 1) return { display: "grid", gap: "24px" };
  const template =
    l.columns === 2 && l.columnRatio === "1-2" ? "1fr 2fr"
      : l.columns === 2 && l.columnRatio === "2-1" ? "2fr 1fr"
        : `repeat(${l.columns}, 1fr)`;
  return { display: "grid", gap: "24px", gridTemplateColumns: template };
};

/** Resumen legible del layout para el outline del editor. */
export const describeLayout = (layout = {}) => {
  const l = { ...DEFAULT_LAYOUT, ...layout };
  const w = WIDTHS.find((x) => x.value === l.width)?.label || l.width;
  const b = BACKGROUNDS.find((x) => x.value === l.background)?.label || l.background;
  return l.columns > 1 ? `${w} · ${b} · ${l.columns} columnas` : `${w} · ${b}`;
};
