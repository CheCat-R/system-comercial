/**
 * Editor del objeto `visibility`, compartido por Sección y Bloque (y, con otra
 * cara, por Banner). Ver docs/MODULO-TIENDA-CMS.md §8.3.
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import { VISIBILITY_MODES, DEVICES, DEFAULT_VISIBILITY } from "../../lib/visibility";
import { toInputValue } from "../../lib/time";

const VisibilityForm = ({ visibility, audiences = [], onChange }) => {
  const v = { ...DEFAULT_VISIBILITY, ...(visibility || {}) };
  const set = (patch) => onChange({ ...v, ...patch });

  const devices = v.devices || DEVICES.map((d) => d.value);

  return (
    <Box className="st-inspector__group">
      <TextField
        select size="small" fullWidth label="Visibilidad" value={v.mode}
        onChange={(e) => set({ mode: e.target.value })}
      >
        {VISIBILITY_MODES.map((m) => (
          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
        ))}
      </TextField>

      {v.mode === "audience" && (
        <TextField
          select size="small" fullWidth label="Audiencia" value={v.audienceId || ""}
          helperText="Las audiencias se arman en Marketing, sobre los segmentos del CRM."
          onChange={(e) => set({ audienceId: e.target.value || null })}
        >
          <MenuItem value=""><em>Elegir audiencia…</em></MenuItem>
          {audiences.map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
          ))}
        </TextField>
      )}

      {(v.mode === "scheduled" || v.mode === "audience") && (
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <TextField
            size="small" fullWidth type="datetime-local" label="Desde"
            slotProps={{ inputLabel: { shrink: true } }}
            value={toInputValue(v.startsAt)}
            onChange={(e) => set({ startsAt: e.target.value ? `${e.target.value}:00` : null })}
          />
          <TextField
            size="small" fullWidth type="datetime-local" label="Hasta"
            slotProps={{ inputLabel: { shrink: true } }}
            value={toInputValue(v.endsAt)}
            onChange={(e) => set({ endsAt: e.target.value ? `${e.target.value}:00` : null })}
          />
        </Box>
      )}

      {v.mode !== "hidden" && (
        <Box>
          <Typography variant="caption" className="st-field__label">Dispositivos</Typography>
          <ToggleButtonGroup
            size="small" fullWidth value={devices}
            onChange={(_, next) => set({ devices: next.length ? next : undefined })}
          >
            {DEVICES.map((d) => (
              <ToggleButton key={d.value} value={d.value}>{d.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
    </Box>
  );
};

export default VisibilityForm;
