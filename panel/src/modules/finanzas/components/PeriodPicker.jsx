import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import { monthLabel } from "../lib/time";

/**
 * Selector de período de Finanzas. En la Fase 2 lista los meses con actividad + "Todos".
 * El valor "" = todos los períodos. Se persiste en la query string desde la pantalla.
 */
const PeriodPicker = ({ value, onChange, months = [] }) => (
  <Select
    size="small"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    displayEmpty
    sx={{ minWidth: 190 }}
    renderValue={(v) => monthLabel(v)}
  >
    <MenuItem value="">Todos los períodos</MenuItem>
    {months.map((m) => (
      <MenuItem key={m} value={m}>{monthLabel(m)}</MenuItem>
    ))}
  </Select>
);

export default PeriodPicker;
