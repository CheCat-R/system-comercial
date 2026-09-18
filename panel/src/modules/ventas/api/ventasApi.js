/**
 * Ventas contra la API (F2): POS, listado, caja, cobranzas, presupuestos,
 * clientes, ofertas, descuentos con nombre y ARCA. Más las constantes y los
 * formateadores que comparten las pantallas del módulo.
 */
import { httpClient } from "../../../app/api/httpClient";

const lista = (r) => (Array.isArray(r) ? r : (r?.data ?? []));

export const ventasApi = {
  bootstrap: () => httpClient.get("/ventas/bootstrap"),
  catalogo: (sucursalId) => httpClient.get("/ventas/catalogo", { params: sucursalId ? { sucursalId } : {} }),
  cuenta: (clienteId) => httpClient.get(`/ventas/cuenta/${clienteId}`),
  listado: (params) => httpClient.get("/ventas/listado", { params }),
  abiertas: (params) => httpClient.get("/ventas", { params: { estado: "borrador", incluirItems: "true", ...params } }).then(lista),
  ventas: (params) => httpClient.get("/ventas", { params }).then(lista),
  venta: (id) => httpClient.get(`/ventas/${id}`),
  crear: (body) => httpClient.post("/ventas", body),
  actualizar: (id, body) => httpClient.put(`/ventas/${id}`, body),
  confirmar: (id, body) => httpClient.post(`/ventas/${id}/confirmar`, body),
  delegar: (id, paraUsuarioId) => httpClient.post(`/ventas/${id}/delegar`, { paraUsuarioId }),
  facturar: (id) => httpClient.post(`/ventas/${id}/facturar`, {}),
  anular: (id, motivo) => httpClient.post(`/ventas/${id}/anular`, { motivo }),
  notaCredito: (id, body) => httpClient.post(`/ventas/${id}/nota-credito`, body),
  descartar: (id) => httpClient.delete(`/ventas/${id}`),

  caja: {
    actual: (sucursalId) => httpClient.get(`/caja/actual/${sucursalId}`).then((r) => r?.turno ?? null),
    listar: (params) => httpClient.get("/caja", { params }).then(lista),
    arqueo: (id) => httpClient.get(`/caja/${id}/arqueo`),
    abrir: (body) => httpClient.post("/caja/abrir", body),
    cerrar: (id, body) => httpClient.post(`/caja/${id}/cerrar`, body),
    control: (id, body) => httpClient.post(`/caja/${id}/control`, body),
    movimiento: (id, body) => httpClient.post(`/caja/${id}/movimiento`, body),
  },

  cobranzas: {
    listar: (params) => httpClient.get("/cobranzas", { params }).then(lista),
    get: (id) => httpClient.get(`/cobranzas/${id}`),
    crear: (body) => httpClient.post("/cobranzas", body),
    anular: (id, motivo) => httpClient.post(`/cobranzas/${id}/anular`, { motivo }),
  },

  presupuestos: {
    listar: (params) => httpClient.get("/presupuestos", { params }).then(lista),
    get: (id) => httpClient.get(`/presupuestos/${id}`),
    crear: (body) => httpClient.post("/presupuestos", body),
    actualizar: (id, body) => httpClient.patch(`/presupuestos/${id}`, body),
    enviar: (id) => httpClient.post(`/presupuestos/${id}/enviar`, {}),
    reabrir: (id) => httpClient.post(`/presupuestos/${id}/reabrir`, {}),
    confirmar: (id) => httpClient.post(`/presupuestos/${id}/confirmar`, {}),
    armar: (id, items) => httpClient.post(`/presupuestos/${id}/armar`, { items }),
    delegar: (id, vendedorId) => httpClient.post(`/presupuestos/${id}/delegar`, { vendedorId }),
    aceptar: (id, body) => httpClient.post(`/presupuestos/${id}/aceptar`, body),
    cancelar: (id, motivo) => httpClient.post(`/presupuestos/${id}/cancelar`, { motivo }),
    pendientes: () => httpClient.get("/presupuestos/ordenes/pendientes"),
  },

  clientes: {
    listar: (params) => httpClient.get("/clientes", { params }).then(lista),
    get: (id) => httpClient.get(`/clientes/${id}`),
    cuenta: (id) => httpClient.get(`/clientes/${id}/cuenta`),
    crear: (body) => httpClient.post("/clientes", body),
    editar: (id, body) => httpClient.patch(`/clientes/${id}`, body),
    credito: (id, body) => httpClient.patch(`/clientes/${id}/credito`, body),
    reactivar: (id) => httpClient.post(`/clientes/${id}/reactivar`, {}),
    borrar: (id) => httpClient.delete(`/clientes/${id}`),
  },

  ofertas: {
    listar: () => httpClient.get("/ofertas").then(lista),
    crear: (body) => httpClient.post("/ofertas", body),
    editar: (id, body) => httpClient.patch(`/ofertas/${id}`, body),
    borrar: (id) => httpClient.delete(`/ofertas/${id}`),
  },

  descuentos: {
    listar: () => httpClient.get("/descuentos").then(lista),
    crear: (body) => httpClient.post("/descuentos", body),
    editar: (id, body) => httpClient.patch(`/descuentos/${id}`, body),
    borrar: (id) => httpClient.delete(`/descuentos/${id}`),
  },

  arca: {
    estado: () => httpClient.get("/arca/estado"),
    probar: () => httpClient.post("/arca/probar", {}),
    pedido: (body) => httpClient.post("/arca/certificado/pedido", body),
    instalar: (certificado) => httpClient.post("/arca/certificado/instalar", { certificado }),
  },

  configuracion: () => httpClient.get("/configuracion/ventas"),
  guardarConfiguracion: (patch) => httpClient.put("/configuracion/ventas", patch),
};

