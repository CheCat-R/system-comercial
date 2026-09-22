/**
 * Palette definitions kept in sync with src/styles/tokens.css.
 *
 * The CSS custom properties drive pure-CSS modules; these JS objects drive the
 * MUI theme. Keeping both in one mental model (same names/values) is what makes
 * MUI components and custom CSS look like one product.
 *
 * Identidad: ÍNDIGO como único acento (siempre con blanco encima sobre
 * superficie sólida) — "premium sobrio", sin gradientes, sin glow. `secondary`
 * es una variación tonal del mismo índigo (500 en vez de 600), no un color de
 * marca aparte: existe porque MUI necesita un segundo slot para el indicador
 * de tabs, pero se queda en la misma familia.
 */

export const lightPalette = {
  mode: 'light',
  primary: { main: '#4f46e5', dark: '#4338ca', light: '#818cf8', contrastText: '#ffffff' },
  secondary: { main: '#6366f1', dark: '#4f46e5', contrastText: '#ffffff' },
  success: { main: '#059669' },
  warning: { main: '#b45309' },
  error: { main: '#dc2626' },
  info: { main: '#2563eb' },
  background: { default: '#f6f8fb', paper: '#ffffff' },
  text: { primary: '#0f172a', secondary: '#475569' },
  divider: '#e9edf2',
};

export const darkPalette = {
  mode: 'dark',
  primary: { main: '#6366f1', dark: '#4f46e5', light: '#818cf8', contrastText: '#ffffff' },
  secondary: { main: '#818cf8', dark: '#6366f1', contrastText: '#06070f' },
  success: { main: '#10b981' },
  warning: { main: '#f59e0b' },
  error: { main: '#ef4444' },
  info: { main: '#3b82f6' },
  background: { default: '#0a0e17', paper: '#121826' },
  text: { primary: '#eef2f8', secondary: '#9aa7b8' },
  divider: 'rgba(255, 255, 255, 0.11)',
};
