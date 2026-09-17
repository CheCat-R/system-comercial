/**
 * ⭐ El feedback del panel: 373 llamadas a `showToast` desde 76 archivos.
 *
 * Y hasta la Fase C, **un solo slot**: `useState({ open, message, severity })`.
 * El segundo aviso pisaba al primero, y hay flujos que producen dos seguidos —
 * confirmar un pago que además deja backorder— así que uno se perdía. También
 * para quien lo escucha con un lector de pantalla.
 *
 * Ahora es una cola:
 *
 *   · hasta 3 visibles, apilados, el más nuevo abajo
 *   · cada uno con su propio reloj (los de error duran más: hay que leerlos)
 *   · ⭐ **acción opcional**, que es lo que vuelve reversible una operación
 *     destructiva sin inventar un diálogo de confirmación más
 *
 *   showToast("Gasto eliminado", "info", {
 *     action: { label: "Deshacer", onClick: () => restaurar(gasto) },
 *   });
 *
 * ── ⭐ Por qué "Deshacer" y no "¿Estás seguro?" ────────────────────────
 *
 * Un diálogo de confirmación interrumpe **siempre**, incluidas las 99 veces que
 * la persona sí quería hacerlo. Deshacer no interrumpe nunca y arregla la vez
 * que no. Donde el panel ya tiene un gate de verdad —motivo obligatorio, firma
 * de otra persona— no hace falta ninguno de los dos: ese control ya ocurrió.
 */
import { createContext, useContext, useState, useCallback, useRef } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

import "./Toast.css";

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe ser usado dentro de un ToastProvider");
  }
  return context;
};

/** Un error se lee; un "guardado" se mira de reojo. No duran lo mismo. */
const DURATION = { error: 8000, warning: 6000, success: 4000, info: 4500 };
const MAX_VISIBLE = 3;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /**
   * @param {string} message
   * @param {"success"|"info"|"warning"|"error"} severity
   * @param {object} options  `{ action: { label, onClick } }`
   */
  const showToast = useCallback((message, severity = "info", options = {}) => {
    const id = ++seq.current;
    const { action = null } = options;

    setToasts((list) => {
      // El más viejo se va cuando entra el cuarto: apilar seis avisos es la otra
      // forma de que no se lea ninguno.
      const next = [...list, { id, message, severity, action }];
      return next.slice(-MAX_VISIBLE);
    });

    const ms = DURATION[severity] ?? DURATION.info;
    // Con acción se da más tiempo: deshacer algo en cuatro segundos es una
    // promesa que no se puede cumplir.
    setTimeout(() => dismiss(id), action ? Math.max(ms, 8000) : ms);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}

      {/* `aria-live="polite"` una vez, en el contenedor: si estuviera en cada
          aviso, el lector anunciaría la región entera cada vez que la lista
          cambia. */}
      <Box className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <Alert
            key={t.id}
            severity={t.severity}
            variant="filled"
            className="toast-item"
            onClose={() => dismiss(t.id)}
            action={t.action ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Button
                  size="small"
                  color="inherit"
                  className="toast-action"
                  onClick={() => { t.action.onClick(); dismiss(t.id); }}
                >
                  {t.action.label}
                </Button>
              </Box>
            ) : undefined}
          >
            {t.message}
          </Alert>
        ))}
      </Box>
    </ToastContext.Provider>
  );
};
