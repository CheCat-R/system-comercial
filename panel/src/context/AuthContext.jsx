import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

import {
  authenticate, logout as endSession, getCurrentUser, getSession, getSessionStatus,
  touchSession, reauthenticate, check as checkPermission, can as canPermission,
  describeRemaining,
} from "../modules/seguridad/api/securityApi";

/**
 * La sesión del panel.
 *
 * ⭐ **Ya no hay usuario por defecto.** Antes este contexto inventaba una
 * `CheCAT Admin` cuando `localStorage` estaba vacío, así que la pantalla de
 * login no se veía nunca y el panel arrancaba con permisos máximos sin que nadie
 * se autenticara. Ahora la identidad sale del padrón
 * (`seguridad/data/users.mock.js`) y la sesión, de `securityApi`.
 *
 * El contexto no decide permisos: los pregunta. Quien decide es el catálogo
 * (`seguridad/lib/permissions.js`), en un solo lugar.
 */

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getCurrentUser());
  const [session, setSession] = useState(() => getSession());
  const [expiredReason, setExpiredReason] = useState(null);

  const refresh = useCallback(() => {
    setUser(getCurrentUser());
    setSession(getSession());
  }, []);

  const login = useCallback(async (email, password) => {
    const result = authenticate(email, password);
    // Login.jsx espera una excepción: se conserva el contrato de la pantalla.
    if (!result.ok) throw new Error(result.error);
    setExpiredReason(null);
    refresh();
    return result.user;
  }, [refresh]);

  /**
   * ⭐ En un panel de gestión nadie se auto-registra (§2.6). Antes esta función
   * creaba una cuenta con rol **Administrador**, que es el peor default posible.
   */
  const register = useCallback(async () => {
    throw new Error(
      "El alta de usuarios es por invitación de un administrador, desde Seguridad → Usuarios."
    );
  }, []);

  const logout = useCallback(() => {
    endSession();
    refresh();
  }, [refresh]);

  /** Volver a autenticarse para una acción crítica, con la sesión viva. */
  const stepUp = useCallback((password) => {
    const result = reauthenticate(password);
    if (result.ok) refresh();
    return result;
  }, [refresh]);

  /**
   * Vigila la vigencia de la sesión: avisa antes y cierra al vencer, diciendo
   * por qué. Una sesión que se cae sin explicación parece un bug.
   */
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(() => {
      const status = getSessionStatus();
      if (status.state === "vencida" || status.state === "cerrada") {
        setExpiredReason(status.reason);
        endSession();
        refresh();
      } else {
        setSession(getSession());
      }
    }, 15000);
    return () => clearInterval(id);
  }, [user, refresh]);

  /** Cualquier interacción cuenta como actividad. */
  useEffect(() => {
    if (!user) return undefined;
    const mark = () => { touchSession(); };
    window.addEventListener("click", mark);
    window.addEventListener("keydown", mark);
    return () => {
      window.removeEventListener("click", mark);
      window.removeEventListener("keydown", mark);
    };
  }, [user]);

  const value = useMemo(() => ({
    user,
    session,
    isAuthenticated: Boolean(user),
    expiredReason,
    login,
    register,
    logout,
    stepUp,
    /** ¿Puede el usuario de esta sesión? Devuelve un booleano. */
    can: (permissionKey) => canPermission(user, permissionKey),
    /** Lo mismo, con el motivo, para mostrar el porqué en vez de un botón muerto. */
    check: (permissionKey) => checkPermission(permissionKey, { user }),
    sessionStatus: getSessionStatus,
    describeRemaining,
  }), [user, session, expiredReason, login, register, logout, stepUp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
