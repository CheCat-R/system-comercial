/**
 * ⭐ El inspector, generado desde el schema.
 *
 * Cada parámetro de una acción y cada `scanParam` de un disparador declara su
 * `type`, y acá se resuelve el control una sola vez. Se escribe un archivo y
 * sirve para las ~20 acciones y los 7 disparadores observados — el mismo
 * criterio que hizo manejable el inspector de bloques del Store Builder.
 *
 * > Se hace uno propio en vez de reutilizar el `SchemaField` de Tienda: aquél
 * > resuelve referencias vía `tiendaApi` (colecciones, banners, medios), y
 * > compartirlo metería una dependencia de Automatizaciones a Tienda que no
 * > corresponde. **Se comparte el patrón, no el archivo** (§9.2).
 */
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Box from "@mui/material/Box";

const ParamField = ({ spec, value, onChange }) => {
  const common = {
    size: "small",
    fullWidth: true,
    label: spec.label,
    helperText: spec.hint || undefined,
  };

  switch (spec.type) {
    case "textarea":
      return (
        <TextField
          {...common} multiline rows={spec.rows || 2}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <TextField
          {...common} type="number"
          value={value ?? ""}
          slotProps={{ htmlInput: { min: spec.min, max: spec.max } }}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "money":
      return (
        <TextField
          {...common} type="number"
          value={value ?? ""}
          slotProps={{ input: { startAdornment: <span className="au-param__adorn">$</span> } }}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "select":
      return (
        <TextField
          {...common} select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {(spec.options || []).map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <TextField
          {...common} select
          value={selected}
          slotProps={{
            select: {
              multiple: true,
              renderValue: (vals) =>
                vals
                  .map((v) => (spec.options || []).find((o) => o.value === v)?.label || v)
                  .join(", ") || "Ninguno",
            },
          }}
          onChange={(e) => onChange(typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)}
        >
          {(spec.options || []).map((o) => (
            <MenuItem key={o.value} value={o.value}>
              <Checkbox size="small" checked={selected.includes(o.value)} />
              <ListItemText primary={o.label} />
            </MenuItem>
          ))}
        </TextField>
      );
    }

    case "switch":
      return (
        <Box>
          <FormControlLabel
            control={<Switch size="small" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />}
            label={spec.label}
          />
          {spec.hint && <p className="au-param__hint">{spec.hint}</p>}
        </Box>
      );

    default:
      return (
        <TextField
          {...common}
          value={value ?? ""}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
};

export default ParamField;
