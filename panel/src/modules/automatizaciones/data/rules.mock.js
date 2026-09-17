/**
 * Reglas de fábrica.
 *
 * Son **los seis ejemplos del pedido** (§9.7), y están elegidas para que entre
 * las seis se ejerciten las dos familias de disparador y los tres niveles de
 * acción — así la pantalla no sólo no arranca vacía, sino que muestra el modelo
 * entero funcionando:
 *
 *   evento     → pedido creado · pago rechazado · pedido entregado · cliente VIP
 *   observada  → stock bajo · carrito abandonado
 *   safe       → AU-01 · AU-02 · AU-03 (parcial) · AU-06
 *   contact    → AU-04 · AU-05
 *   sensitive  → AU-07 (queda en borrador: propone, no ejecuta)
 *
 * Las de fábrica (`system: true`) se pueden pausar y duplicar, no borrar —
 * mismo criterio que los reportes de Analytics y las páginas de Tienda.
 */
export const rules = [
  {
    id: "AU-01",
    name: "Stock bajo → avisar a Abastecimiento",
    description: "Cuando un SKU caro cruza su mínimo, abre una tarea y notifica.",
    state: "publicada",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: {
      kind: "state",
      key: "stock.bajo_minimo",
      params: { statuses: ["bajo_minimo", "critico"] },
    },
    conditions: {
      match: "all",
      rules: [{ field: "sku.cost", op: "gte", value: 5000 }],
    },
    actions: [
      { key: "task.create", params: { title: "Reponer {{event.payload.name}} en {{event.payload.warehouseName}} — quedan {{event.payload.available}} (mínimo {{event.payload.minStock}})", assignee: "Abastecimiento" } },
      { key: "notify.panel", params: { level: "warning", message: "{{event.payload.name}} bajo el mínimo en {{event.payload.warehouseName}}" } },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 24, maxRunsPerTick: 20 },
  },

  {
    id: "AU-02",
    name: "Pedido creado → dejar constancia",
    description: "Anota el alta en el timeline del cliente y avisa en el panel.",
    state: "publicada",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: { kind: "event", key: "pedido.creado", params: {} },
    conditions: { match: "all", rules: [] },
    actions: [
      { key: "account.note", params: { title: "Pedido {{subject.id}} creado", description: "Alta registrada automáticamente." } },
      { key: "notify.panel", params: { level: "info", message: "Nuevo pedido {{subject.id}}" } },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 24, maxRunsPerTick: 20 },
  },

  {
    id: "AU-03",
    name: "Pago rechazado → recuperar la venta",
    description: "Abre una tarea al equipo comercial y etiqueta la cuenta para seguimiento.",
    state: "publicada",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: { kind: "event", key: "pedido.pago_rechazado", params: {} },
    conditions: { match: "all", rules: [] },
    actions: [
      { key: "task.create", params: { title: "Contactar por el pago rechazado de {{subject.id}}", assignee: "Ventas" } },
      { key: "account.tag", params: { tag: "pago-rechazado" } },
      { key: "notify.panel", params: { level: "error", message: "Pago rechazado en {{subject.id}}" } },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 6, maxRunsPerTick: 20 },
  },

  {
    id: "AU-04",
    name: "Cliente VIP → trato preferencial",
    description: "Cuando el CRM promueve una cuenta a VIP, la etiqueta y la suma a la audiencia de trato preferencial.",
    state: "publicada",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: { kind: "event", key: "cliente.tier_cambiado", params: {} },
    conditions: {
      match: "all",
      rules: [{ field: "account.tier", op: "changed_to", value: "vip" }],
    },
    actions: [
      { key: "account.tag", params: { tag: "vip" } },
      { key: "account.note", params: { title: "Pasó a VIP", description: "Promovido por el CRM según su RFM." } },
      { key: "account.campaign", params: { audienceName: "VIP · trato preferencial" } },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 168, maxRunsPerTick: 10 },
  },

  {
    id: "AU-05",
    name: "Carrito abandonado → recuperación",
    description: "A las 2 horas de inactividad, Marketing manda el cupón nominal.",
    state: "pausada",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: { kind: "state", key: "carrito.abandonado", params: { hours: 2 } },
    conditions: {
      match: "all",
      rules: [
        { field: "cart.subtotal", op: "gte", value: 20000 },
        { field: "cart.hasRecovery", op: "is_false", value: null },
      ],
    },
    actions: [
      { key: "cart.recovery", params: {} },
      { key: "notify.panel", params: { level: "info", message: "Recuperación enviada para {{subject.id}}" } },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 72, maxRunsPerTick: 5 },
  },

  {
    id: "AU-06",
    name: "Pedido entregado → pedir reseña",
    description: "Anota la entrega y deja la tarea de pedir la reseña.",
    state: "publicada",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: { kind: "event", key: "envio.entregado", params: {} },
    conditions: {
      match: "all",
      rules: [{ field: "order.total", op: "gte", value: 50000 }],
    },
    actions: [
      { key: "account.note", params: { title: "Entrega confirmada de {{order.id}}", description: "Pedir reseña." } },
      { key: "task.create", params: { title: "Pedir reseña a {{order.customerName}} por {{order.id}}", assignee: "Marketing" } },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 24, maxRunsPerTick: 20 },
  },

  {
    id: "AU-07",
    name: "Pedido pendiente hace 7 días → proponer cancelación",
    description: "Queda en borrador a propósito: usa una acción sensible, que nunca se ejecuta sola.",
    state: "borrador",
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    trigger: { kind: "state", key: "pedido.pendiente_vencido", params: { days: 7 } },
    conditions: { match: "all", rules: [] },
    actions: [
      { key: "notify.panel", params: { level: "warning", message: "{{subject.id}} lleva 7 días sin pagarse" } },
      { key: "order.cancel", params: {} },
    ],
    execution: { mode: "immediate" },
    guards: { dedupeWindowHours: 168, maxRunsPerTick: 10 },
  },
];
