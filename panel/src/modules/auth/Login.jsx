import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

import InputField from "../../components/Form/InputField/InputField";
import Button from "../../components/Button/Button";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast/ToastContext";

import "./Login.css";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();

  // ⭐ Venían precargados con `admin@checat.dev` / `admin123`: una credencial
  // de administrador escrita en el código y ya tipeada en el formulario. Era el
  // tercer agujero del mismo flujo, junto al usuario por defecto del contexto y
  // al registro público que creaba administradores. (Y `admin123` ni siquiera
  // cumple la política de contraseñas del panel.)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      showToast("¡Bienvenido al Panel de CheCAT!", "success");
      navigate("/");
    } catch (err) {
      showToast(err.message || "Error al iniciar sesión", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="auth-page-wrapper">
      <Box className="auth-card">
        <Box className="auth-header">
          <Box className="auth-logo-badge">C</Box>
          <Typography variant="h5" className="auth-title">
            Iniciar Sesión
          </Typography>
          <Typography variant="body2" className="auth-subtitle">
            Ingresa tus credenciales para acceder a CheCAT Panel.
          </Typography>
        </Box>

        <form onSubmit={handleSubmit} className="auth-form">
          <InputField
            label="Correo Electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ej. usuario@checat.dev"
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <InputField
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <p className="auth-note">
            <strong>Sin backend no hay verificación de credenciales.</strong> Este panel valida el
            padrón, el estado de la cuenta y la <em>política de contraseña</em> — no la contraseña.
            Lo que sí es real: el error no dice si el email existe, y a los {5} intentos fallidos la
            cuenta se bloquea.
          </p>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            fullWidth
            sx={{ mt: 1 }}
          >
            {loading ? "Ingresando…" : "Ingresar al panel"}
          </Button>
        </form>

        <Box className="auth-footer-links">
          ¿No tienes una cuenta?{" "}
          <Link to="/register" className="auth-link">
            Regístrate aquí
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
