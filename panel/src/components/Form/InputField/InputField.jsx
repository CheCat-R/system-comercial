import TextField from "@mui/material/TextField";
import "./InputField.css";

/**
 * Componente InputField Reutilizable para Formularios
 * @param {string} label - Etiqueta del campo
 * @param {string} value - Valor actual
 * @param {function} onChange - Handler de cambio
 * @param {string} type - Tipo de input ("text" | "email" | "password" | "number", etc.)
 * @param {string} placeholder - Texto placeholder
 * @param {boolean} error - Bandera de error de validación
 * @param {string} helperText - Mensaje de ayuda o error
 * @param {boolean} required - Indica si el campo es obligatorio
 * @param {boolean} fullWidth - Ocupa el 100% del ancho contenedor
 */
const InputField = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error = false,
  helperText,
  required = false,
  fullWidth = true,
  size = "small",
  ...props
}) => {
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      type={type}
      placeholder={placeholder}
      error={error}
      helperText={helperText}
      required={required}
      fullWidth={fullWidth}
      size={size}
      variant="outlined"
      className="form-input-field"
      {...props}
    />
  );
};

export default InputField;
