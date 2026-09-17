/**
 * ⭐ El catálogo de eventos.
 *
 * **Un evento no existe si no declara su contrato** (§2.2), igual que en
 * Analytics una métrica no existe sin fórmula ni origen. Cada entrada dice:
 *
 *   key          `modulo.hecho`, estable
 *   label        cómo se llama en el builder
 *   module       quién lo emite
 *   subjectType  qué entidad viaja como sujeto — es lo que tipa la regla (§2.1)
 *   emittedAt    ⭐ el punto EXACTO del código donde se emite
 *   payload      qué campos trae
 *   kind         event  → algo cambió, llega por el bus
 *                state  → algo es cierto ahora, lo detecta el escáner (§2.3)
 *   sample       payload de ejemplo, para el simulador y la documentación
 *
 * `assertEventContracts()` corre al cargar el módulo: un evento incompleto no se
 * puede elegir en el builder.
 */

/** Los tipos de sujeto del sistema. Tipan condiciones y acciones. */
export const SUBJECT_TYPES = {
  order: { key: "order", label: "Pedido", icon: "receipt" },
  account: { key: "account", label: "Cliente", icon: "person" },
  sku: { key: "sku", label: "Producto / SKU", icon: "inventory" },
  shipment: { key: "shipment", label: "Envío", icon: "truck" },
  cart: { key: "cart", label: "Carrito", icon: "cart" },
  purchaseOrder: { key: "purchaseOrder", label: "Orden de compra", icon: "supply" },
  document: { key: "document", label: "Comprobante", icon: "invoice" },
  page: { key: "page", label: "Página", icon: "page" },
  connection: { key: "connection", label: "Conexión", icon: "hub" },
  approval: { key: "approval", label: "Solicitud de aprobación", icon: "shield" },
};

export const subjectLabel = (type) => SUBJECT_TYPES[type]?.label || type;

/** Los módulos que emiten, en el orden en que se agrupan en el builder. */
export const EVENT_MODULES = [
  { key: "pedidos", label: "Pedidos" },
  { key: "logistica", label: "Logística" },
  { key: "inventario", label: "Inventario y Abastecimiento" },
  { key: "clientes", label: "Clientes / CRM" },
  { key: "marketing", label: "Marketing" },
  { key: "finanzas", label: "Finanzas y Facturación" },
  { key: "tienda", label: "Tienda / CMS" },
  { key: "integraciones", label: "Integraciones" },
  { key: "seguridad", label: "Seguridad" },
];

/* ============================================================== catálogo */

