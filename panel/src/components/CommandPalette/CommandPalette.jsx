/**
 * ⭐ La búsqueda global del panel (⌘K / Ctrl K).
 *
 * Antes esto era un diálogo con un campo de texto **sin estado** —escribir no
 * hacía nada— y tres enlaces fijos, uno rotulado *"(Próximamente)"*. Un ⌘K
 * decorativo es peor que no tenerlo: es la interacción firma de un SaaS, y verla
 * vacía anuncia que el resto también lo está.
 *
 * Ahora busca de verdad sobre lo que el panel ya tenía: los 83 destinos del menú
 * (`app/navigation.jsx`) y las entidades de Pedidos, Clientes y Productos por sus
 * `api/`. Ver `searchSources.js`.
 *
 * ── Teclado ────────────────────────────────────────────────────────────
 *   ↑ ↓     recorrer      Enter   abrir      Esc   cerrar
 *
 * La lista es **plana para el teclado** aunque se vea agrupada: tener que saltar
 * de grupo en grupo con Tab convierte un atajo en un trámite.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Dialog from "@mui/material/Dialog";
import InputBase from "@mui/material/InputBase";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import SearchIcon from "@mui/icons-material/Search";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";

import { useUI } from "../../context/UIContext";
import { search, suggestions } from "./searchSources";
import "./CommandPalette.css";

const KIND_ICON = {
  pedido: <ReceiptLongOutlinedIcon fontSize="small" />,
  cliente: <PersonOutlineIcon fontSize="small" />,
  producto: <Inventory2OutlinedIcon fontSize="small" />,
};

const CommandPalette = () => {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen } = useUI();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef(null);

  const groups = useMemo(
    () => (query.trim() ? search(query) : [{ kind: "destino", label: "Sugerencias", items: suggestions() }]),
    [query]
  );

  // La lista plana es la que manda para el teclado; los grupos son presentación.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Al abrir o al cambiar la consulta se vuelve al primero: dejar el cursor en
  // la posición 7 de una lista que ya no existe es cómo se selecciona sin querer.
  const [lastOpen, setLastOpen] = useState(isCommandPaletteOpen);
  if (isCommandPaletteOpen !== lastOpen) {
    setLastOpen(isCommandPaletteOpen);
    if (isCommandPaletteOpen) { setQuery(""); setCursor(0); }
  }
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) { setLastQuery(query); setCursor(0); }

  const close = () => setIsCommandPaletteOpen(false);

  const go = (item) => {
    if (!item) return;
    navigate(item.to);
    close();
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[cursor]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  let index = -1;

  return (
    <Dialog
      open={isCommandPaletteOpen}
      onClose={close}
      fullWidth
      maxWidth="sm"
      className="command-palette-dialog"
      slotProps={{
        paper: { className: "command-palette-paper" },
        backdrop: { style: { backgroundColor: "var(--bg-overlay)", backdropFilter: "blur(3px)" } },
      }}
    >
      <Box className="command-palette-search">
        <SearchIcon className="command-palette-icon" />
        <InputBase
          autoFocus
          fullWidth
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Buscá un pedido, un cliente, un producto o una pantalla…"
          className="command-palette-input"
          inputProps={{ "aria-label": "Buscar en el panel", role: "combobox", "aria-expanded": true }}
        />
        <span className="cp-esc">esc</span>
      </Box>

      <Box className="command-palette-results" ref={listRef} role="listbox">
        {flat.length === 0 ? (
          <Box className="cp-empty">
            <Typography variant="body2" className="cp-empty__title">
              Nada coincide con «{query.trim()}»
            </Typography>
            <Typography variant="body2" className="cp-empty__desc">
              Se busca en las pantallas del panel y en pedidos, clientes y productos. Probá con el
              número de pedido, el nombre del cliente o el SKU.
            </Typography>
          </Box>
        ) : groups.map((group) => (
          <Box className="cp-group" key={group.kind + group.label}>
            <Typography variant="overline" className="command-palette-section-title">
              {group.label}
            </Typography>

            {group.items.map((item) => {
              index += 1;
              const i = index;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === cursor}
                  tabIndex={-1}
                  className={`cp-item ${i === cursor ? "is-active" : ""}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(item)}
                >
                  <span className="cp-item__icon">
                    {KIND_ICON[item.kind] || item.icon || <ArrowForwardIcon fontSize="small" />}
                  </span>
                  <span className="cp-item__body">
                    <strong>{item.title}</strong>
                    {item.subtitle && <em>{item.subtitle}</em>}
                  </span>
                  {i === cursor && <span className="cp-item__enter">↵</span>}
                </div>
              );
            })}
          </Box>
        ))}
      </Box>

      <Box className="cp-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> recorrer</span>
        <span><kbd>↵</kbd> abrir</span>
        <span><kbd>esc</kbd> cerrar</span>
      </Box>
    </Dialog>
  );
};

export default CommandPalette;
