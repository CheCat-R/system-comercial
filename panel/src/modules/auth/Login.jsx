import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import LockIcon from "@mui/icons-material/Lock";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

import InputField from "../../components/Form/InputField/InputField";
import SelectField from "../../components/Form/SelectField/SelectField";
import Button from "../../components/Button/Button";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast/ToastContext";
import { httpClient } from "../../app/api/httpClient";
import { QK } from "../../app/api/queryClient";
import { leerTokenTerminal } from "../../app/api/sesion";

import "./Login.css";

/**
 * Entrar: usuario + contraseña + sucursal. Los tres salen de la API:
 * `/auth/opciones` trae quiénes pueden entrar y qué locales hay. Si este
 * equipo está registrado como terminal, la sucursal ya viene dada y no se
 * pregunta — la cajera deja de elegir mal porque deja de elegir.
 */
const Login = () => {
  const navigate = useNavigate();
  const { login, expiredReason } = useAuth();
  const { showToast } = useToast();

  const [usuarioId, setUsuarioId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const opciones = useQuery({
    queryKey: QK.opciones,
    queryFn: () => httpClient.get("/auth/opciones"),
    staleTime: 60 * 1000,
  });

  const terminal = useQuery({
    queryKey: ["terminal", "actual"],
    queryFn: () => httpClient.post("/terminales/actual", { token: leerTokenTerminal() }),
    enabled: Boolean(leerTokenTerminal()),
    staleTime: 5 * 60 * 1000,
  });
  const equipo = terminal.data?.terminal || null;

  useEffect(() => {
    if (expiredReason) showToast(expiredReason, "warning");
  }, [expiredReason, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!usuarioId) { showToast("Elegí tu usuario.", "warning"); return; }
    setLoading(true);
    try {
      const u = await login({ usuarioId, password, sucursalId: equipo ? undefined : sucursalId });
      showToast(`¡Hola, ${u.nombre}! Operás en ${u.sucursalNombre}.`, "success");
      navigate("/");
    } catch (err) {
      showToast(err?.message || "No se pudo iniciar sesión.", "error");
    } finally {
      setLoading(false);
    }
  };

  const usuarios = opciones.data?.usuarios || [];
  const sucursales = opciones.data?.sucursales || [];

  return (
    <Box className="auth-page-wrapper">
      <Box className="auth-card">
        <Box className="auth-header">
          <Box className="auth-logo-badge">C</Box>
          <Typography variant="h5" className="auth-title">
            Iniciar Sesión
          </Typography>
          <Typography variant="body2" className="auth-subtitle">
            {equipo
              ? `Este equipo es ${equipo.nombre} · ${equipo.sucursal?.nombre}.`
              : "Elegí tu usuario y la sucursal con la que vas a operar."}
          </Typography>
        </Box>

        <form onSubmit={handleSubmit} className="auth-form">
          <SelectField
            label="Usuario"
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            options={usuarios.map((u) => ({ value: u.id, label: u.nombre }))}
            required
            disabled={opciones.isLoading}
            helperText={opciones.isError ? "No se pudo cargar la lista de usuarios: ¿está la API levantada?" : undefined}
            error={opciones.isError}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonOutlineOutlinedIcon fontSize="small" color="action" />
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
            autoComplete="current-password"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          {!equipo && (
            <SelectField
              label="Sucursal"
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              options={sucursales.map((s) => ({ value: s.id, label: s.nombre }))}
              disabled={opciones.isLoading}
              helperText="El superadmin puede dejarla vacía: entra en la central."
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <StorefrontOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}

          <Button type="submit" variant="primary" loading={loading} fullWidth sx={{ mt: 1 }}>
            {loading ? "Ingresando…" : "Ingresar al panel"}
          </Button>
        </form>

        <Box className="auth-footer-links">
          El alta de usuarios es por invitación de un administrador.
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
