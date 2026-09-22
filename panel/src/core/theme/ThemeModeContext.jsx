import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from './createAppTheme.js';
import { appConfig } from '@core/config/app.config.js';

const ThemeModeContext = createContext(null);

const { storageKey } = appConfig.theme;

/**
 * ⭐ El modo inicial, en el mismo orden que cualquier app que se precie de
 * recordar el tema: lo último que la persona eligió acá (localStorage) →
 * si nunca eligió, lo que pide el sistema operativo → si tampoco hay eso,
 * el default de `appConfig`. Sin esto, `mode` arrancaba SIEMPRE en
 * `appConfig.theme.defaultMode` — el toggle cambiaba el tema en pantalla
 * pero no sobrevivía a un F5, así que cada recarga "volvía sola" al default
 * y se sentía como que el tema cambiaba solo.
 */
function modoInicial() {
  try {
    const guardado = localStorage.getItem(storageKey);
    if (guardado === 'light' || guardado === 'dark') return guardado;
  } catch { /* localStorage bloqueado (modo privado): sigue al resto */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return appConfig.theme.defaultMode;
}

/**
 * Owns the active color mode and exposes toggle/set helpers.
 *
 * Responsibilities:
 *   - build the MUI theme for the current mode,
 *   - mirror the mode onto <html data-theme> so pure-CSS modules react too,
 *   - keep a single, app-wide switch that per-tenant branding can hook into.
 */
export function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(modoInicial);

  /*
   * El `<html>` no tiene `data-theme` hasta que esto corre: sin él, `:root`
   * (claro) pinta un cuadro antes de que React pueda decir que el modo es
   * oscuro. `useLayoutEffect` corre ANTES de que el navegador pinte, así que
   * no hay flash — un `useEffect` normal sí lo dejaría pasar.
   */
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyDomTheme = useCallback((next) => {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(storageKey, next); } catch { /* modo privado: no persiste, no rompe */ }
  }, []);

  const setThemeMode = useCallback(
    (next) => {
      setMode(next);
      applyDomTheme(next);
    },
    [applyDomTheme],
  );

  const toggleThemeMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      applyDomTheme(next);
      return next;
    });
  }, [applyDomTheme]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo(
    () => ({ mode, setThemeMode, toggleThemeMode }),
    [mode, setThemeMode, toggleThemeMode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within <ThemeModeProvider>');
  }
  return ctx;
}
