import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";

import { getAllTags, getManualSegments } from "../../clientes/api/clientsApi";
import { previewAudience } from "../api/marketingApi";
import { AUDIENCE_FILTERS } from "../lib/audiences";
import { money } from "../lib/time";
import "../Marketing.css";

const SEGMENTS = [
  { key: "campeon", label: "Campeón / VIP" }, { key: "leal", label: "Leal / Frecuente" },
  { key: "activo", label: "Activo" }, { key: "prometedor", label: "Prometedor" },
  { key: "nuevo", label: "Nuevo" }, { key: "lead", label: "Lead" },
  { key: "en_riesgo", label: "En riesgo" }, { key: "durmiente", label: "Durmiente" }, { key: "perdido", label: "Perdido" },
];

const AudienceBuilder = ({ value, onChange }) => {
  const a = value;
  const set = (patch) => onChange({ ...a, ...patch });
  const tags = useMemo(() => getAllTags(), []);
  const manualSegments = useMemo(() => getManualSegments(), []);
  const preview = useMemo(() => previewAudience(a), [a]);

  const addFilter = () => set({ filters: [...(a.filters || []), { field: "days_since_last_order_gt", value: 30 }] });
  const updateFilter = (i, patch) => set({ filters: a.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const removeFilter = (i) => set({ filters: a.filters.filter((_, idx) => idx !== i) });

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 280px" }, gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <TextField size="small" fullWidth label="Nombre de la audiencia" value={a.name || ""} onChange={(e) => set({ name: e.target.value })} />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Base (del CRM)</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Select
              size="small" value={a.base?.type || "all"}
              onChange={(e) => set({ base: { type: e.target.value } })}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="all">Toda la cartera</MenuItem>
              <MenuItem value="segment">Segmento smart</MenuItem>
              <MenuItem value="manualSegment">Segmento manual</MenuItem>
              <MenuItem value="tag">Etiqueta</MenuItem>
            </Select>
            {a.base?.type === "segment" && (
              <Select size="small" value={a.base.value || ""} onChange={(e) => set({ base: { type: "segment", value: e.target.value, label: SEGMENTS.find((s) => s.key === e.target.value)?.label } })} sx={{ minWidth: 180 }} displayEmpty>
                <MenuItem value="" disabled>Elegí un segmento…</MenuItem>
                {SEGMENTS.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
              </Select>
            )}
            {a.base?.type === "manualSegment" && (
              <Select size="small" value={a.base.value || ""} onChange={(e) => set({ base: { type: "manualSegment", value: e.target.value, label: manualSegments.find((s) => s.id === e.target.value)?.name } })} sx={{ minWidth: 180 }} displayEmpty>
                <MenuItem value="" disabled>Elegí un segmento…</MenuItem>
                {manualSegments.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            )}
            {a.base?.type === "tag" && (
              <Select size="small" value={a.base.value || ""} onChange={(e) => set({ base: { type: "tag", value: e.target.value, label: e.target.value } })} sx={{ minWidth: 180 }} displayEmpty>
                <MenuItem value="" disabled>Elegí una etiqueta…</MenuItem>
                {tags.map((t) => <MenuItem key={t.name} value={t.name}>{t.name}</MenuItem>)}
              </Select>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">Los segmentos y etiquetas se gestionan en el CRM.</Typography>
        </Box>

        <Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle2">Filtros de marketing</Typography>
            <IconButton size="small" onClick={addFilter}><AddIcon fontSize="small" /></IconButton>
          </Box>
          {(a.filters || []).length === 0 && <Typography variant="body2" color="text.secondary">Sin filtros extra.</Typography>}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {(a.filters || []).map((f, i) => (
              <Box key={i} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                <Select size="small" value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value })} sx={{ minWidth: 220 }}>
                  {Object.entries(AUDIENCE_FILTERS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                </Select>
                {AUDIENCE_FILTERS[f.field]?.valueType === "number" && (
                  <TextField size="small" type="number" value={f.value ?? ""} onChange={(e) => updateFilter(i, { value: e.target.value })} sx={{ maxWidth: 100 }} />
                )}
                <IconButton size="small" onClick={() => removeFilter(i)}><CloseIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Exclusiones</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <FormControlLabel control={<Checkbox size="small" checked={Boolean(a.exclusions?.unsubscribed)} onChange={(e) => set({ exclusions: { ...a.exclusions, unsubscribed: e.target.checked } })} />} label="Dados de baja de email" />
            <TextField
              size="small" type="number" label="Compró hace menos de (días)"
              value={a.exclusions?.boughtWithinDays ?? ""}
              onChange={(e) => set({ exclusions: { ...a.exclusions, boughtWithinDays: e.target.value ? Number(e.target.value) : undefined } })}
              sx={{ maxWidth: 200 }}
            />
          </Box>
        </Box>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Vista previa · {preview.length} cuenta(s)
        </Typography>
        <Box className="mkt-audience-preview" sx={{ mt: 1 }}>
          {preview.length === 0 && <Box className="mkt-audience-preview__row">Ninguna cuenta cae en esta audiencia.</Box>}
          {preview.map((p) => (
            <Box key={p.id} className="mkt-audience-preview__row">
              <span>{p.name}</span>
              <span className="mono text-tertiary">{money(p.ltv)}</span>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default AudienceBuilder;
