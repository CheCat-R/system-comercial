import { createContext, useContext, useState, useLayoutEffect, useMemo } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material/styles";
import { getTokens, assertPalette } from "./palette";

const ThemeContext = createContext(null);

const STORAGE_KEY_INIT = "checat_theme";

/**
 * ⭐ El tema se escribe en el `<html>` **antes del primer render**, no en un
 * efecto.
 *
 * Un efecto corre después de pintar, así que arrancar en oscuro significaba un
 * cuadro con los colores claros. Y desde que el tema de MUI **lee los tokens del
 * documento** (ver `palette.js`), además significaba construir la paleta de MUI
 * con el tema equivocado. Se resuelve haciéndolo al importar el módulo: en ese
 * momento el `<html>` ya existe y nada se pintó todavía.
 */
if (typeof document !== "undefined") {
  let saved = "dark";
  try { saved = localStorage.getItem(STORAGE_KEY_INIT) || "dark"; } catch { /* almacenamiento bloqueado */ }
  document.documentElement.setAttribute("data-theme", saved);
}

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode debe ser usado dentro de un CustomThemeProvider");
  }
  return context;
};

const STORAGE_KEY = "checat_theme";

export const CustomThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_KEY) || "dark");

  // El atributo ya está puesto desde el import (arriba); esto lo mantiene al día
  // cuando el modo cambia, y **antes** de que se recalcule el tema de MUI.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* almacenamiento bloqueado */ }
  }, [mode]);

  const toggleTheme = () => setMode((prev) => (prev === "dark" ? "light" : "dark"));

  const muiTheme = useMemo(() => {
    // ⭐ `mode` no se le pasa: los tokens salen del documento, que ya tiene el
    // tema puesto. Está en las dependencias igual, porque es lo que obliga a
    // releerlos cuando el tema cambia.
    const t = getTokens();
    const isDark = mode === "dark";

    if (import.meta.env?.DEV) {
      const missing = assertPalette();
      if (missing.length) {
        console.error(
          "[tema] estos tokens no existen en variables.css y cayeron al valor de emergencia:",
          missing
        );
      }
    }

    return createTheme({
      palette: {
        mode,
        primary: { main: t.accent, contrastText: t.onAccent },
        secondary: { main: t.accentText },
        error: { main: t.danger },
        warning: { main: t.warning },
        success: { main: t.success },
        info: { main: t.info },
        background: { default: t.canvas, paper: t.surface },
        text: { primary: t.textPrimary, secondary: t.textSecondary, disabled: t.textDisabled },
        divider: t.divider,
      },

      typography: {
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
        fontSize: 14,
        h1: { fontWeight: 700, letterSpacing: "-0.02em" },
        h2: { fontWeight: 700, letterSpacing: "-0.02em" },
        h3: { fontWeight: 700, letterSpacing: "-0.02em" },
        h4: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.5rem" },
        h5: { fontWeight: 600, letterSpacing: "-0.01em", fontSize: "1.125rem" },
        h6: { fontWeight: 600, fontSize: "1rem" },
        subtitle1: { fontWeight: 600 },
        subtitle2: { fontWeight: 600, fontSize: "0.8125rem" },
        body1: { fontSize: "0.875rem" },
        body2: { fontSize: "0.8125rem" },
        caption: { fontSize: "0.75rem" },
        button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
      },

      shape: { borderRadius: 10 },

      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: { backgroundColor: t.canvas, color: t.textPrimary },
          },
        },

        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: {
              borderRadius: 8,
              boxShadow: "none",
              paddingInline: 16,
              paddingBlock: 7,
              fontWeight: 600,
              "&:hover": { boxShadow: "none" },
              "&.Mui-focusVisible": { boxShadow: `0 0 0 3px ${t.focusRing}` },
            },
            containedPrimary: {
              backgroundColor: t.accent,
              color: t.onAccent,
              "&:hover": { backgroundColor: t.accentHover },
            },
            outlined: {
              borderColor: t.borderDefault,
              color: t.textPrimary,
              "&:hover": { borderColor: t.borderStrong, backgroundColor: t.surfaceHover },
            },
            text: {
              color: t.accentText,
              "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : t.sunken },
            },
          },
        },

        MuiIconButton: {
          styleOverrides: {
            root: {
              color: t.textSecondary,
              borderRadius: 8,
              "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : t.sunken },
              "&.Mui-focusVisible": { boxShadow: `0 0 0 3px ${t.focusRing}` },
            },
          },
        },

        MuiPaper: {
          styleOverrides: {
            root: { backgroundImage: "none" },
            outlined: { borderColor: t.borderSubtle },
          },
        },

        MuiCard: {
          defaultProps: { elevation: 0 },
          styleOverrides: {
            root: {
              backgroundColor: t.surface,
              border: `1px solid ${t.borderSubtle}`,
              borderRadius: 12,
              boxShadow: "none",
              backgroundImage: "none",
            },
          },
        },

        MuiMenu: {
          styleOverrides: {
            paper: {
              border: `1px solid ${t.borderSubtle}`,
              boxShadow: isDark
                ? "0 16px 40px rgba(0,0,0,0.6)"
                : "0 12px 32px rgba(15,23,42,0.12)",
              borderRadius: 12,
            },
          },
        },

        MuiMenuItem: {
          styleOverrides: {
            root: {
              fontSize: "0.8125rem",
              borderRadius: 6,
              marginInline: 4,
              "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : t.sunken },
            },
          },
        },

        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: isDark ? "#2a3446" : "#0f172a",
              fontSize: "0.75rem",
              fontWeight: 500,
              padding: "6px 10px",
              borderRadius: 6,
            },
            arrow: { color: isDark ? "#2a3446" : "#0f172a" },
          },
        },

        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              backgroundColor: t.surface,
              fontSize: "0.875rem",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: t.borderDefault },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: t.borderStrong },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: t.accent,
                borderWidth: 1,
              },
              "&.Mui-focused": { boxShadow: `0 0 0 3px ${t.focusRing}` },
              "& input::placeholder, & textarea::placeholder": {
                color: t.textDisabled,
                opacity: 1,
              },
            },
            input: { padding: "9px 12px" },
          },
        },

        MuiInputLabel: {
          styleOverrides: {
            root: { color: t.textSecondary, "&.Mui-focused": { color: t.accentText } },
          },
        },

        MuiInputAdornment: { styleOverrides: { root: { color: t.textTertiary } } },
        MuiSelect: { styleOverrides: { icon: { color: t.textTertiary } } },

        MuiTableCell: {
          styleOverrides: {
            root: { borderBottomColor: t.borderSubtle, fontSize: "0.8125rem" },
            head: {
              color: t.textTertiary,
              fontWeight: 600,
              fontSize: "0.6875rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              backgroundColor: t.sunken,
            },
          },
        },

        MuiCheckbox: {
          styleOverrides: {
            root: {
              color: t.borderStrong,
              "&.Mui-checked": { color: t.accent },
              "&.Mui-focusVisible": { boxShadow: `0 0 0 3px ${t.focusRing}`, borderRadius: 4 },
            },
          },
        },

        MuiChip: {
          styleOverrides: {
            root: { fontWeight: 600, fontSize: "0.75rem", borderRadius: 6 },
            outlined: { borderColor: t.borderDefault },
          },
        },

        MuiTabs: {
          styleOverrides: {
            root: { minHeight: 40 },
            indicator: { backgroundColor: t.accent, height: 2 },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
              minHeight: 40,
              color: t.textSecondary,
              "&.Mui-selected": { color: t.textPrimary },
            },
          },
        },

        MuiLinearProgress: {
          styleOverrides: {
            root: { backgroundColor: t.sunken, borderRadius: 999, height: 6 },
            bar: { borderRadius: 999 },
          },
        },

        MuiDivider: { styleOverrides: { root: { borderColor: t.borderSubtle } } },

        MuiDrawer: {
          styleOverrides: { paper: { backgroundColor: t.surface, backgroundImage: "none" } },
        },

        MuiAppBar: {
          styleOverrides: { root: { backgroundImage: "none", boxShadow: "none" } },
        },
      },
    });
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
