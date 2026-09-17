/**
 * Seguridad contra la API: usuarios, roles, catálogo de permisos, sucursales,
 * terminales y auditoría. Es la capa que reemplaza al mock para las pantallas
 * de F1; el resto del módulo (aprobaciones, gate, actividad) sigue en mock
 * hasta su fase.
 */
import { httpClient } from "../../../app/api/httpClient";

const lista = (r) => (Array.isArray(r) ? r : (r?.data ?? []));

export const seguridadApi = {
  usuarios: () => httpClient.get("/usuarios").then(lista),
  crearUsuario: (body) => httpClient.post("/usuarios", body),
  editarUsuario: (id, body) => httpClient.patch(`/usuarios/${id}`, body),

  roles: () => httpClient.get("/roles").then(lista),
  permisos: () => httpClient.get("/roles/permisos"),
  crearRol: (body) => httpClient.post("/roles", body),
  editarRol: (id, body) => httpClient.patch(`/roles/${id}`, body),
  borrarRol: (id) => httpClient.delete(`/roles/${id}`),

  sucursales: () => httpClient.get("/sucursales").then(lista),
  crearSucursal: (body) => httpClient.post("/sucursales", body),
  editarSucursal: (id, body) => httpClient.patch(`/sucursales/${id}`, body),
  borrarSucursal: (id) => httpClient.delete(`/sucursales/${id}`),

  terminales: () => httpClient.get("/terminales").then(lista),
  crearTerminal: (body) => httpClient.post("/terminales", body),
  editarTerminal: (id, body) => httpClient.patch(`/terminales/${id}`, body),
  borrarTerminal: (id) => httpClient.delete(`/terminales/${id}`),

  auditoria: (entidad, entidadId, limit) => httpClient.get("/auditoria", { params: { entidad, entidadId, limit } }),
};

/** Aplana el catálogo de permisos a { clave → { nombre, grupo, esSeccion } }. */
export const indexarPermisos = (catalogo = []) => {
  const out = {};
  catalogo.forEach((g) => {
    g.secciones.forEach((p) => { out[p.clave] = { ...p, grupo: g.grupo, esSeccion: true }; });
    g.acciones.forEach((p) => { out[p.clave] = { ...p, grupo: g.grupo, esSeccion: false }; });
  });
  return out;
};
