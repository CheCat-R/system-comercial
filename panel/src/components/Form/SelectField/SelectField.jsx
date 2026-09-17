import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import "./SelectField.css";

/**
 * Componente SelectField Reutilizable para Formularios
 * @param {string} label - Etiqueta del campo
 * @param {string|number} value - Valor seleccionado
 * @param {function} onChange - Handler de cambio
 * @param {Array} options - Array de opciones: [{ label: "Activo", value: "Activo" }, ...] o strings ["Opcion1", ...]
 * @param {boolean} error - Bandera de error
 * @param {string} helperText - Mensaje de error/ayuda
 * @param {boolean} fullWidth - Ocupa el 100% del ancho
 */
const SelectField = ({
  label,
  value,
  onChange,
  options = [],
  error = false,
  helperText,
  fullWidth = true,
  size = "small",
  ...props
}) => {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
      size={size}
      variant="outlined"
      className="form-select-field"
      {...props}
    >
      {options.map((opt) => {
        const optionLabel = typeof opt === "object" ? opt.label : opt;
        const optionValue = typeof opt === "object" ? opt.value : opt;

        return (
          <MenuItem key={optionValue} value={optionValue}>
            {optionLabel}
          </MenuItem>
        );
      })}
    </TextField>
  );
};

export default SelectField;
