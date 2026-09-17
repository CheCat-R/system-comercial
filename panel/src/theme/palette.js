/* ==========================================================================
   ⭐ El color del panel se declara UNA vez, y se declara en CSS.

   Este archivo tenía dos objetos —`lightTokens` y `darkTokens`— con los mismos
   colores que `variables.css`, y un comentario arriba que decía: *"Debe
   mantenerse alineada con src/assets/styles/variables.css"*. O sea, le pedía a
   una persona que hiciera de compilador.

   No funcionó. Al auditarlo, **cinco de los ocho colores de estado habían
   divergido**: en modo oscuro un `StatusBadge` (que sale del CSS) y un `Alert`
   de MUI (que sale de acá) pintaban verdes, ámbares, rojos y azules distintos.
   Nadie lo había notado porque la divergencia es invisible salvo que pongas los
   dos componentes uno al lado del otro.

   Ahora hay una sola fuente: **el CSS**. Este módulo lo lee del documento con
   `getComputedStyle`, que es exactamente lo que hace el navegador para pintar.
   Si el color cambia en `variables.css`, MUI se entera sin que nadie copie nada.
   ========================================================================== */

/**
 * Los tokens que el tema de MUI necesita, y el nombre de la variable CSS de la
 * que sale cada uno.
 *
 * ⭐ Fijate que `success` sale de `--success-solid` y no de `--success-text`:
 * MUI usa `palette.success.main` para **rellenar** (el `Alert` sólido, el
 * `Chip`), y el token de relleno es el sólido. Confundir los dos roles es
 * justamente lo que produjo una de las divergencias que esto vino a arreglar.
 */
const TOKEN_MAP = {
  canvas: "--bg-canvas",
  surface: "--bg-surface",
  surfaceHover: "--bg-surface-hover",
  sunken: "--bg-sunken",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textTertiary: "--text-tertiary",
  textDisabled: "--text-disabled",
  borderSubtle: "--border-subtle",
  borderDefault: "--border-default",
  borderStrong: "--border-strong",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentText: "--accent-text",
  onAccent: "--text-on-accent",
  success: "--success-solid",
  warning: "--warning-solid",
  danger: "--danger-solid",
  info: "--info-solid",
  divider: "--border-subtle",
  focusRing: "--focus-ring-color",
};

/**
 * Valores de emergencia.
 *
 * No son una segunda fuente: son lo que se usa cuando **no hay documento** —un
 * test en Node, un render en servidor— y sólo para que el tema se pueda
 * construir en vez de romperse. En el navegador nunca se leen; `assertPalette()`
 * avisa si alguno terminó usándose.
 */
const FALLBACK = {
  canvas: "#f6f8fb", surface: "#ffffff", surfaceHover: "#f8fafc", sunken: "#f1f5f9",
  textPrimary: "#0f172a", textSecondary: "#475569", textTertiary: "#64748b", textDisabled: "#94a3b8",
  borderSubtle: "#e9edf2", borderDefault: "#dbe1e8", borderStrong: "#c3cbd6",
  accent: "#4f46e5", accentHover: "#4338ca", accentText: "#4f46e5", onAccent: "#ffffff",
  success: "#059669", warning: "#f59e0b", danger: "#dc2626", info: "#2563eb",
  divider: "#e9edf2", focusRing: "rgba(79, 70, 229, 0.28)",
};

/** Qué tokens no pudo leer del documento la última vez. Lo consulta `assertPalette`. */
let _missing = [];

/**
 * Lee los tokens **del documento**, en el tema que esté puesto en ese momento.
 *
 * ⭐ Depende de que `data-theme` ya esté en el `<html>` cuando esto corre. Por
 * eso `ThemeContext` lo escribe de forma **síncrona al importarse**, no en un
 * efecto: un efecto corre después del primer render, y el tema oscuro habría
 * arrancado con los colores claros durante un cuadro.
 */
export const getTokens = () => {
  if (typeof window === "undefined" || !document?.documentElement) return { ...FALLBACK };

  const style = getComputedStyle(document.documentElement);
  const out = {};
  const missing = [];

  Object.entries(TOKEN_MAP).forEach(([key, cssVar]) => {
    const value = style.getPropertyValue(cssVar).trim();
    if (value) {
      out[key] = value;
    } else {
      out[key] = FALLBACK[key];
      missing.push(`${key} ← ${cssVar}`);
    }
  });

  _missing = missing;
  return out;
};

/**
 * Se llama al construir el tema, en desarrollo. Mismo criterio que
 * `assertPermissions()`, `assertEventContracts()` y los demás contratos del
 * panel: **un token que no existe se dice en voz alta**, no se tapa con un
 * valor de emergencia en silencio.
 */
export const assertPalette = () => _missing;