export const EVENTS = {
  /* ---------------------------------------------------------- pedidos */
  "pedido.creado": {
    label: "Se crea un pedido",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "clientsApi.convertQuoteToOrder",
    payload: { orderId: "string", accountId: "string", amount: "money", source: "string" },
    note: "Hoy el único alta real de pedidos es la conversión de una cotización del CRM: `pedidosApi` no exporta `createOrder` (§3.8.2).",
    sample: { orderId: "PED-1042", accountId: "ACC-3", amount: 184000, source: "quote" },
  },
  "pedido.pagado": {
    label: "Se confirma el pago de un pedido",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.confirmPayment",
    payload: { orderId: "string", customerName: "string", total: "money", paymentMethod: "string", backorders: "list" },
    sample: { orderId: "PED-1042", customerName: "Ana Torres", total: 184000, paymentMethod: "MercadoPago", backorders: [] },
  },
  "pedido.pago_rechazado": {
    label: "Se rechaza el pago de un pedido",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.rejectPayment",
    payload: { orderId: "string", customerName: "string", total: "money", reason: "string" },
    note: "El estado «Rechazado» se agregó a Pedidos en la F1 de este módulo: antes el pago sólo iba de Pendiente a Pagado (§3.8.1).",
    sample: { orderId: "PED-1042", customerName: "Ana Torres", total: 184000, reason: "Fondos insuficientes" },
  },
  "pedido.backorder": {
    label: "Un pedido pagado queda en backorder",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.confirmPayment (si faltó stock)",
    payload: { orderId: "string", lines: "list", missing: "number" },
    sample: { orderId: "PED-1042", lines: [{ skuId: "SKU-2", missing: 3 }], missing: 3 },
  },
  "pedido.cancelado": {
    label: "Se cancela un pedido",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.cancelOrder",
    payload: { orderId: "string", customerName: "string" },
    sample: { orderId: "PED-1042", customerName: "Ana Torres" },
  },
  "pedido.reembolsado": {
    label: "Se reembolsa un pedido",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.refundOrder",
    payload: { orderId: "string", amount: "money" },
    sample: { orderId: "PED-1042", amount: 184000 },
  },
  "pedido.descuento_aplicado": {
    label: "Se aplica un descuento a un pedido",
    module: "pedidos", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.applyDiscountToOrder",
    payload: { orderId: "string", discount: "money", couponCode: "string" },
    sample: { orderId: "PED-1042", discount: 18000, couponCode: "BIENVENIDA10" },
  },
  "pedido.pendiente_vencido": {
    label: "Un pedido lleva días pendiente de pago",
    module: "pedidos", subjectType: "order", kind: "state",
    emittedAt: "escáner sobre pedidosApi.listOrders()",
    payload: { orderId: "string", days: "number", total: "money" },
    scanParams: [
      { key: "days", label: "Días pendiente", type: "number", default: 3, min: 1, max: 60,
        hint: "Se dispara cuando el pedido cruza este umbral, una sola vez." },
    ],
    sample: { orderId: "PED-1042", days: 4, total: 184000 },
  },

  /* -------------------------------------------------------- logística */
  "envio.despachado": {
    label: "Se despacha un envío",
    module: "logistica", subjectType: "shipment", kind: "event",
    emittedAt: "logisticaApi.dispatchShipment",
    payload: { shipmentId: "string", orderId: "string", carrierId: "string", trackingCode: "string" },
    note: "Lo emite Logística, no Pedidos: `markDispatched` vive en `pedidosApi` pero lo llama `logisticaApi` (Logística §4.8). El evento lo emite el dueño de la transición — si no, cada despacho emitiría dos y toda regla correría dos veces.",
    sample: { shipmentId: "ENV-12", orderId: "PED-1042", carrierId: "CAR-1", trackingCode: "AR9931" },
  },
  "envio.entregado": {
    label: "Se entrega un envío",
    module: "logistica", subjectType: "shipment", kind: "event",
    emittedAt: "logisticaApi.markShipmentDelivered",
    payload: { shipmentId: "string", orderId: "string", leadTimeHours: "number" },
    sample: { shipmentId: "ENV-12", orderId: "PED-1042", leadTimeHours: 52 },
  },
  "envio.incidencia_abierta": {
    label: "Se abre una incidencia de envío",
    module: "logistica", subjectType: "shipment", kind: "event",
    emittedAt: "logisticaApi.openIncident",
    payload: { shipmentId: "string", orderId: "string", kind: "string", note: "string" },
    sample: { shipmentId: "ENV-12", orderId: "PED-1042", kind: "demora", note: "Zona anegada" },
  },
  "envio.incidencia_resuelta": {
    label: "Se resuelve una incidencia de envío",
    module: "logistica", subjectType: "shipment", kind: "event",
    emittedAt: "logisticaApi.resolveIncident",
    payload: { shipmentId: "string", resolution: "string" },
    sample: { shipmentId: "ENV-12", resolution: "reenviar" },
  },
  "envio.sin_preparar": {
    label: "Un envío lleva horas sin prepararse",
    module: "logistica", subjectType: "shipment", kind: "state",
    emittedAt: "escáner sobre logisticaApi.listShipments()",
    payload: { shipmentId: "string", orderId: "string", hoursWaiting: "number" },
    note: "El umbral de 48 h ya estaba escrito en Logística §5.5 como «el mismo umbral que en el futuro dispararía Automatizaciones». Es literalmente este evento.",
    scanParams: [
      { key: "hours", label: "Horas esperando", type: "number", default: 48, min: 1, max: 240 },
    ],
    sample: { shipmentId: "ENV-12", orderId: "PED-1042", hoursWaiting: 51 },
  },
  "envio.demorado": {
    label: "Un envío despachado no llega",
    module: "logistica", subjectType: "shipment", kind: "state",
    emittedAt: "escáner sobre logisticaApi.listShipments()",
    payload: { shipmentId: "string", orderId: "string", hoursSinceDispatch: "number" },
    scanParams: [
      { key: "hours", label: "Horas desde el despacho", type: "number", default: 72, min: 1, max: 480 },
    ],
    sample: { shipmentId: "ENV-12", orderId: "PED-1042", hoursSinceDispatch: 80 },
  },

  /* ------------------------------------------- inventario y compras */
  "stock.bajo_minimo": {
    label: "Un SKU cae bajo el mínimo",
    module: "inventario", subjectType: "sku", kind: "state",
    emittedAt: "escáner sobre inventoryApi.getStockGroupedBySku()",
    payload: { skuId: "string", name: "string", available: "number", minStock: "number", status: "string" },
    note: "El umbral NO lo define Automatizaciones: usa el `minStock` / `safetyStock` que ya configura Inventario por SKU y depósito, y los cuatro estados de `inventario/lib/stock.js`.",
    scanParams: [
      { key: "statuses", label: "Estados que disparan", type: "multiselect", default: ["bajo_minimo", "critico"],
        options: [
          { value: "bajo_minimo", label: "Bajo mínimo" },
          { value: "critico", label: "Crítico" },
          { value: "agotado", label: "Agotado" },
        ] },
    ],
    sample: { skuId: "SKU-2", name: "Remera Básica Blanca", available: 4, minStock: 10, status: "bajo_minimo" },
  },
  "stock.agotado": {
    label: "Un SKU se agota",
    module: "inventario", subjectType: "sku", kind: "state",
    emittedAt: "escáner sobre inventoryApi.getStockGroupedBySku()",
    payload: { skuId: "string", name: "string", onHand: "number" },
    sample: { skuId: "SKU-2", name: "Remera Básica Blanca", onHand: 0 },
  },
  "stock.repuesto": {
    label: "Entra mercadería al depósito",
    module: "inventario", subjectType: "sku", kind: "event",
    emittedAt: "inventoryApi.receiveGoods",
    payload: { skuId: "string", qty: "number", warehouseId: "string" },
    sample: { skuId: "SKU-2", qty: 50, warehouseId: "WH-1" },
  },
  "stock.ajustado": {
    label: "Se ajusta el stock a mano",
    module: "inventario", subjectType: "sku", kind: "event",
    emittedAt: "inventoryApi.createAdjustment",
    payload: { skuId: "string", delta: "number", reason: "string" },
    sample: { skuId: "SKU-2", delta: -3, reason: "rotura" },
  },
  "compra.enviada": {
    label: "Se envía una orden de compra",
    module: "inventario", subjectType: "purchaseOrder", kind: "event",
    emittedAt: "supplyApi.sendPurchaseOrder",
    payload: { poId: "string", supplierId: "string", total: "money" },
    sample: { poId: "OC-8", supplierId: "PRV-2", total: 940000 },
  },
  "compra.recibida": {
    label: "Se recibe una orden de compra",
    module: "inventario", subjectType: "purchaseOrder", kind: "event",
    emittedAt: "supplyApi.receivePurchaseOrder",
    payload: { poId: "string", supplierId: "string", lines: "list" },
    sample: { poId: "OC-8", supplierId: "PRV-2", lines: [] },
  },

  /* --------------------------------------------------------- clientes */
  "cliente.tier_cambiado": {
    label: "Un cliente cambia de tier",
    module: "clientes", subjectType: "account", kind: "event",
    emittedAt: "clientsApi (setTierOverride y derivación de segmentos)",
    payload: { accountId: "string", name: "string", from: "string", to: "string", manual: "boolean" },
    note: "«Cliente VIP» es `to === \"vip\"`. Se usa este evento y NO un escáner sobre `account.tier`: el CRM ya es el dueño de la definición de VIP (`segmentKey === \"campeon\"`), y una segunda definición acá haría que dos pantallas del panel se contradigan.",
    sample: { accountId: "ACC-3", name: "Ana Torres", from: "frecuente", to: "vip", manual: false },
  },
  "cliente.segmento_cambiado": {
    label: "Un cliente cambia de segmento",
    module: "clientes", subjectType: "account", kind: "event",
    emittedAt: "clientsApi (derivación RFM)",
    payload: { accountId: "string", name: "string", from: "string", to: "string" },
    sample: { accountId: "ACC-3", name: "Ana Torres", from: "activo", to: "en_riesgo" },
  },
  "cliente.cotizacion_convertida": {
    label: "Se convierte una cotización en pedido",
    module: "clientes", subjectType: "account", kind: "event",
    emittedAt: "clientsApi.convertQuoteToOrder",
    payload: { accountId: "string", quoteId: "string", orderId: "string", amount: "money" },
    sample: { accountId: "ACC-3", quoteId: "COT-4", orderId: "PED-1042", amount: 184000 },
  },
  "cliente.etiquetado": {
    label: "Se etiqueta a un cliente",
    module: "clientes", subjectType: "account", kind: "event",
    emittedAt: "clientsApi.saveTags",
    payload: { accountId: "string", added: "list", removed: "list" },
    sample: { accountId: "ACC-3", added: ["mayorista"], removed: [] },
  },
  "cliente.inactivo": {
    label: "Un cliente lleva días sin comprar",
    module: "clientes", subjectType: "account", kind: "state",
    emittedAt: "escáner sobre clientsApi.listAccounts()",
    payload: { accountId: "string", name: "string", recencyDays: "number", segment: "string" },
    scanParams: [
      { key: "days", label: "Días sin comprar", type: "number", default: 90, min: 7, max: 365 },
    ],
    sample: { accountId: "ACC-3", name: "Ana Torres", recencyDays: 104, segment: "en_riesgo" },
  },

  /* -------------------------------------------------------- marketing */
  "carrito.abandonado": {
    label: "Un carrito queda abandonado",
    module: "marketing", subjectType: "cart", kind: "state",
    emittedAt: "escáner sobre marketingApi.listAbandonedCarts({ status: 'abierto' })",
    payload: { cartId: "string", accountId: "string", subtotal: "money", hoursIdle: "number" },
    scanParams: [
      { key: "hours", label: "Horas inactivo", type: "number", default: 2, min: 1, max: 168 },
    ],
    sample: { cartId: "CART-5", accountId: "ACC-3", subtotal: 96000, hoursIdle: 3 },
  },
  "carrito.recuperado": {
    label: "Se recupera un carrito",
    module: "marketing", subjectType: "cart", kind: "event",
    emittedAt: "marketingApi (cierre del carrito por compra)",
    payload: { cartId: "string", accountId: "string", orderId: "string" },
    sample: { cartId: "CART-5", accountId: "ACC-3", orderId: "PED-1042" },
  },
  "campania.lanzada": {
    label: "Se lanza una campaña",
    module: "marketing", subjectType: "account", kind: "event",
    emittedAt: "marketingApi.launchCampaign",
    payload: { campaignId: "string", name: "string", audienceSize: "number" },
    sample: { campaignId: "CMP-4", name: "Reactivación", audienceSize: 42 },
  },

  /* --------------------------------------------- finanzas y facturación */
  "reembolso.solicitado": {
    label: "Se solicita un reembolso",
    module: "finanzas", subjectType: "order", kind: "event",
    emittedAt: "pedidosApi.markReturnRequested",
    payload: { orderId: "string", amount: "money" },
    sample: { orderId: "PED-1042", amount: 184000 },
  },
  "reembolso.aprobado": {
    label: "Finanzas aprueba un reembolso",
    module: "finanzas", subjectType: "order", kind: "event",
    emittedAt: "financeApi.approveRefund",
    payload: { orderId: "string", amount: "money" },
    sample: { orderId: "PED-1042", amount: 184000 },
  },
  "reembolso.rechazado": {
    label: "Finanzas rechaza un reembolso",
    module: "finanzas", subjectType: "order", kind: "event",
    emittedAt: "financeApi.rejectRefund",
    payload: { orderId: "string", reason: "string" },
    sample: { orderId: "PED-1042", reason: "Fuera de plazo" },
  },
  "gasto.creado": {
    label: "Se registra un gasto",
    module: "finanzas", subjectType: "document", kind: "event",
    emittedAt: "financeApi.createExpense",
    payload: { expenseId: "string", category: "string", amount: "money" },
    sample: { expenseId: "GAS-9", category: "marketing", amount: 120000 },
  },
  "nota.emitida": {
    label: "Se emite una nota de crédito o débito",
    module: "finanzas", subjectType: "document", kind: "event",
    emittedAt: "billingApi.emitNote",
    payload: { documentId: "string", invoiceId: "string", type: "string", total: "money" },
    sample: { documentId: "NC-3", invoiceId: "FA-21", type: "credito", total: 184000 },
  },

  /* ------------------------------------------------------------ tienda */
  "pagina.publicada": {
    label: "Se publica una página",
    module: "tienda", subjectType: "page", kind: "event",
    emittedAt: "tiendaApi.publishPage",
    payload: { pageId: "string", title: "string", type: "string", slug: "string" },
    sample: { pageId: "PG-7", title: "Hot Sale", type: "landing", slug: "hot-sale" },
  },
  "newsletter.suscripcion": {
    label: "Alguien se suscribe al newsletter",
    module: "tienda", subjectType: "account", kind: "event",
    emittedAt: "tiendaApi.subscribeFromStore",
    payload: { email: "string", accountId: "string" },
    sample: { email: "ana@ejemplo.com", accountId: "ACC-3" },
  },

  /* ------------------------------------------------------ integraciones */
  /* Los declara Integraciones (docs/MODULO-INTEGRACIONES.md §4) y salen por
     este mismo bus. Viven acá y no en un catálogo aparte por la misma razón
     por la que no hay un segundo bus: un evento que el builder no puede
     elegir es un evento que nadie puede automatizar. */
  "integracion.conectada": {
    label: "Una integración queda conectada",
    module: "integraciones", subjectType: "connection", kind: "event",
    emittedAt: "integraciones/lib/events.js → announceStateChange",
    payload: { portKey: "string", portLabel: "string", provider: "string", previous: "string" },
    sample: { portKey: "invoicing.issue", portLabel: "Emitir comprobante fiscal", provider: "_demo", previous: "configurada" },
  },
  "integracion.degradada": {
    label: "Una integración se degrada",
    module: "integraciones", subjectType: "connection", kind: "event",
    emittedAt: "integraciones/lib/events.js — errores o latencia sobre el umbral",
    payload: { portKey: "string", portLabel: "string", provider: "string", message: "string", latencyMs: "number" },
    sample: { portKey: "payments.fee", portLabel: "Comisión del cobro", provider: "_demo", message: "Responde, pero lento.", latencyMs: 4200 },
  },
  "integracion.caida": {
    label: "Una integración se cae",
    module: "integraciones", subjectType: "connection", kind: "event",
    emittedAt: "integraciones/lib/events.js — N fallas seguidas o credencial inválida",
    payload: { portKey: "string", portLabel: "string", provider: "string", message: "string", consecutiveFailures: "number" },
    sample: { portKey: "invoicing.issue", portLabel: "Emitir comprobante fiscal", provider: "_demo", message: "Credencial inválida (simulada).", consecutiveFailures: 1 },
  },
  "integracion.llamada.error": {
    label: "Una llamada falla y nadie la va a reintentar",
    module: "integraciones", subjectType: "connection", kind: "event",
    emittedAt: "integraciones/lib/pipeline.js — el error no se reintenta, o se agotó la cola",
    payload: { portKey: "string", callId: "string", errorType: "string", message: "string", resolvedLocally: "boolean", reason: "string" },
    sample: { portKey: "invoicing.issue", callId: "CALL-0007", errorType: "auth", message: "Credencial inválida (simulada).", resolvedLocally: false, reason: "«Credencial inválida» no se reintenta." },
  },
  "integracion.webhook.recibido": {
    label: "Entra un webhook",
    module: "integraciones", subjectType: "connection", kind: "event",
    emittedAt: "integraciones/lib/inbound.js — antes de traducir",
    payload: { portKey: "string", raw: "object" },
    sample: { portKey: "payments.charge", raw: { id: "evt_1001", type: "payment.approved" } },
  },
  "integracion.webhook.descartado": {
    label: "Se descarta un webhook",
    module: "integraciones", subjectType: "connection", kind: "event",
    emittedAt: "integraciones/lib/inbound.js — firma inválida, duplicado o sin traducción",
    payload: { portKey: "string", reason: "string", detail: "string", inboundId: "string" },
    sample: { portKey: "payments.charge", reason: "sin_traduccion", detail: "«dispute.opened» no significa nada en el catálogo del panel.", inboundId: "IN-0003" },
  },
};

