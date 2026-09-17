import { Outlet } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import usePermissions from "../../hooks/usePermissions";

/**
 * Componente Guarda de Ruta para proteger páginas según los permisos del usuario
 * @param {string} permission - Permiso requerido para acceder (ej. "view_usuarios")
 */
const ProtectedRoute = ({ permission }) => {
  const { can } = usePermissions();

  if (permission && !can(permission)) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h5" fontWeight={700} color="error.main" gutterBottom>
          Acceso Restringido
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No posees los permisos requeridos para consultar este módulo del sistema.
        </Typography>
      </Box>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
