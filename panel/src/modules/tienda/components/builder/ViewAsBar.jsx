/**
 * "Ver la página como…" — fecha, audiencia y dispositivo.
 *
 * Sin esto la visibilidad programada y segmentada es invisible en el editor: se
 * guardaría a ciegas. Con esto, la vista previa muestra exactamente lo que vería
 * ese visitante ese día. Ver docs/MODULO-TIENDA-CMS.md §8.3.
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";

import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import TabletMacOutlinedIcon from "@mui/icons-material/TabletMacOutlined";
import PhoneIphoneOutlinedIcon from "@mui/icons-material/PhoneIphoneOutlined";

const ICONS = {
  desktop: DesktopWindowsOutlinedIcon,
  tablet: TabletMacOutlinedIcon,
  mobile: PhoneIphoneOutlinedIcon,
};

const ViewAsBar = ({ viewAs, audiences = [], onChange, hiddenCount = 0 }) => (
  <Box className="st-viewas">
    <ToggleButtonGroup
      size="small" exclusive value={viewAs.device}
      onChange={(_, v) => v && onChange({ ...viewAs, device: v })}
      aria-label="dispositivo"
    >
      {["desktop", "tablet", "mobile"].map((d) => {
        const Icon = ICONS[d];
        return (
          <ToggleButton key={d} value={d} aria-label={d}>
            <Icon sx={{ fontSize: 16 }} />
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>

    <TextField
      size="small" type="date" label="Ver al" value={viewAs.at}
      slotProps={{ inputLabel: { shrink: true } }}
      onChange={(e) => onChange({ ...viewAs, at: e.target.value })}
      sx={{ width: 158 }}
    />

    <TextField
      select size="small" label="Ver como" value={viewAs.audienceId || ""}
      onChange={(e) => onChange({ ...viewAs, audienceId: e.target.value || null })}
      sx={{ minWidth: 190 }}
    >
      <MenuItem value=""><em>Público general</em></MenuItem>
      {audiences.map((a) => (
        <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
      ))}
    </TextField>

    {hiddenCount > 0 && (
      <Tooltip title="Bloques o secciones que no se ven en este contexto (fecha, audiencia o dispositivo).">
        <span className="st-viewas__hidden">{hiddenCount} oculto(s)</span>
      </Tooltip>
    )}
  </Box>
);

export default ViewAsBar;
