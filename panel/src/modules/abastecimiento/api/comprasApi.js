/**
 * Compras, pagos a proveedores, gastos y finanzas del proveedor contra la API
 * (F3). Más las constantes y los formateadores que comparten las pantallas.
 */
import { httpClient } from "../../../app/api/httpClient";

const lista = (r) => (Array.isArray(r) ? r : (r?.data ?? []));

export const comprasApi = {
  comprobantes: {
    listar: (params) => httpClient.get("/comprobantes", { params }).then(lista),
    get: (id) => httpClient.get(`/comprobantes/${id}`),
    saldos: () => httpClient.get("/comprobantes/saldos"),
    cuenta: (proveedorId) => httpClient.get(`/comprobantes/cuenta/${proveedorId}`),
    referenciables: (proveedorId) => httpClient.get(`/comprobantes/referenciables/${proveedorId}`).then(lista),
    remitosPendientes: (proveedorId) => httpClient.get("/comprobantes/remitos-pendientes", { params: proveedorId ? { proveedorId } : {} }).then(lista),
    crear: (body) => httpClient.post("/comprobantes", body),
    facturar: (id, body) => httpClient.post(`/comprobantes/${id}/facturar`, body),
    confirmar: (id) => httpClient.post(`/comprobantes/${id}/confirmar`, {}),
    anular: (id, motivo) => httpClient.post(`/comprobantes/${id}/anular`, { motivo }),
    descartar: (id) => httpClient.delete(`/comprobantes/${id}`),
  },

  pagos: {
    listar: (params) => httpClient.get("/pagos-proveedor", { params }).then(lista),
    get: (id) => httpClient.get(`/pagos-proveedor/${id}`),
    sinAplicar: (destino) => httpClient.get("/pagos-proveedor/sin-aplicar", { params: destino ? { destino } : {} }),
    disponibles: (proveedorId, destino) => httpClient.get(`/pagos-proveedor/disponibles/${proveedorId}`, { params: destino ? { destino } : {} }).then(lista),
    pendientes: (proveedorId, destino) => httpClient.get(`/pagos-proveedor/pendientes/${proveedorId}`, { params: destino ? { destino } : {} }).then(lista),
    cuenta: (proveedorId) => httpClient.get(`/pagos-proveedor/cuenta/${proveedorId}`),
    crear: (body) => httpClient.post("/pagos-proveedor", body),
    imputar: (id, imputaciones) => httpClient.post(`/pagos-proveedor/${id}/imputar`, { imputaciones }),
    desimputar: (imputacionId) => httpClient.delete(`/pagos-proveedor/imputaciones/${imputacionId}`),
    descontarFletes: (body) => httpClient.post("/pagos-proveedor/descontar-fletes", body),
    anular: (id, motivo) => httpClient.post(`/pagos-proveedor/${id}/anular`, { motivo }),
    destino: (id, destino) => httpClient.patch(`/pagos-proveedor/${id}/destino`, { destino }),
    papel: (id, body) => httpClient.patch(`/pagos-proveedor/${id}/papel`, body),
  },

  gastos: {
    bootstrap: () => httpClient.get("/gastos/bootstrap"),
    pendientes: () => httpClient.get("/gastos/pendientes"),
    cuentasAPagar: (params) => httpClient.get("/gastos/cuentas-a-pagar", { params }).then(lista),
    resumen: (params) => httpClient.get("/gastos/resumen", { params }),
    listar: (params) => httpClient.get("/gastos", { params }).then(lista),
    get: (id) => httpClient.get(`/gastos/${id}`),
    crear: (body) => httpClient.post("/gastos", body),
    editar: (id, body) => httpClient.patch(`/gastos/${id}`, body),
    anular: (id, motivo) => httpClient.post(`/gastos/${id}/anular`, { motivo }),
    pagar: (id, body) => httpClient.post(`/gastos/${id}/pagos`, body),
    aplicarPago: (id, pagoId, importe) => httpClient.post(`/gastos/${id}/aplicar-pago`, { pagoId, importe }),
    subirAdjunto: (id, nombre, data) => httpClient.post(`/gastos/${id}/adjuntos`, { nombre, data }),
    borrarAdjunto: (adjuntoId) => httpClient.delete(`/gastos/adjuntos/${adjuntoId}`),
    categorias: () => httpClient.get("/gastos/categorias").then(lista),
    crearCategoria: (body) => httpClient.post("/gastos/categorias", body),
    editarCategoria: (id, body) => httpClient.patch(`/gastos/categorias/${id}`, body),
    borrarCategoria: (id) => httpClient.delete(`/gastos/categorias/${id}`),
    recurrentes: () => httpClient.get("/gastos/recurrentes").then(lista),
    crearRecurrente: (body) => httpClient.post("/gastos/recurrentes", body),
    editarRecurrente: (id, body) => httpClient.patch(`/gastos/recurrentes/${id}`, body),
    borrarRecurrente: (id) => httpClient.delete(`/gastos/recurrentes/${id}`),
    previaPeriodo: (periodo) => httpClient.get(`/gastos/recurrentes/periodo/${periodo}`),
    generarPeriodo: (periodo, ids) => httpClient.post("/gastos/recurrentes/generar", { periodo, ids }),
  },

  compromisos: {
    listar: (params) => httpClient.get("/compromisos", { params }),
    stats: () => httpClient.get("/compromisos/stats"),
    crear: (body) => httpClient.post("/compromisos", body),
    editar: (id, body) => httpClient.patch(`/compromisos/${id}`, body),
    pagar: (id, body) => httpClient.post(`/compromisos/${id}/pagar`, body),
    borrar: (id) => httpClient.delete(`/compromisos/${id}`),
  },

  echeqs: {
    listar: (params) => httpClient.get("/echeqs", { params }),
    stats: () => httpClient.get("/echeqs/stats"),
    crear: (body) => httpClient.post("/echeqs", body),
    editar: (id, body) => httpClient.patch(`/echeqs/${id}`, body),
    estado: (id, estado) => httpClient.post(`/echeqs/${id}/estado`, { estado }),
    borrar: (id) => httpClient.delete(`/echeqs/${id}`),
  },

  edoc: {
    global: () => httpClient.get("/proveedores-edoc").then(lista),
    proveedor: (id) => httpClient.get(`/proveedores-edoc/${id}`),
    ajuste: (body) => httpClient.post("/proveedores-edoc/ajustes", body),
    borrarAjuste: (id) => httpClient.delete(`/proveedores-edoc/ajustes/${id}`),
    conciliar: (id) => httpClient.post(`/proveedores-edoc/${id}/conciliar`, {}),
    desconciliar: (id) => httpClient.delete(`/proveedores-edoc/${id}/conciliar`),
  },

  pedidos: {
    kanban: () => httpClient.get("/pedidos-proveedor").then(lista),
    stats: () => httpClient.get("/pedidos-proveedor/stats"),
    recibidos: (params) => httpClient.get("/pedidos-proveedor/recibidos", { params }),
    alta: (proveedorIds, notas) => httpClient.post("/pedidos-proveedor", { proveedorIds, notas }),
    directo: (proveedorId, notas) => httpClient.post("/pedidos-proveedor/directo", { proveedorId, notas }),
    editar: (id, body) => httpClient.patch(`/pedidos-proveedor/${id}`, body),
    estado: (id, estado) => httpClient.patch(`/pedidos-proveedor/${id}/estado`, { estado }),
    enviado: (id) => httpClient.post(`/pedidos-proveedor/${id}/enviado`, {}),
    revisado: (id, deshacer) => httpClient.post(`/pedidos-proveedor/${id}/revisado`, { deshacer }),
    borrar: (id) => httpClient.delete(`/pedidos-proveedor/${id}`),
  },

  proveedor: {
    percepciones: (id) => httpClient.get(`/proveedores/${id}/percepciones`).then(lista),
    setPercepciones: (id, percepciones) => httpClient.put(`/proveedores/${id}/percepciones`, { percepciones }),
    cuentas: (id) => httpClient.get(`/proveedores/${id}/cuentas`).then(lista),
    setCuentas: (id, cuentas) => httpClient.put(`/proveedores/${id}/cuentas`, { cuentas }),
  },
};

