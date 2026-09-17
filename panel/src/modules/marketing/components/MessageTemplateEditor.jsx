import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import Button from "../../../components/Button/Button";
import { CHANNELS, TEMPLATE_CATEGORY } from "../lib/marketing";
import "../Marketing.css";

const VARIABLES = ["{{nombre}}", "{{cupon}}", "{{producto}}"];

const render = (text) =>
  (text || "")
    .replace(/\{\{nombre\}\}/g, "Ana")
    .replace(/\{\{cupon\}\}/g, "VOLVE20")
    .replace(/\{\{producto\}\}/g, "Zapatillas Running X");

/** Editor de plantilla con variables + preview. `value` = template, `onChange(next)`. */
const MessageTemplateEditor = ({ value, onChange }) => {
  const t = value;
  const set = (patch) => onChange({ ...t, ...patch });
  const insert = (v) => set({ body: `${t.body || ""}${t.body && !t.body.endsWith(" ") ? " " : ""}${v}` });

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 300px" }, gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField size="small" fullWidth label="Nombre de la plantilla" value={t.name || ""} onChange={(e) => set({ name: e.target.value })} />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Select size="small" value={t.channel || "email"} onChange={(e) => set({ channel: e.target.value })} sx={{ minWidth: 130 }}>
            {Object.entries(CHANNELS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </Select>
          <Select size="small" value={t.category || "promocional"} onChange={(e) => set({ category: e.target.value })} sx={{ minWidth: 150 }}>
            {Object.entries(TEMPLATE_CATEGORY).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </Select>
        </Box>
        {t.channel === "email" && (
          <TextField size="small" fullWidth label="Asunto" value={t.subject || ""} onChange={(e) => set({ subject: e.target.value })} />
        )}
        <TextField size="small" fullWidth multiline minRows={4} label="Cuerpo" value={t.body || ""} onChange={(e) => set({ body: e.target.value })} />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>Insertar:</Typography>
          {VARIABLES.map((v) => <Button key={v} variant="ghost" size="small" onClick={() => insert(v)}>{v}</Button>)}
        </Box>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Vista previa</Typography>
        <Box className="mkt-tpl-preview" sx={{ mt: 1 }}>
          {t.channel === "email" && t.subject && <div className="mkt-tpl-preview__subject">{render(t.subject)}</div>}
          <div className="mkt-tpl-preview__body">{render(t.body) || "El cuerpo del mensaje aparecerá acá."}</div>
        </Box>
      </Box>
    </Box>
  );
};

export default MessageTemplateEditor;