/* ------------------------------ Constantes ------------------------------ */

export const CONDICIONES_IVA = {
  responsable_inscripto: { label: "Responsable Inscripto", corto: "RI" },
  monotributo: { label: "Monotributo", corto: "MT" },
  consumidor_final: { label: "Consumidor Final", corto: "CF" },
  exento: { label: "Exento", corto: "EX" },
  no_categorizado: { label: "No categorizado", corto: "—" },
};

export const TIPOS_DOC = { cuit: "CUIT", cuil: "CUIL", dni: "DNI", sin_identificar: "Sin identificar" };

export const MEDIOS_PAGO = {
  efectivo: "Efectivo", transferencia: "Transferencia", tarjeta_debito: "Tarjeta de débito",
  tarjeta_credito: "Tarjeta de crédito", cheque: "Cheque", qr: "QR / billetera", otro: "Otro",
};

export const TIPOS_VENTA = {
  ticket: { label: "Ticket", tone: "neutral" },
  factura_a: { label: "Factura A", tone: "info" }, factura_b: { label: "Factura B", tone: "info" }, factura_c: { label: "Factura C", tone: "info" },
  nota_credito_a: { label: "N. crédito A", tone: "warning" }, nota_credito_b: { label: "N. crédito B", tone: "warning" }, nota_credito_c: { label: "N. crédito C", tone: "warning" },
  nota_debito_a: { label: "N. débito A", tone: "neutral" }, nota_debito_b: { label: "N. débito B", tone: "neutral" }, nota_debito_c: { label: "N. débito C", tone: "neutral" },
};

export const esNotaCredito = (tipo) => String(tipo ?? "").startsWith("nota_credito");

export const ESTADOS_VENTA = {
  borrador: { label: "Borrador", tone: "neutral" },
  confirmada: { label: "Confirmada", tone: "success" },
  anulada: { label: "Anulada", tone: "error" },
  pendiente_cae: { label: "Pendiente CAE", tone: "warning" },
};

export const ESTADOS_PRESUPUESTO = {
  borrador: { label: "Borrador", tone: "neutral" },
  enviado: { label: "Enviado", tone: "info" },
  confirmado: { label: "Confirmado", tone: "warning" },
  cerrado: { label: "Cerrado", tone: "success" },
  cancelado: { label: "Cancelado", tone: "error" },
  pendiente: { label: "Pedido web", tone: "warning" },
};

export const ENTREGAS = { retiro: "Retiro en local", cadete: "Cadete", camioneta: "Camioneta" };

export const CONDICIONES_PAGO = { contado: "Contado", cuenta_corriente: "Cuenta corriente" };

export const TIPOS_OFERTA = {
  porcentaje: { label: "Descuento %", campos: ["porcentaje"], alcance: true, ayuda: "Un porcentaje directo sobre los artículos del alcance." },
  precio_fijo: { label: "Precio de oferta", campos: ["precio"], alcance: true, ayuda: "El artículo pasa a valer este precio (final, con IVA). Si es más caro que el actual, no se aplica." },
  nxm: { label: "Llevá N, pagá M (3×2)", campos: ["lleva", "paga"], alcance: true, ayuda: "Cada N unidades del mismo artículo, se cobran M. Se aplica sola." },
  segunda_unidad: { label: "2ª unidad con descuento", campos: ["porcentaje"], alcance: true, ayuda: "Cada par del mismo artículo, la segunda unidad lleva este descuento." },
  pack: { label: "Pack: N por $X", campos: ["lleva", "precio"], alcance: true, ayuda: "N unidades del mismo artículo a un precio de conjunto (final, con IVA)." },
  combo: { label: "Combo de productos", campos: ["precio"], alcance: false, ayuda: "Productos DISTINTOS que juntos valen un precio de conjunto." },
  ticket: { label: "% al total del ticket", campos: ["porcentaje", "montoMinimo"], alcance: false, ayuda: "Desde un monto de compra, un % a todo el ticket. Se SUGIERE en la caja y puede exigir medio de pago." },
};

export const ORIGEN_LISTA = {
  base: { corto: "Piso", tone: "neutral", ayuda: "El precio de siempre: no se habilitó ninguna otra lista." },
  cliente: { corto: "Cliente", tone: "success", ayuda: "El cliente tiene esta lista asignada." },
  auto: { corto: "Cantidad", tone: "success", ayuda: "El ticket llegó al mínimo de unidades de este producto." },
  marca: { corto: "Marca", tone: "success", ayuda: "Se juntaron las unidades que pide la regla de la marca." },
  monto: { corto: "Monto", tone: "warning", ayuda: "El ticket superó el umbral configurado." },
  manual: { corto: "Manual", tone: "warning", ayuda: "La eligió una persona. El automático no se la pisa." },
  presupuesto: { corto: "Cotizado", tone: "info", ayuda: "Precio prometido en un presupuesto confirmado." },
};

/* ------------------------------ Formateo ------------------------------ */

export const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(n) || 0);
export const num = (n, d = 2) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(Number(n) || 0);
export const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
export const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Texto comparable: sin mayúsculas ni acentos. */
export const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export const etiquetaVenta = (v) => {
  if (!v) return "";
  const t = TIPOS_VENTA[v.tipo]?.label || v.tipo;
  return v.numero ? `${t} ${v.puntoVenta}-${String(v.numero).padStart(8, "0")}` : `${t} (borrador)`;
};