/* ---------------- Constantes ---------------- */

export const TIPOS_COMPROBANTE = {
  factura: { label: "Factura", corto: "Factura", tone: "info" },
  remito: { label: "Remito", corto: "Remito", tone: "warning" },
  liquidacion: { label: "Liquidación (sin factura)", corto: "Liquidación", tone: "neutral" },
  nota_credito: { label: "Nota de crédito", corto: "NC", tone: "success" },
  nota_debito: { label: "Nota de débito", corto: "ND", tone: "danger" },
  orden_compra: { label: "Orden de compra", corto: "OC", tone: "neutral" },
};

export const ESTADOS_COMPROBANTE = {
  borrador: { label: "Borrador", tone: "neutral" },
  confirmado: { label: "Confirmado", tone: "success" },
  anulado: { label: "Anulado", tone: "danger" },
};

export const LETRAS = ["A", "B", "C", "X"];

export const MEDIOS_PAGO_PROV = {
  efectivo: "Efectivo", transferencia: "Transferencia", deposito: "Depósito", echeq: "Echeq", cheque: "Cheque",
  tarjeta_debito: "Tarjeta débito", tarjeta_credito: "Tarjeta crédito", qr: "QR", otro: "Otro",
};

export const TIPOS_DOC_GASTO = { factura: "Factura", ticket: "Ticket", recibo: "Recibo", nota_credito: "Nota de crédito", otro: "Otro" };

export const ESTADOS_GASTO = {
  pendiente: { label: "Pendiente", tone: "warning" },
  pagado: { label: "Pagado", tone: "success" },
  anulado: { label: "Anulado", tone: "danger" },
};

export const FRECUENCIAS = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

export const ESTADOS_ECHEQ = {
  emitido: { label: "Emitido", tone: "info" },
  entregado: { label: "Entregado", tone: "warning" },
  cobrado: { label: "Cobrado", tone: "success" },
  anulado: { label: "Anulado", tone: "danger" },
};

export const ESTADOS_PEDIDO = {
  solicitado: { label: "Hay que pedir", tone: "warning" },
  pedido: { label: "Pedido", tone: "info" },
  recibido: { label: "Recibido", tone: "success" },
  retomar: { label: "Retomar", tone: "neutral" },
};

/* ---------------- Formateadores ---------------- */

export const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
export const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
export const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** ISO de un instante → "AAAA-MM-DD" local, para los <input type="date">. */
export const aDia = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const sumarDias = (dia, n) => {
  const d = dia ? new Date(`${dia}T00:00:00`) : new Date();
  d.setDate(d.getDate() + Number(n || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
