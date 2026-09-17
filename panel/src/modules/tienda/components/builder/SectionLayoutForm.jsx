/**
 * Inspector de una Sección: nombre + los tokens de layout.
 *
 * Es el **único** lugar donde se decide el aspecto (§5). El set es cerrado a
 * propósito: no hay campo de color, ni de padding libre, ni de z-index.
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import { WIDTHS, BACKGROUNDS, SPACINGS, COLUMN_RATIOS, DEFAULT_LAYOUT } from "../../lib/layout";

const Field = ({ label, hint, children }) => (
  <Box>
    <Typography variant="caption" className="st-field__label">{label}</Typography>
    {hint && <Typography variant="caption" className="st-field__hint">{hint}</Typography>}
    {children}
  </Box>
);

const SectionLayoutForm = ({ section, onChangeName, onChangeLayout }) => {
  const l = { ...DEFAULT_LAYOUT, ...(section.layout || {}) };
  const set = (patch) => onChangeLayout({ ...l, ...patch });

  return (
    <Box className="st-inspector__group">
      <TextField
        size="small" fullWidth label="Nombre de la sección" value={section.name || ""}
        helperText="Sólo se ve en el editor, para orientarte en el árbol."
        onChange={(e) => onChangeName(e.target.value)}
      />

      <Field label="Ancho">
        <ToggleButtonGroup size="small" exclusive fullWidth value={l.width} onChange={(_, v) => v && set({ width: v })}>
          {WIDTHS.map((w) => <ToggleButton key={w.value} value={w.value}>{w.label}</ToggleButton>)}
        </ToggleButtonGroup>
      </Field>

      <TextField select size="small" fullWidth label="Fondo" value={l.background} onChange={(e) => set({ background: e.target.value })}>
        {BACKGROUNDS.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
      </TextField>

      <TextField select size="small" fullWidth label="Espaciado vertical" value={l.spacing} onChange={(e) => set({ spacing: e.target.value })}>
        {SPACINGS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
      </TextField>

      <Field label="Columnas" hint="Los bloques de la sección se reparten en esta grilla.">
        <ToggleButtonGroup size="small" exclusive fullWidth value={l.columns} onChange={(_, v) => v && set({ columns: v })}>
          {[1, 2, 3, 4].map((n) => <ToggleButton key={n} value={n}>{n}</ToggleButton>)}
        </ToggleButtonGroup>
      </Field>

      {l.columns === 2 && (
        <TextField select size="small" fullWidth label="Proporción" value={l.columnRatio} onChange={(e) => set({ columnRatio: e.target.value })}>
          {COLUMN_RATIOS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
      )}

      <TextField
        size="small" fullWidth label="Ancla" value={l.anchor || ""}
        helperText="Para enlazar a esta sección desde un menú o un botón."
        onChange={(e) => set({ anchor: e.target.value })}
      />
    </Box>
  );
};

export default SectionLayoutForm;
