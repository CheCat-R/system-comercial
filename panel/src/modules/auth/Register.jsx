import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

import InputField from "../../components/Form/InputField/InputField";
import Button from "../../components/Button/Button";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast/ToastContext";

import "./Login.css";

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await register(name, email, password);
      showToast("¡Cuenta registrada exitosamente!", "success");
      navigate("/");
    } catch (err) {
      showToast(err.message || "Error al registrar la cuenta", "error");
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
            Crear Cuenta
          </Typography>
          <Typography variant="body2" className="auth-subtitle">
            Regístrate para comenzar a utilizar CheCAT Panel.
          </Typography>
        </Box>

        <form onSubmit={handleSubmit} className="auth-form">
          <InputField
            label="Nombre Completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej. María López"
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <InputField
            label="Correo Electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ej. maria@checat.dev"
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

          <Button type="submit" variant="primary" loading={loading} fullWidth sx={{ mt: 1 }}>
            {loading ? "Creando cuenta…" : "Registrarme"}
          </Button>
        </form>

        <Box className="auth-footer-links">
          ¿Ya tienes una cuenta?{" "}
          <Link to="/login" className="auth-link">
            Inicia sesión aquí
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Register;
