/**
 * Productos, catálogos, listas y precios contra la API.
 *
 * `catalogApi.js` (mock) sigue existiendo para los módulos que todavía no
 * migraron (Tienda, Marketing, Analytics). Las pantallas de Productos usan ESTE.
 */
import { httpClient } from "../../../app/api/httpClient";

export const productosApi = {
  listar: () => httpClient.get("/productos"),
  get: (id) => httpClient.get(`/productos/${id}`),
  crear: (body) => httpClient.post("/productos", body),
  editar: (id, body) => httpClient.patch(`/productos/${id}`, body),
  borrar: (id) => httpClient.delete(`/productos/${id}`),
  cambiarEstado: (id, estado, motivo) => httpClient.post(`/productos/${id}/estado`, { estado, motivo }),
  siguienteCodigo: () => httpClient.get("/productos/siguiente-codigo"),
  siguienteEan: (excluir = []) => httpClient.get("/productos/siguiente-ean", { params: { excluir: excluir.join(",") } }),
  setPresentaciones: (id, items) => httpClient.put(`/productos/${id}/presentaciones`, { items }),
  setFormatosCompra: (id, items) => httpClient.put(`/productos/${id}/formatos-compra`, { items }),
  setListas: (id, items) => httpClient.put(`/productos/${id}/listas`, { items }),
  setListasPresentacion: (presId, items) => httpClient.put(`/productos/presentaciones/${presId}/listas`, { items }),
  sugerenciasArchivado: () => httpClient.get("/productos/sugerencias/archivado"),
  archivarLote: (ids, motivo) => httpClient.post("/productos/archivar-lote", { ids, motivo }),

  catalogos: () => httpClient.get("/catalogos"),
  crearCatalogo: (tipo, body) => httpClient.post(`/catalogos/${tipo}`, body),
  editarCatalogo: (tipo, id, body) => httpClient.patch(`/catalogos/${tipo}/${id}`, body),
  borrarCatalogo: (tipo, id) => httpClient.delete(`/catalogos/${tipo}/${id}`),
  fusionarCatalogo: (tipo, id, haciaId) => httpClient.post(`/catalogos/${tipo}/${id}/fusionar`, { haciaId }),

  listas: () => httpClient.get("/listas"),
  proveedores: (tipo) => httpClient.get("/proveedores", { params: { tipo } }),
  stock: () => httpClient.get("/stock"),
  configVentas: () => httpClient.get("/configuracion/ventas"),

  precios: {
    ultimoCambio: () => httpClient.get("/precios/ultimo-cambio"),
    evolucion: (q) => httpClient.get("/precios/evolucion", { params: q }),
    historial: (q) => httpClient.get("/precios/historial", { params: q }),
    costos: (body) => httpClient.post("/precios/costos", body),
    margenes: (body) => httpClient.post("/precios/margenes", body),
    activarProveedor: (body) => httpClient.post("/precios/activar-proveedor", body),
    revertir: (lote) => httpClient.post(`/precios/revertir/${lote}`),
  },
};

export const money = (v) => (v == null ? "—" : `$${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const num = (v, dec = 3) => (v == null ? "—" : Number(v).toLocaleString("es-AR", { maximumFractionDigits: dec }));
export const fmtTam = (kg) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${num(kg)} kg`);

export const ESTADOS_PRODUCTO = {
  activo: { label: "Activo", tone: "success", hint: "Se compra y se vende." },
  discontinuado: { label: "Discontinuado", tone: "warning", hint: "No se compra más, se sigue vendiendo hasta agotar." },
  archivado: { label: "Archivado", tone: "danger", hint: "Fuera de catálogo: no se compra ni se vende." },
};

export const IVAS = [0, 2.5, 5, 10.5, 21, 27];
