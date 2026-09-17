/**
 * Período + comparación, común a toda la pantalla.
 *
 * La comparación **interanual no está** a propósito: no hay dos años de datos y
 * un selector que siempre devuelve "sin datos" es peor que no tenerlo (§4).
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import { PERIODS, COMPARISONS } from "../api/analyticsApi";

const PeriodPicker = ({ value, onChange, sources, partial }) => {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <Box className="an-periodbar">
      <TextField
        select size="small" label="Período" value={value.period}
        onChange={(e) => set({ period: e.target.value })}
        sx={{ minWidth: 170 }}
      >
        {PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
      </TextField>

      {value.period === "custom" && (
        <>
          <TextField
            size="small" type="date" label="Desde" value={value.range?.from || ""}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => set({ range: { ...value.range, from: e.target.value } })}
          />
          <TextField
            size="small" type="date" label="Hasta" value={value.range?.to || ""}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => set({ range: { ...value.range, to: e.target.value } })}
          />
        </>
      )}

      <TextField
        select size="small" label="Comparar contra" value={value.compare}
        onChange={(e) => set({ compare: e.target.value })}
        sx={{ minWidth: 220 }}
      >
        {COMPARISONS.map((c) => (
          <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
        ))}
      </TextField>

      <Box sx={{ flex: 1 }} />

      {partial && (
        <Tooltip title="El período llega hasta hoy y hoy todavía no terminó. La comparación se hace contra el mismo tramo del período anterior, no contra el período completo.">
          <span className="an-chip an-chip--warn">Período parcial</span>
        </Tooltip>
      )}

      {sources && (
        <Tooltip title={sources.text}>
          <span className={`an-chip ${sources.mixed ? "an-chip--mixed" : ""}`.trim()}>
            {sources.mixed ? "Historia + datos vivos" : sources.hasHistory ? "Historia generada" : "Datos vivos"}
          </span>
        </Tooltip>
      )}
    </Box>
  );
};

export default PeriodPicker;