/* ==================================================== seguridad (F3) */

/**
 * ⭐ Qué **no** se emite acá, y por qué.
 *
 * Una acción denegada, un ingreso fallido o un cambio de precio quedan en la
 * auditoría, no en el bus. Un evento del bus tiene que tener **un tipo de sujeto**
 * —es lo que tipa la regla (§2.1)—, y "algo sensible pasó sobre un pedido, un SKU,
 * un usuario o un comprobante" no tiene tipo: sería un evento polimórfico que
 * rompe el builder. Lo que sí es una entidad con forma propia es **la solicitud
 * de aprobación**, y es lo único que se emite.
 */
Object.assign(EVENTS, {
  "seguridad.aprobacion_pendiente": {
    label: "Queda una acción esperando aprobación",
    module: "seguridad", subjectType: "approval", kind: "event",
    emittedAt: "securityApi (sink de alertas del portón)",
    payload: { approvalId: "string", action: "string", requestedBy: "string", reason: "string" },
    note: "El portón no emite: **avisa por un enchufe** (`setAlertSink`), y quien traduce a evento de dominio es securityApi, que es el módulo dueño. Es la misma regla que en lo entrante de Integraciones.",
    sample: { approvalId: "APS-0001", action: "finanzas.aprobar_reembolso", requestedBy: "Roberto Díaz", reason: "El cliente devolvió el producto fallado." },
  },
  "seguridad.aprobacion_resuelta": {
    label: "Se resuelve una solicitud de aprobación",
    module: "seguridad", subjectType: "approval", kind: "event",
    emittedAt: "securityApi.resolveApproval",
    payload: { approvalId: "string", action: "string", status: "string", resolvedBy: "string" },
    sample: { approvalId: "APS-0001", action: "finanzas.aprobar_reembolso", status: "aprobada", resolvedBy: "Valeria Ortiz" },
  },
});

