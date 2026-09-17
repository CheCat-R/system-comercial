/**
 * ⭐ El selector de disparador, condición o acción.
 *
 * La decisión de diseño que importa: **lo que no aplica se muestra
 * deshabilitado con el motivo, nunca escondido** (§9.2). Ver «no aplica: el
 * sujeto de esta regla es un envío, no una cuenta» enseña el modelo; que la
 * opción desaparezca deja al usuario preguntándose si existe.
 *
 * Es el mismo criterio que las dimensiones del Explorador de Analytics y el
 * catálogo cerrado de bloques del Store Builder.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import {
  listEvents, EVENT_MODULES, subjectLabel,
  listConditions, listActions, ACTION_TIERS,
} from "../api/automationsApi";

const MODE_META = {
  trigger: {
    title: "¿Cuándo se dispara?",
    subtitle: "Elegir el disparador fija el tipo de sujeto de la regla, y con él qué condiciones y acciones se pueden usar.",
  },
  condition: {
    title: "Agregar una condición",
    subtitle: "Se evalúan en el momento de ejecutar, no cuando ocurrió el evento.",
  },
  action: {
    title: "Agregar una acción",
    subtitle: "Cada acción llama a una función que ya existe en el módulo dueño. Las sensibles no se ejecutan solas.",
  },
};

const StepPicker = ({ mode, subjectType, onPick, onClose }) => {
  const [search, setSearch] = useState("");

  const items = useMemo(() => {
    if (mode === "trigger") {
      return listEvents().map((e) => ({
        key: e.key,
        label: e.label,
        group: EVENT_MODULES.find((m) => m.key === e.module)?.label || e.module,
        meta: e,
        rejection: null,
      }));
    }
    if (mode === "condition") {
      return listConditions(subjectType).map((c) => ({
        key: c.key, label: c.label, group: c.group, meta: c, rejection: c.rejection,
      }));
    }
    return listActions(subjectType).map((a) => ({
      key: a.key, label: a.label, group: a.group, meta: a, rejection: a.rejection,
    }));
  }, [mode, subjectType]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.key.toLowerCase().includes(q));
  }, [items, search]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((i) => {
      if (!map.has(i.group)) map.set(i.group, []);
      map.get(i.group).push(i);
    });
    return [...map.entries()];
  }, [filtered]);

  const meta = MODE_META[mode];
  const blocked = filtered.filter((i) => i.rejection).length;

  return (
    <Modal
      open onClose={onClose} maxWidth="sm"
      title={meta.title}
      subtitle={meta.subtitle}
      actions={<Button variant="ghost" onClick={onClose}>Cancelar</Button>}
    >
      <Box className="au-picker">
        <TextField
          size="small" fullWidth autoFocus placeholder="Buscar…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />

        {blocked > 0 && (
          <p className="au-picker__note">
            {blocked} opción(es) en gris no aplican al sujeto de esta regla
            {subjectType && <> (<strong>{subjectLabel(subjectType)}</strong>)</>}. Pasá el mouse para ver por qué.
          </p>
        )}

        {groups.length === 0 && <p className="au-picker__note">Nada coincide con esa búsqueda.</p>}

        {groups.map(([group, list]) => (
          <Box className="au-picker__group" key={group}>
            <span className="au-picker__grouplabel">{group}</span>
            {list.map((item) => {
              const row = (
                <button
                  type="button"
                  key={item.key}
                  className={`au-picker__item ${item.rejection ? "is-off" : ""}`.trim()}
                  disabled={Boolean(item.rejection)}
                  onClick={() => { onPick(item.key); onClose(); }}
                >
                  <span className="au-picker__label">
                    <strong>{item.label}</strong>
                    {mode === "trigger" && (
                      <em>{item.meta.emittedAt}</em>
                    )}
                    {mode !== "trigger" && <em>{item.meta.source || item.meta.calls}</em>}
                  </span>

                  <span className="au-picker__badges">
                    {mode === "trigger" && (
                      <>
                        <StatusBadge
                          tone={item.meta.kind === "state" ? "warning" : "info"}
                          label={item.meta.kind === "state" ? "observado" : "emitido"}
                          showDot={false}
                        />
                        <span className="au-chip">{subjectLabel(item.meta.subjectType)}</span>
                      </>
                    )}
                    {mode === "action" && ACTION_TIERS[item.meta.tier] && (
                      <span className={`au-chip au-chip--${item.meta.tier}`}>
                        {item.meta.tier === "sensitive" && <LockOutlinedIcon sx={{ fontSize: 11 }} />}
                        {ACTION_TIERS[item.meta.tier].label}
                      </span>
                    )}
                    {item.rejection && <em className="au-picker__off">no aplica</em>}
                  </span>
                </button>
              );

              return item.rejection
                ? <Tooltip title={item.rejection} placement="left" key={item.key}><span>{row}</span></Tooltip>
                : row;
            })}
          </Box>
        ))}
      </Box>
    </Modal>
  );
};

export default StepPicker;
