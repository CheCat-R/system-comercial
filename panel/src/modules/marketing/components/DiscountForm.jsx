import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";

import { DISCOUNT_TYPES } from "../lib/discounts";

const CATEGORIES = ["Calzado", "Indumentaria", "Accesorios"];

/**
 * Sub-formulario de un `Discount` — reutilizado en Promoción, Cupón y (Fase 3) Recompensa.
 * `value` = objeto discount, `onChange(nextDiscount)`.
 */
const DiscountForm = ({ value, onChange }) => {
  const d = value || { type: "percent", value: 10 };
  const set = (patch) => onChange({ ...d, ...patch });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Tipo de descuento</Typography>
          <Select
            size="small" value={d.type}
            onChange={(e) => {
              const type = e.target.value;
              set({ type, value: type === "free_shipping" ? undefined : d.value ?? 10, maxAmount: type === "free_shipping" ? undefined : d.maxAmount });
            }}
            sx={{ minWidth: 170 }}
          >
            {Object.entries(DISCOUNT_TYPES).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </Select>
        </Box>

        {d.type !== "free_shipping" && (
          <TextField
            size="small" type="number" label={d.type === "percent" ? "Porcentaje" : "Monto ($)"}
            value={d.value ?? ""} onChange={(e) => set({ value: Number(e.target.value) })}
            sx={{ maxWidth: 140 }}
          />
        )}

        {d.type === "percent" && (
          <TextField
            size="small" type="number" label="Tope ($, opcional)"
            value={d.maxAmount ?? ""} onChange={(e) => set({ maxAmount: e.target.value ? Number(e.target.value) : undefined })}
            sx={{ maxWidth: 160 }}
          />
        )}
      </Box>

      {d.type !== "free_shipping" && (
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Aplica a</Typography>
          <Select
            size="small" multiple displayEmpty
            value={d.scope?.categories || []}
            onChange={(e) => {
              const cats = e.target.value;
              set({ scope: cats.length ? { categories: cats } : undefined });
            }}
            renderValue={(v) => (v.length ? v.join(", ") : "Todo el carrito")}
            sx={{ minWidth: 240 }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                <Checkbox size="small" checked={(d.scope?.categories || []).includes(c)} />
                <ListItemText primary={c} />
              </MenuItem>
            ))}
          </Select>
        </Box>
      )}
    </Box>
  );
};

export default DiscountForm;
