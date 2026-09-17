/** Tipos de incidencia — ver docs/MODULO-LOGISTICA-FULFILLMENT.md §2.1 y §3.4. */
export const INCIDENT_TYPES = {
  direccion_incorrecta: "Dirección incorrecta",
  destinatario_ausente: "Destinatario ausente",
  danado: "Paquete dañado",
  extraviado: "Extraviado",
  rechazado: "Rechazado por el destinatario",
  demora_transportista: "Demora del transportista",
};

export const INCIDENT_STATUS = {
  abierta: { label: "Abierta", tone: "danger" },
  en_gestion: { label: "En gestión", tone: "warning" },
  resuelta: { label: "Resuelta", tone: "success" },
};

/** Una Incidencia no es un estado del pipeline — se resuelve con una de estas 3 salidas (§3.1/§4.7).
 * "Devolver" es la única que mueve al Envío (fuerza `devuelto`); las otras dos no cambian su estado. */
export const RESOLUTIONS = {
  reintentar: { label: "Reintentar", hint: "El envío sigue su curso normal — se vuelve a intentar la entrega." },
  devolver: { label: "Devolver", hint: "La mercadería vuelve a origen y se genera un reembolso — lo aprueba Finanzas." },
  contactar_cliente: { label: "Contactar cliente", hint: "Deriva a CX/Soporte. No cambia el estado del envío." },
};
