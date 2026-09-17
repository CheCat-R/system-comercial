/**
 * Inventario contra la API. `inventoryApi.js` (mock) queda como referencia de
 * los módulos que todavía no migraron; las pantallas de F1 usan ESTE.
 */
import { httpClient } from "../../../app/api/httpClient";

export const inventarioApi = {
  stock: () => httpClient.get("/stock"),
  movimientos: (q) => httpClient.get("/movimientos", { params: q }),
  operaciones: {
    movimiento: (body) => httpClient.post("/operaciones/movimiento", body),
    fraccionar: (body) => httpClient.post("/operaciones/fraccionar", body),
    corregirFraccionado: (body) => httpClient.post("/operaciones/corregir-fraccionado", body),
  },
  transferencias: {
    listar: () => httpClient.get("/transferencias"),
    get: (id) => httpClient.get(`/transferencias/${id}`),
    borrador: (body) => httpClient.post("/transferencias/borrador", body),
    guardarBorrador: (id, body) => httpClient.put(`/transferencias/${id}/borrador`, body),
    enviar: (id) => httpClient.post(`/transferencias/${id}/enviar`),
    descartar: (id) => httpClient.delete(`/transferencias/${id}/borrador`),
    avanzar: (id, desde) => httpClient.post(`/transferencias/${id}/avanzar`, { desde }),
    editarItem: (id, itemId, body) => httpClient.patch(`/transferencias/${id}/items/${itemId}`, body),
    agregarItem: (id, body) => httpClient.post(`/transferencias/${id}/items`, body),
    quitarItem: (id, itemId) => httpClient.delete(`/transferencias/${id}/items/${itemId}`),
    confirmarLista: (id, tipo, listo) => httpClient.post(`/transferencias/${id}/lista`, { tipo, listo }),
    recibir: (id, body) => httpClient.post(`/transferencias/${id}/recibir`, body),
    cancelar: (id) => httpClient.post(`/transferencias/${id}/cancelar`),
  },
  incidencias: {
    listar: () => httpClient.get("/incidencias"),
    crear: (body) => httpClient.post("/incidencias", body),
    avanzar: (id) => httpClient.post(`/incidencias/${id}/avanzar`),
    resolver: (id, resolucion) => httpClient.post(`/incidencias/${id}/resolver`, { resolucion }),
  },
  conteos: {
    listar: (sucursalId) => httpClient.get("/conteos", { params: { sucursalId } }),
    get: (id) => httpClient.get(`/conteos/${id}`),
    crear: (body) => httpClient.post("/conteos", body),
    contar: (id, itemId, contado) => httpClient.put(`/conteos/${id}/items/${itemId}`, { contado }),
    cerrar: (id) => httpClient.post(`/conteos/${id}/cerrar`),
    reabrir: (id) => httpClient.post(`/conteos/${id}/reabrir`),
    recontar: (id, itemId, recontar) => httpClient.post(`/conteos/${id}/items/${itemId}/recontar`, { recontar }),
    aplicar: (id) => httpClient.post(`/conteos/${id}/aplicar`),
    descartar: (id) => httpClient.delete(`/conteos/${id}`),
  },
};

export const ESTADOS_STOCK = {
  disponible: { label: "Disponible", tone: "success" },
  comprometido: { label: "Comprometido", tone: "warning" },
  retenido: { label: "Retenido", tone: "warning" },
  en_transito: { label: "En tránsito", tone: "info" },
  defectuoso: { label: "Defectuoso", tone: "danger" },
  vencido: { label: "Vencido", tone: "danger" },
};

export const TIPOS_MOV = {
  compra: { label: "Compra", dir: 1 },
  fraccionamiento: { label: "Fraccionamiento", dir: 0 },
  venta_granel: { label: "Venta a granel", dir: -1 },
  venta_fraccionada: { label: "Venta", dir: -1 },
  devolucion: { label: "Devolución", dir: 1 },
  ajuste: { label: "Ajuste", dir: 0 },
  merma: { label: "Merma", dir: -1 },
  vencido: { label: "Vencido", dir: -1 },
  defectuoso: { label: "Defectuoso", dir: -1 },
  transferencia: { label: "Transferencia", dir: 0 },
};

export const ESTADOS_TRANSFER = {
  borrador: { label: "Borrador", tone: "neutral" },
  pendiente: { label: "Pendiente", tone: "warning" },
  preparada: { label: "En preparación", tone: "info" },
  transito: { label: "En tránsito", tone: "info" },
  recibida: { label: "Recibida", tone: "success" },
  cancelada: { label: "Cancelada", tone: "danger" },
};
export const PASOS_TRANSFER = ["pendiente", "preparada", "transito", "recibida"];

export const ESTADOS_CONTEO = {
  en_curso: { label: "En curso", tone: "info" },
  cerrado: { label: "Cerrado", tone: "warning" },
  aplicado: { label: "Aplicado", tone: "success" },
  descartado: { label: "Descartado", tone: "danger" },
};

export const num = (v, dec = 3) => (v == null ? "—" : Number(v).toLocaleString("es-AR", { maximumFractionDigits: dec }));
export const money = (v) => (v == null ? "—" : `$${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const fmtTam = (kg) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${num(kg)} kg`);
export const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Nombre de la forma (suelto o paquete) de un producto. */
export const formaDe = (producto, presentacionId) => {
  if (!presentacionId) return producto?.tipo === "granel" ? "Granel suelto" : "Unidad";
  const pr = (producto?.presentaciones || []).find((x) => x.id === presentacionId);
  return pr ? `Paquete ${fmtTam(pr.tamKg)}` : "Paquete";
};
