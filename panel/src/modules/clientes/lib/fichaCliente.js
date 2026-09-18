/** La ficha vacía y la traducción formulario → API del cliente. */
export const CLIENTE_VACIO = {
  nombre: "", nombreFantasia: "", tipoDoc: "dni", numeroDoc: "", condicionIva: "consumidor_final", direccion: "", localidad: "", telefono: "", email: "",
  descuento: 0, vendedorId: "", sucursalId: "", listas: [], ctaCteHabilitada: false, limiteCredito: 0, diasPlazo: 0, observaciones: "", activo: true,
};

/** Del formulario al body de la API. Sin la llave, el crédito no viaja. */
export const aPayloadCliente = (f, puedeCredito) => {
  const b = { ...f, descuento: Number(f.descuento) || 0, vendedorId: f.vendedorId || null, sucursalId: f.sucursalId || null };
  if (puedeCredito) { b.limiteCredito = Number(f.limiteCredito) || 0; b.diasPlazo = Number(f.diasPlazo) || 0; } else { delete b.ctaCteHabilitada; delete b.limiteCredito; delete b.diasPlazo; }
  return b;
};

