/**
 * Apariencia — el set cerrado de decisiones visuales del sitio.
 *
 * Misma lógica que el layout de la Sección (§5): no hay campo de color libre ni
 * selector de fuentes arbitrario. Se elige de una lista corta y curada, así la
 * tienda no se puede romper y cualquiera del equipo comercial la puede tocar.
 *
 * Ver docs/MODULO-TIENDA-CMS.md §9.9.
 */

/** Paletas: acento + su versión suave. El neutro lo sigue poniendo el panel. */
export const PALETTES = [
  { value: "indigo", label: "Índigo", accent: "#4f46e5", hover: "#4338ca", subtle: "#eef2ff", border: "#e0e7ff" },
  { value: "esmeralda", label: "Esmeralda", accent: "#059669", hover: "#047857", subtle: "#ecfdf5", border: "#d1fae5" },
  { value: "ambar", label: "Ámbar", accent: "#b45309", hover: "#92400e", subtle: "#fffbeb", border: "#fef3c7" },
  { value: "carmin", label: "Carmín", accent: "#be123c", hover: "#9f1239", subtle: "#fff1f2", border: "#ffe4e6" },
  { value: "grafito", label: "Grafito", accent: "#334155", hover: "#1e293b", subtle: "#f1f5f9", border: "#e2e8f0" },
];

/**
 * Pares tipográficos. Stacks del sistema a propósito: no se carga una fuente
 * externa para previsualizar, y el storefront real elige el proveedor.
 */
export const TYPE_PRESETS = [
  {
    value: "moderna", label: "Moderna", hint: "Sans en todo. Neutra y legible.",
    heading: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  {
    value: "editorial", label: "Editorial", hint: "Titulares con serif. Buena para blog.",
    heading: 'Georgia, "Times New Roman", serif',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  {
    value: "tecnica", label: "Técnica", hint: "Titulares condensados y monoespaciados.",
    heading: '"SFMono-Regular", ui-monospace, "Cascadia Mono", Menlo, monospace',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
];

export const RADII = [
  { value: "none", label: "Recto", card: "0px", control: "0px" },
  { value: "sm", label: "Suave", card: "8px", control: "6px" },
  { value: "md", label: "Redondeado", card: "12px", control: "8px" },
  { value: "lg", label: "Muy redondeado", card: "20px", control: "12px" },
];

export const DENSITIES = [
  { value: "compacta", label: "Compacta", factor: 0.75 },
  { value: "comoda", label: "Cómoda", factor: 1 },
  { value: "amplia", label: "Amplia", factor: 1.3 },
];

export const HEADER_LAYOUTS = [
  { value: "left", label: "Logo a la izquierda" },
  { value: "center", label: "Logo centrado" },
];

export const ANNOUNCEMENT_TONES = [
  { value: "accent", label: "Acento" },
  { value: "dark", label: "Oscuro" },
  { value: "success", label: "Verde" },
];

const find = (list, value) => list.find((x) => x.value === value) || list[0];

export const paletteOf = (theme) => find(PALETTES, theme?.palette?.preset);
export const typeOf = (theme) => find(TYPE_PRESETS, theme?.typography?.preset);
export const radiusOf = (theme) => find(RADII, theme?.shape?.radius);
export const densityOf = (theme) => find(DENSITIES, theme?.shape?.density);

/**
 * Traduce la config a variables CSS. Se aplican **sólo dentro del preview**
 * (`.st-store`), así el panel conserva su propia identidad y lo que se ve
 * cambiando es la tienda.
 */
export const themeToCssVars = (theme) => {
  const palette = paletteOf(theme);
  const type = typeOf(theme);
  const radius = radiusOf(theme);
  const density = densityOf(theme);

  return {
    "--accent": palette.accent,
    "--accent-hover": palette.hover,
    "--accent-text": palette.accent,
    "--accent-subtle-bg": palette.subtle,
    "--accent-subtle-border": palette.border,
    "--radius-md": radius.card,
    "--radius-lg": radius.card,
    "--radius-sm": radius.control,
    "--st-font-heading": type.heading,
    "--st-font-body": type.body,
    "--st-density": density.factor,
  };
};
