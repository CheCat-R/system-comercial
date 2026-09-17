import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

import { httpClient } from "../app/api/httpClient";
import { leerSesion, guardarSesion, actualizarSesion, limpiarSesion, leerTokenTerminal } from "../app/api/sesion";
import { queryClient } from "../app/api/queryClient";
import { setActor } from "../modules/seguridad/lib/audit";
import { userActor } from "../modules/seguridad/lib/actors";

/**
 * La sesión del panel, CONTRA LA API.
 *
 * El login es usuario (elegido de la lista) + contraseña + sucursal. La API
 * devuelve un token que viaja en cada llamada; `/auth/yo` lo revalida al
 * arrancar y trae los permisos FRESCOS: si el superadmin ajustó el rol, un F5
 * alcanza. Si la API no responde al arrancar, vale la foto guardada al entrar
 * — mejor operar con permisos de ayer que dejar el sistema en blanco.
 *
 * Los permisos son las claves del catálogo de la API (`compras.productos`,
 * `precios`, `*`…). `can(clave)` es la pregunta; `check(clave)` devuelve el
 * motivo, para que la pantalla diga por qué en vez de un botón muerto.
 *
 * PUENTE CON LOS MÓDULOS QUE SIGUEN EN MOCK: su capa de auditoría necesita un
 * actor (`setActor`). Se lo damos con la persona real, así "quién hizo esto"
 * sigue teniendo nombre mientras cada módulo migra a la API en su fase.
 */

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  }
  return context;
};

/** La forma del usuario para las pantallas: lo que devuelve la API + los alias que las vistas viejas leen. */
const aUsuario = (s) => {
  if (!s?.usuario) return null;
  const u = s.usuario;
  return {
    id: u.id,
    nombre: u.nombre,
    name: u.nombre,              // ⭐ puente: `user.name` en Navbar y pantallas viejas
    rolId: u.rolId,
    rolClave: u.rolClave,
    rolNombre: u.rolNombre,
    role: u.rolNombre,           // ⭐ puente: `user.role`
    permisos: u.permisos || [],
    sucursalId: s.sucursal?.id ?? null,
    sucursalNombre: s.sucursal?.nombre ?? "",
    terminal: s.terminal || null,
  };
};

/** Mapa rol real → rol del catálogo mock, sólo para los módulos que todavía no migraron. */
const rolMockDe = (rolClave, permisos) => {
  if (permisos?.includes("*") || rolClave === "admin") return "admin";
  if (rolClave === "cajero" || rolClave === "fraccionador") return "operaciones";
  return "lectura";
};