/* ----------------------------------------------------------- registro */

// La `key` va dentro del contrato para poder pasar el evento solo.
Object.entries(EVENTS).forEach(([key, e]) => { e.key = key; });

const REQUIRED = ["label", "module", "subjectType", "kind", "emittedAt", "payload", "sample"];

/**
 * Hace cumplir la regla §2.2: un evento sin contrato completo no se puede
 * elegir en el builder. Se llama una vez al cargar el módulo, no en cada tick.
 */
export const assertEventContracts = () => {
  const broken = [];
  Object.entries(EVENTS).forEach(([key, e]) => {
    const missing = REQUIRED.filter((f) => e[f] == null);
    if (missing.length) broken.push(`${key}: falta ${missing.join(", ")}`);
    if (e.subjectType && !SUBJECT_TYPES[e.subjectType]) broken.push(`${key}: subjectType "${e.subjectType}" desconocido`);
    if (!["event", "state"].includes(e.kind)) broken.push(`${key}: kind inválido`);
  });
  return broken;
};

export const getEvent = (key) => EVENTS[key] || null;

export const listEvents = ({ module, kind, subjectType } = {}) =>
  Object.values(EVENTS)
    .filter((e) => !module || e.module === module)
    .filter((e) => !kind || e.kind === kind)
    .filter((e) => !subjectType || e.subjectType === subjectType);

/** Los eventos que observa el escáner (§2.3). */
export const listStateEvents = () => listEvents({ kind: "state" });
