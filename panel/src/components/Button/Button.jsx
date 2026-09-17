import MuiButton from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import "./Button.css";

/**
 * Botón único del sistema. Envuelve MUI Button y normaliza las variantes.
 *
 * @param {"primary"|"secondary"|"ghost"|"danger"|"danger-solid"} variant
 * @param {boolean} loading  - muestra spinner y deshabilita
 */
const VARIANT_MAP = {
  primary: { muiVariant: "contained", color: "primary" },
  secondary: { muiVariant: "outlined", color: "inherit" },
  ghost: { muiVariant: "text", color: "inherit" },
  danger: { muiVariant: "outlined", color: "error" },
  "danger-solid": { muiVariant: "contained", color: "error" },
};

const Button = ({
  variant = "primary",
  loading = false,
  disabled = false,
  startIcon,
  children,
  className = "",
  ...props
}) => {
  const { muiVariant, color } = VARIANT_MAP[variant] || VARIANT_MAP.primary;

  return (
    <MuiButton
      variant={muiVariant}
      color={color}
      disabled={disabled || loading}
      startIcon={loading ? null : startIcon}
      className={`app-btn app-btn--${variant} ${className}`.trim()}
      {...props}
    >
      {loading && <CircularProgress size={15} thickness={5} className="app-btn__spinner" />}
      {children}
    </MuiButton>
  );
};

export default Button;
