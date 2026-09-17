/**
 * El formulario de configuración, generado del schema del proveedor.
 *
 * Mismo patrón que el inspector del Automation Builder y el del Store Builder:
 * se escribe una vez y sirve para todos los adaptadores, presentes y futuros.
 *
 * ⭐ Los campos `secret` se ven distintos a propósito: llevan el aviso de que
 * **no se guardan** (§2.5). Un campo de contraseña que parece igual a los demás
 * hace pensar que el panel lo custodia, y no lo hace.
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";

import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";

const Field = ({ spec, value, onChange }) => {
  const common = { size: "small", fullWidth: true, label: spec.label || spec.key, helperText: spec.hint };

  switch (spec.type) {
    case "number":
      return (
        <TextField
          {...common} type="number" value={value ?? ""}
          slotProps={{ htmlInput: { min: spec.min, max: spec.max } }}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "select":
      return (
        <TextField {...common} select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {(spec.options || []).map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      );

    case "switch":
      return (
        <Box>
          <FormControlLabel
            control={<Switch size="small" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />}
            label={spec.label || spec.key}
          />
          {spec.hint && <p className="in-field__hint">{spec.hint}</p>}
        </Box>
      );

    case "secret":
      return (
        <Box className="in-secret">
          <TextField
            {...common}
            type="password"
            value={value ?? ""}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
            slotProps={{ input: { startAdornment: <KeyOutlinedIcon sx={{ fontSize: 15, mr: 0.7, color: "var(--warning-text)" }} /> } }}
          />
          <p className="in-secret__warn">
            <strong>No se guarda.</strong> El panel se queda con una referencia y los últimos 4
            caracteres, para que puedas reconocer cuál cargaste. El valor se descarta al guardar.
          </p>
        </Box>
      );

    case "url":
      return <TextField {...common} type="url" value={value ?? ""} placeholder="https://…" onChange={(e) => onChange(e.target.value)} />;

    default:
      return <TextField {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
};

const ConfigForm = ({ schema = [], values = {}, onChange }) => {
  if (!schema.length) {
    return <p className="in-field__hint">Este proveedor no necesita configuración.</p>;
  }

  return (
    <Box className="in-form">
      {schema.map((spec) => (
        <Field
          key={spec.key}
          spec={spec}
          value={values[spec.key] ?? spec.default}
          onChange={(v) => onChange({ ...values, [spec.key]: v })}
        />
      ))}
    </Box>
  );
};

export default ConfigForm;
