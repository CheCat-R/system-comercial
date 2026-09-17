/**
 * ⭐ El catálogo de puertos (§3).
 *
 * Un **puerto** es una capacidad que el panel necesita, declarada en lenguaje de
 * negocio y estable. Un **proveedor** es quién la cumple, y cambia todo el
 * tiempo. El núcleo llama al puerto; con quién habla es configuración.
 *
 * Cada puerto declara:
 *   key · label · category · owner   qué módulo lo consume
 *   input / output                   el contrato, **en el modelo del panel**
 *   fallback                         qué corre hoy, sin proveedor
 *   wiredAt                          ⭐ el punto EXACTO del código que lo llama,
 *                                    o null si todavía está sólo declarado
 *   syncOnly                         ⭐ ver la nota de abajo
 *   sensitivity                      alta = no cae al fallback ante error
 *
 * ── ⭐ `syncOnly`: el hallazgo que apareció al cablear ────────────────────
 *
 * Todo el panel es síncrono. Un proveedor real es asíncrono. Los puertos que el
 * núcleo consulta **para renderizar** (el P&L pidiendo la comisión de cada
 * pedido) no pueden esperar una llamada de red: un P&L que necesita internet
 * para dibujarse está roto.
 *
 * Esos puertos van marcados `syncOnly: true`, y eso **no es una limitación del
 * mock**: dice algo verdadero del diseño. La comisión de una pasarela no se
 * consulta al pintar un reporte — es un **dato que produjo el cobro** y que
 * tiene que quedar guardado en el pedido. Mientras no lo esté, el puerto sólo
 * puede resolverse local. Queda anotado como la próxima deuda a saldar.
 */

export const CATEGORIES = [
  { key: "pagos", label: "Pagos", hint: "Cobrar, reembolsar y conciliar" },
  { key: "facturacion", label: "Facturación", hint: "Comprobantes fiscales" },
  { key: "logistica", label: "Logística", hint: "Cotizar, etiquetar y seguir envíos" },
  { key: "marketing", label: "Marketing", hint: "Audiencias, catálogo y conversiones" },
  { key: "analytics", label: "Analytics", hint: "Tráfico que entra, eventos que salen" },
  { key: "comunicacion", label: "Comunicación", hint: "Email, SMS, WhatsApp, push" },
  { key: "erp", label: "ERP", hint: "Maestros, stock y pedidos" },
  { key: "externas", label: "APIs externas", hint: "La válvula de escape, acotada" },
];

export const SENSITIVITY = {
  alta: { key: "alta", label: "Sensibilidad alta", tone: "danger", hint: "Toca plata u obligaciones fiscales: ante error NO cae al fallback, la operación falla." },
  media: { key: "media", label: "Sensibilidad media", tone: "warning", hint: "Sale hacia el cliente o hacia un tercero." },
  baja: { key: "baja", label: "Sensibilidad baja", tone: "neutral", hint: "Sólo lectura o efecto interno." },
};

/* ============================================================== catálogo */