const actorDe = (user) => (user ? userActor({
  id: `USR-api-${user.id}`,
  name: user.nombre,
  email: "",
  roleKey: rolMockDe(user.rolClave, user.permisos),
}) : null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => aUsuario(leerSesion()));
  // Mientras se revalida el token guardado, el router no decide nada.
  const [cargando, setCargando] = useState(() => Boolean(leerSesion()?.token));
  const [expiredReason, setExpiredReason] = useState(null);

  const aplicar = useCallback((sesion) => {
    guardarSesion(sesion);
    const u = aUsuario(sesion);
    setUser(u);
    setActor(actorDe(u));
  }, []);

  const cerrarLocal = useCallback((motivo = null) => {
    limpiarSesion();
    setUser(null);
    setActor(null);
    setExpiredReason(motivo);
    queryClient.clear();
  }, []);

  /* Al arrancar: ¿el token guardado todavía vale? Lo decide EL SERVIDOR. */
  useEffect(() => {
    const s = leerSesion();
    if (!s?.token) return;
    setActor(actorDe(aUsuario(s)));
    let vivo = true;
    httpClient.get("/auth/yo", { sinRedirigir: true })
      .then((yo) => { if (vivo) aplicar({ ...s, usuario: yo.usuario, sucursal: yo.sucursal }); })
      .catch((err) => {
        if (!vivo) return;
        // 401 = ya no vale. Otro error (API caída) = se sigue con la foto guardada.
        if (err?.status === 401) cerrarLocal("Tu sesión venció. Volvé a entrar.");
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [aplicar, cerrarLocal]);

  /* Una llamada cualquiera recibió 401: la sesión murió del lado del servidor. */
  useEffect(() => {
    const onVencida = () => cerrarLocal("Tu sesión venció. Volvé a entrar.");
    window.addEventListener("checat:sesion-vencida", onVencida);
    return () => window.removeEventListener("checat:sesion-vencida", onVencida);
  }, [cerrarLocal]);

  /**
   * Entrar: usuario elegido de `/auth/opciones`, contraseña, y la sucursal con
   * la que se va a operar. Si el equipo está registrado como terminal, la
   * sucursal la pone él (y el body se ignora del lado del servidor).
   */
  const login = useCallback(async ({ usuarioId, password, sucursalId }) => {
    const res = await httpClient.post("/auth/login", {
      usuarioId: Number(usuarioId),
      password: password ?? "",
      sucursalId: sucursalId ? Number(sucursalId) : undefined,
      terminalToken: leerTokenTerminal() || undefined,
    });
    aplicar({ token: res.token, usuario: res.usuario, sucursal: res.sucursal, terminal: res.terminal });
    setExpiredReason(null);
    return aUsuario(res);
  }, [aplicar]);

  /** En un panel de gestión nadie se auto-registra: el alta es por invitación. */
  const register = useCallback(async () => {
    throw new Error("El alta de usuarios es por invitación de un administrador, desde Seguridad → Usuarios.");
  }, []);

  /** Salir cierra SOLO esta sesión: la tablet del local sigue trabajando. */
  const logout = useCallback(async () => {
    try { await httpClient.post("/auth/salir", {}, { sinRedirigir: true }); } catch { /* ya vencida: da igual */ }
    cerrarLocal(null);
  }, [cerrarLocal]);

  /** El jefe cambia la sucursal del turno; queda en la sesión del servidor. */
  const cambiarSucursal = useCallback(async (sucursalId) => {
    const r = await httpClient.post("/auth/sucursal", { sucursalId: Number(sucursalId) });
    aplicar({ ...leerSesion(), sucursal: r.sucursal });
    queryClient.invalidateQueries();
    return r.sucursal;
  }, [aplicar]);

  const puede = useCallback((...claves) => {
    const p = user?.permisos || [];
    if (p.includes("*")) return true;
    return claves.some((c) => p.includes(c));
  }, [user]);

  /** Volver a autenticarse para una acción crítica: contra la API, con la misma contraseña. */
  const stepUp = useCallback(async (password) => {
    if (!user) return { ok: false, error: "Sin sesión." };
    try {
      await httpClient.post("/auth/login", {
        usuarioId: user.id, password: password ?? "", sucursalId: user.sucursalId, terminalToken: leerTokenTerminal() || undefined,
      });
      actualizarSesion({ stepUpAt: Date.now() });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || "Contraseña incorrecta." };
    }
  }, [user]);

  const value = useMemo(() => ({
    user,
    cargando,
    session: leerSesion(),
    isAuthenticated: Boolean(user),
    expiredReason,
    login,
    register,
    logout,
    stepUp,
    cambiarSucursal,
    esJefe: Boolean(user) && (user.permisos.includes("*") || ["admin", "superadmin"].includes(user.rolClave)),
    /** ¿Puede el usuario de esta sesión? Acepta varias claves: alcanza con una. */
    can: puede,
    /** Lo mismo, con el motivo. Sin sesión o sin la clave → `allowed: false`. */
    check: (clave) => (puede(clave)
      ? { allowed: true }
      : { allowed: false, reason: user ? `Tu rol (${user.rolNombre}) no tiene el permiso "${clave}".` : "No hay sesión." }),
    sessionStatus: () => ({ state: user ? "activa" : "cerrada", reason: expiredReason }),
    describeRemaining: () => "",
  }), [user, cargando, expiredReason, login, register, logout, stepUp, cambiarSucursal, puede]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
