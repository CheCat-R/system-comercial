/** Proveedores contra la API. `supplyApi.js` (mock) queda para órdenes de compra y reposición hasta F3. */
import { httpClient } from "../../../app/api/httpClient";

export const proveedoresApi = {
  listar: (tipo) => httpClient.get("/proveedores", { params: { tipo } }),
  get: (id) => httpClient.get(`/proveedores/${id}`),
  crear: (body) => httpClient.post("/proveedores", body),
  editar: (id, body) => httpClient.patch(`/proveedores/${id}`, body),
  borrar: (id) => httpClient.delete(`/proveedores/${id}`),
  auditoria: (id) => httpClient.get("/auditoria", { params: { entidad: "proveedor", entidadId: id, limit: 100 } }),
  historialCostos: (id) => httpClient.get("/precios/historial", { params: { proveedorId: id, limit: 100 } }),
};

export const CONDICION_IVA = {
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  consumidor_final: "Consumidor final",
  exento: "Exento",
  no_categorizado: "No categorizado",
};

export const CONDICION_COMPRA = { factura: "Factura", liquidacion: "Liquidación (sin factura)", mixto: "Mixto" };
export const MEDIO_HABITUAL = { efectivo: "Efectivo", transferencia: "Transferencia", deposito: "Depósito", echeq: "Echeq", cta_cte: "Cuenta corriente" };
export const MODO_CUENTA = { facturas: "Por facturas (se imputa documento a documento)", libre: "Libre (saldo corrido)" };

export const PROVEEDOR_VACIO = {
  nombre: "", cuit: "", condicionIva: "responsable_inscripto", direccion: "", telefono: "", email: "",
  proveeMercaderia: true, proveeGastos: false, letraGasto: "", condicionCompra: "factura", porcSinFactura: 0,
  medioHabitual: "", diasPago: "", modoCuenta: "facturas",
};

/** Lo que el formulario tiene como texto, al tipo que espera la API. */
export const aPayload = (v) => ({
  ...v,
  diasPago: v.diasPago === "" || v.diasPago == null ? null : Number(v.diasPago),
  porcSinFactura: Number(v.porcSinFactura) || 0,
  letraGasto: v.letraGasto || "",
  medioHabitual: v.medioHabitual || "",
});