export const PORTS = {
  /* -------------------------------------------------------------- pagos */
  "payments.charge": {
    label: "Cobrar un pedido", category: "pagos", owner: "pedidos",
    input: { orderId: "string", total: "money", currency: "string", method: "string", accountId: "string", idempotencyKey: "string" },
    output: { paymentId: "string", status: "string", captured: "boolean", fee: "money", methodNormalized: "string", last4: "string" },
    fallback: "No hay cobro simulado: el pago se confirma a mano desde Pedidos.",
    wiredAt: null,
    syncOnly: false,
    sensitivity: "alta",
    note: "Sin proveedor NO cae a un fallback: cobrar simulado sería inventar plata. El pedido queda pendiente, como hoy.",
  },
  "payments.refund": {
    label: "Reembolsar un cobro", category: "pagos", owner: "finanzas",
    input: { orderId: "string", paymentId: "string", amount: "money", reason: "string", idempotencyKey: "string" },
    output: { refundId: "string", status: "string", amount: "money" },
    fallback: "Finanzas marca el reembolso sin mover dinero real (approveRefund).",
    wiredAt: null, syncOnly: false, sensitivity: "alta",
  },
  "payments.fee": {
    label: "Comisión del cobro", category: "pagos", owner: "finanzas",
    input: { orderId: "string", total: "money", paymentMethod: "string" },
    output: { amount: "money", label: "string", percent: "decimal" },
    fallback: "Tabla local de tarifas por medio de pago (finanzas/data/commissions.mock.js).",
    wiredAt: "financeApi.orderPnl / enrichOrderPnl",
    syncOnly: true,
    sensitivity: "media",
    note: "⭐ Es el puerto que salda la deuda de §1.2: antes Finanzas matcheaba «mercadopago» por substring contra order.paymentMethod. Es syncOnly porque el P&L lo pide al renderizar — con un proveedor real la comisión tiene que venir guardada del cobro.",
  },
  "payments.payout": {
    label: "Liquidaciones recibidas", category: "pagos", owner: "finanzas",
    input: { from: "date", to: "date" },
    output: { payouts: "list" },
    fallback: "No hay liquidaciones: la comisión se descuenta en el momento del cobro.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
  },

  /* -------------------------------------------------------- facturación */
  "invoicing.issue": {
    label: "Emitir comprobante fiscal", category: "facturacion", owner: "facturacion",
    input: { documentId: "string", type: "string", letter: "string", pointOfSale: "number", number: "string", issueDate: "date", receiver: "object", lines: "list", totals: "object" },
    output: { cae: "string", caeDueDate: "date", assignedNumber: "string", url: "string" },
    fallback: "CAE generado localmente con un hash del número + fecha (facturacion/lib/fiscal.js → simulateCae).",
    wiredAt: "billingApi (emisión de factura y de nota)",
    syncOnly: true,
    sensitivity: "alta",
    note: "Un CAE simulado presentado como real es un problema legal: sin proveedor sano, la emisión falla en vez de inventar uno.",
  },
  "invoicing.void": {
    label: "Anular un comprobante", category: "facturacion", owner: "facturacion",
    input: { documentId: "string", reason: "string" },
    output: { voided: "boolean", at: "date" },
    fallback: "Se marca anulado localmente.",
    wiredAt: null, syncOnly: false, sensitivity: "alta",
  },
  "invoicing.status": {
    label: "Consultar el último número autorizado", category: "facturacion", owner: "facturacion",
    input: { pointOfSale: "number", type: "string" },
    output: { lastNumber: "number", at: "date" },
    fallback: "El número lo lleva el propio panel.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
  },
  "invoicing.taxpayer": {
    label: "Consultar condición frente al IVA", category: "facturacion", owner: "facturacion",
    input: { taxId: "string" },
    output: { name: "string", condition: "string", active: "boolean" },
    fallback: "Se usa la condición cargada a mano en el CRM.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
    note: "Un CUIT inexistente es `negocio`, no un error: el comprobante sale como Consumidor Final.",
  },

  /* ---------------------------------------------------------- logística */
  "shipping.rate": {
    label: "Cotizar un envío", category: "logistica", owner: "logistica",
    input: { origin: "string", destination: "string", weightKg: "decimal", declaredValue: "money", service: "string" },
    output: { cost: "money", etaDays: "number", service: "string" },
    fallback: "Tarifario propio de Logística por zona y método.",
    wiredAt: null, syncOnly: true, sensitivity: "baja",
  },
  "shipping.label": {
    label: "Generar etiqueta", category: "logistica", owner: "logistica",
    input: { shipmentId: "string", orderId: "string", carrierId: "string", address: "string" },
    output: { labelUrl: "string", format: "string" },
    fallback: "No hay etiqueta: se despacha sin documento.",
    wiredAt: null, syncOnly: false, sensitivity: "baja",
  },
  "shipping.track": {
    label: "Código y seguimiento", category: "logistica", owner: "logistica",
    input: { shipmentId: "string", orderId: "string", carrierId: "string", carrierPrefix: "string" },
    output: { trackingCode: "string", status: "string", events: "list" },
    fallback: "Código armado como {prefijo}-{8 dígitos} al despachar; los eventos se cargan a mano.",
    wiredAt: "logisticaApi.dispatchShipment",
    syncOnly: true,
    sensitivity: "baja",
  },
  "shipping.pickup": {
    label: "Pedir retiro", category: "logistica", owner: "logistica",
    input: { warehouseId: "string", date: "date", shipmentIds: "list" },
    output: { pickupId: "string", window: "string" },
    fallback: "El retiro se coordina fuera del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "baja",
  },

  /* ---------------------------------------------------------- marketing */
  "marketing.audience.sync": {
    label: "Sincronizar una audiencia", category: "marketing", owner: "marketing",
    input: { audienceId: "string", name: "string", members: "list" },
    output: { externalId: "string", synced: "number", rejected: "list" },
    fallback: "La audiencia no sale del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
    note: "⚠ Tiene que aplicar las bajas de canal ANTES de salir: si no, la baja deja de valer en cuanto el dato cruza la frontera.",
  },
  "marketing.catalog.feed": {
    label: "Publicar el catálogo", category: "marketing", owner: "tienda",
    input: { products: "list", currency: "string" },
    output: { feedId: "string", published: "number" },
    fallback: "El catálogo sólo vive en la Tienda del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "baja",
  },
  "marketing.conversion": {
    label: "Reportar una conversión", category: "marketing", owner: "marketing",
    input: { orderId: "string", value: "money", currency: "string", accountRef: "string" },
    output: { accepted: "boolean" },
    fallback: "La conversión sólo se registra en Marketing.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
  },

  /* ---------------------------------------------------------- analytics */
  "analytics.track": {
    label: "Enviar evento de negocio", category: "analytics", owner: "analytics",
    input: { event: "string", value: "money", subject: "object", at: "date" },
    output: { accepted: "boolean" },
    fallback: "Los eventos no salen del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "baja",
  },
  "analytics.import": {
    label: "Importar tráfico y sesiones", category: "analytics", owner: "analytics",
    input: { from: "date", to: "date", grain: "string" },
    output: { sessions: "list", channels: "list", sampled: "boolean" },
    fallback: "No hay tráfico: el panel no tiene sesiones.",
    wiredAt: null, syncOnly: false, sensitivity: "baja",
    note: "⭐ Es el puerto que desbloquea lo que MODULO-ANALYTICS.md §2.8 declara imposible (conversión del sitio, CAC por canal, rebote, embudo). Al implementarlo hay que volver a esa sección y actualizar la lista de lo no medible.",
  },

  /* ------------------------------------------------------- comunicación */
  "messaging.send": {
    label: "Enviar un mensaje", category: "comunicacion", owner: "marketing",
    input: { channel: "string", to: "string", templateId: "string", variables: "object", campaignId: "string" },
    output: { messageId: "string", status: "string", cost: "money" },
    fallback: "Envío simulado: marketingApi materializa el send con un costo por canal.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
    note: "El costo real reemplazaría el simulado de CHANNELS. Un rebote duro es `negocio`: marca el contacto y no reintenta.",
  },
  "messaging.status": {
    label: "Estado de entrega", category: "comunicacion", owner: "marketing",
    input: { messageId: "string" },
    output: { status: "string", at: "date" },
    fallback: "El estado lo simula Marketing.",
    wiredAt: null, syncOnly: false, sensitivity: "baja",
  },
  "messaging.optout": {
    label: "Bajas entrantes", category: "comunicacion", owner: "marketing",
    input: { channel: "string", contact: "string", at: "date" },
    output: { applied: "boolean" },
    fallback: "Las bajas se cargan a mano en Marketing.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
    note: "Ejemplo canónico de entrada: webhook → traducción → escribe en las suscripciones por el api/ de Marketing.",
  },

  /* ---------------------------------------------------------------- ERP */
  "erp.product.sync": {
    label: "Sincronizar productos", category: "erp", owner: "productos",
    input: { since: "date" },
    output: { upserted: "number", conflicts: "list" },
    fallback: "El catálogo es del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
  },
  "erp.stock.sync": {
    label: "Sincronizar stock", category: "erp", owner: "inventario",
    input: { since: "date", warehouseMap: "object" },
    output: { updated: "number", conflicts: "list" },
    fallback: "El stock es del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "alta",
    note: "⭐ La decisión difícil no es técnica: si el ERP y el panel escriben los dos, hay dos verdades. La configuración obliga a elegir dueño por entidad, y lo que no es dueño queda de sólo lectura en la UI.",
  },
  "erp.order.push": {
    label: "Enviar pedidos al ERP", category: "erp", owner: "pedidos",
    input: { orderId: "string", payload: "object" },
    output: { externalId: "string" },
    fallback: "Los pedidos no salen del panel.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
  },
  "erp.customer.sync": {
    label: "Sincronizar clientes", category: "erp", owner: "clientes",
    input: { since: "date" },
    output: { upserted: "number", conflicts: "list" },
    fallback: "El padrón es del CRM.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
  },

  /* ------------------------------------------------------------ externas */
  "custom.request": {
    label: "Llamada a una API externa", category: "externas", owner: "automatizaciones",
    input: { method: "string", path: "string", body: "object" },
    output: { status: "number", body: "object" },
    fallback: "No hay llamada: sin conexión, la acción no existe.",
    wiredAt: null, syncOnly: false, sensitivity: "media",
    note: "⚠ Válvula de escape, y por eso la más restringida: allow-list de rutas obligatoria y **su salida no entra al dominio** — no puede crear ni modificar entidades.",
  },
};

Object.entries(PORTS).forEach(([key, p]) => { p.key = key; });

export const getPort = (key) => PORTS[key] || null;

export const listPorts = ({ category, wired } = {}) =>
  Object.values(PORTS)
    .filter((p) => !category || p.category === category)
    .filter((p) => wired == null || Boolean(p.wiredAt) === wired);

export const portsByCategory = () =>
  CATEGORIES.map((c) => ({ ...c, ports: listPorts({ category: c.key }) })).filter((c) => c.ports.length);

/** Los que ya consume un módulo. El resto está declarado y todavía no se usa. */
export const wiredPorts = () => listPorts({ wired: true });
