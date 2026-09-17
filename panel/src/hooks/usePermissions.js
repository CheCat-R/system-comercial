import { useState } from "react";

// Mapa declarativo de permisos por Rol de la empresa CheCAT Developers
const rolePermissions = {
  Administradora: [
    "view_dashboard",
    "view_usuarios",
    "create_usuario",
    "delete_usuario",
    "view_proyectos",
    "create_proyecto",
    "delete_proyecto",
    "view_configuracion",
  ],
  "Analista Frontend": [
    "view_dashboard",
    "view_usuarios",
    "view_proyectos",
    "create_proyecto",
  ],
  Viewer: [
    "view_dashboard",
    "view_proyectos",
  ],
};

/**
 * Hook para validar permisos y roles en cualquier componente o botón del sistema
 */
export const usePermissions = () => {
  // Simulación del usuario autenticado actual (por defecto Administradora)
  const [userRole, setUserRole] = useState("Administradora");

  const can = (permission) => {
    const permissions = rolePermissions[userRole] || [];
    return permissions.includes(permission);
  };

  const hasRole = (...roles) => {
    return roles.includes(userRole);
  };

  return {
    userRole,
    setUserRole,
    can,
    hasRole,
  };
};

export default usePermissions;
