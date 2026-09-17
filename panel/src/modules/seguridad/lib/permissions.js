/**
 * ⭐ El catálogo de permisos (docs/MODULO-SEGURIDAD.md §2.4).
 *
 * **Este archivo no importa nada.** Es la tercera hoja del panel, junto a
 * `automatizaciones/lib/bus.js` y `integraciones/lib/ports.js`: cualquier módulo
 * tiene que poder preguntar "¿puede?" sin importar a Seguridad, o el grafo de
 * dependencias vuelve a tener ciclos.
 *
 * ── ⭐ El permiso es la unidad; el rol es un paquete ─────────────────────
 *
 * Antes de esto, el rol era **texto libre** y cada módulo lo interpretaba con su
 * propia expresión regular (`/admin|direcci/i`) en tres archivos distintos. Con
 * eso, agregar un rol obligaba a editar código en varios módulos, y dos módulos
 * podían discrepar sobre el mismo rol. Ahora el permiso se declara una vez acá y
 * el rol es un conjunto con nombre (`lib/roles.js`).
 *
 * ── ⭐ Un permiso no existe si no declara su contrato ────────────────────
 *
 * Mismo mecanismo que `assertContracts()` en Analytics, `assertEventContracts()`
 * en Automatizaciones y `assertProviderContracts()` en Integraciones:
 *
 *   label      cómo se llama para una persona
 *   module     de qué módulo es la capacidad
 *   grade      cuánto control exige (§2.10)
 *   appliedAt  ⭐ el punto EXACTO donde se aplica
 *   wired      ⭐ si YA se aplica ahí, o si todavía está sólo declarado
 *   hint       qué pasa si se usa, en castellano
 *
 * `appliedAt` es a los permisos lo que `wiredAt` a los puertos y `emittedAt` a
 * los eventos: **un permiso declarado que nadie aplica es una mentira prolija**,
 * y con el campo se puede listar cuáles faltan (`coverage()`).
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

/* ------------------------------------------------------------- grados */

/**
 * Los cuatro grados de control. **El grado lo declara el permiso, no la
 * pantalla**: así dos pantallas no pueden tratar la misma operación con dos
 * criterios distintos.
 */
export const GRADES = {
  libre: {
    key: "libre", label: "Libre", tone: "neutral", order: 0,
    audits: false, needsReason: false, needsApproval: false,
    hint: "No se audita. Filtrar una tabla no es un hecho.",
  },
  registrada: {
    key: "registrada", label: "Registrada", tone: "info", order: 1,
    audits: true, needsReason: false, needsApproval: false,
    hint: "Queda asentada con su autor. Sin actor, la operación falla.",
  },
  con_motivo: {
    key: "con_motivo", label: "Con motivo", tone: "warning", order: 2,
    audits: true, needsReason: true, needsApproval: false,
    hint: "Pide un motivo escrito ANTES de ejecutar. Un motivo pedido después es una encuesta.",
  },
  con_aprobacion: {
    key: "con_aprobacion", label: "Con aprobación", tone: "danger", order: 3,
    audits: true, needsReason: true, needsApproval: true,
    hint: "Motivo y un segundo par de ojos. Quien aprueba no puede ser quien pidió.",
  },
};

export const getGrade = (key) => GRADES[key] || GRADES.libre;

/**
 * ⭐ Los umbrales que hacen **subir de grado** a una operación (§4.1, §4.2).
 *
 * El mismo cambio de precio es `con_motivo` si mueve un 3 % y `con_aprobacion`
 * si mueve un 40 %: el grado no depende sólo de qué operación es, sino de
 * **cuánto duele esta vez**. Quien decide si se pasó del umbral es el módulo
 * dueño —es su regla de negocio—; Seguridad sólo dice qué grado le corresponde
 * a cada lado de la raya. Por eso están acá y no adentro de `catalogApi`: si el
 * umbral viviera en el módulo, cambiarlo sería cambiar en silencio cuánto
 * control tiene una operación.
 */
export const THRESHOLDS = {
  precio: {
    key: "precio",
    pct: 0.2,
    label: "±20 % sobre el precio vigente",
    escalates: ["productos.precio", "productos.precio_fuerte"],
    hint: "Una variación mayor —o que deja el margen en negativo— pide un segundo par de ojos.",
  },
  ajuste: {
    key: "ajuste",
    amount: 200000,
    label: "$200.000 de valorización",
    escalates: ["inventario.ajustar", "inventario.ajustar_alto"],
    hint: "Un ajuste de stock por más de eso deja de ser una corrección y empieza a ser una pérdida.",
  },
};

/** ¿Qué permiso corresponde: el normal o el escalado? Lo pregunta el módulo dueño. */
export const escalate = (thresholdKey, exceeded) => {
  const t = THRESHOLDS[thresholdKey];
  if (!t) return null;
  return exceeded ? t.escalates[1] : t.escalates[0];
};

/** Las ocho superficies que el módulo vigila (§4). */
export const SURFACES = {
  precios: { key: "precios", label: "Cambios de precios" },
  stock: { key: "stock", label: "Ajustes de stock" },
  cancelaciones: { key: "cancelaciones", label: "Cancelaciones" },
  reembolsos: { key: "reembolsos", label: "Reembolsos" },
  financiero: { key: "financiero", label: "Cambios financieros" },
  permisos: { key: "permisos", label: "Cambios de permisos" },
  configuracion: { key: "configuracion", label: "Configuración" },
  integraciones: { key: "integraciones", label: "Integraciones" },
};

/** Los módulos, en el orden en que se agrupan en la matriz. */
export const PERMISSION_MODULES = [
  { key: "pedidos", label: "Pedidos" },
  { key: "productos", label: "Productos y catálogo" },
  { key: "inventario", label: "Inventario" },
  { key: "abastecimiento", label: "Abastecimiento" },
  { key: "logistica", label: "Logística" },
  { key: "finanzas", label: "Finanzas" },
  { key: "facturacion", label: "Facturación" },
  { key: "clientes", label: "Clientes / CRM" },
  { key: "marketing", label: "Marketing" },
  { key: "tienda", label: "Tienda / CMS" },
  { key: "analytics", label: "Analytics" },
  { key: "automatizaciones", label: "Automatizaciones" },
  { key: "integraciones", label: "Integraciones" },
  { key: "seguridad", label: "Seguridad" },
];

/* ============================================================ catálogo */

const P = (label, module, grade, appliedAt, extra = {}) => ({
  label, module, grade, appliedAt, wired: false, ...extra,
});

export const PERMISSIONS = {
  /* ------------------------------------------------------------ pedidos */
  "pedidos.ver": P("Ver pedidos", "pedidos", "libre", "pedidosApi.listOrders"),
  "pedidos.crear": P("Crear un pedido", "pedidos", "registrada", "pedidosApi (alta manual)"),
  "pedidos.cobrar": P("Confirmar el pago", "pedidos", "registrada", "pedidosApi.confirmPayment", {
    hint: "Reserva stock y dispara la facturación. No es reversible por la misma vía.",
  }),
  "pedidos.rechazar_pago": P("Marcar el pago como rechazado", "pedidos", "registrada", "pedidosApi.rejectPayment"),
  "pedidos.cancelar": P("Cancelar un pedido", "pedidos", "con_motivo", "pedidosApi.cancelOrder", {
    wired: true,
    surface: "cancelaciones",
    hint: "Libera el stock reservado y cierra el pedido. No se puede deshacer.",
  }),
  "pedidos.descuento": P("Aplicar un descuento a un pedido", "pedidos", "con_motivo", "pedidosApi.applyDiscountToOrder", {
    surface: "precios",
    hint: "⚠ Declarado, NO cableado: hoy esa función es el canal pasivo por el que baja el cupón de Marketing en el checkout, y pedirle un motivo a cada cupón sería absurdo. El override manual de descuento todavía no existe como operación aparte.",
  }),
  "pedidos.devolucion": P("Pedir la devolución", "pedidos", "con_motivo", "pedidosApi.markReturnRequested", {
    surface: "reembolsos",
    hint: "Abre el pedido de reembolso. Ejecutarlo es otra cosa, y la aprueba Finanzas.",
  }),

  /* --------------------------------------------------------- productos */
  "productos.ver": P("Ver el catálogo", "productos", "libre", "catalogApi.listProducts"),
  "productos.editar": P("Editar un producto", "productos", "registrada", "productos — pendiente (§4.1)", {
    hint: "⚠ Hoy no existe la escritura: catalogApi es de sólo lectura.",
  }),
  "productos.precio": P("Cambiar el precio", "productos", "con_motivo", "catalogApi.setPrice", {
    surface: "precios",
    wired: true,
    hint: "Cambia el precio de lista. Un descuento de Marketing NO es esto: ahí el precio de lista no se toca.",
  }),
  "productos.precio_fuerte": P("Cambiar el precio fuera de umbral", "productos", "con_aprobacion", "catalogApi.setPrice (sobre umbral)", {
    surface: "precios",
    wired: true,
    hint: "Variación mayor al ±20 %, o que deja el margen en negativo. Lo firma otra persona.",
  }),

  /* -------------------------------------------------------- inventario */
  "inventario.ver": P("Ver el stock", "inventario", "libre", "inventoryApi.getStockGroupedBySku"),
  "inventario.umbrales": P("Definir mínimos y stock de seguridad", "inventario", "registrada", "inventoryApi.setThresholds", {
    hint: "Cambia qué se considera «bajo mínimo», y con eso qué automatizaciones despiertan.",
  }),
  "inventario.ajustar": P("Ajustar stock", "inventario", "con_motivo", "inventoryApi.createAdjustment", {
    wired: true,
    surface: "stock",
    hint: "Cambia la cantidad física sin una operación que lo justifique. Exige motivo tipificado.",
  }),
  "inventario.ajustar_alto": P("Ajustar stock por encima del umbral", "inventario", "con_aprobacion", "inventoryApi.createAdjustment", {
    wired: true,
    surface: "stock",
    hint: "Cuando el valor del ajuste supera el umbral configurado.",
  }),
  "inventario.transferir": P("Transferir entre depósitos", "inventario", "registrada", "inventoryApi.createTransfer"),
  "inventario.recibir_transferencia": P("Recibir una transferencia", "inventario", "registrada", "inventoryApi.receiveTransfer"),

  /* ----------------------------------------------------- abastecimiento */
  "abastecimiento.ver": P("Ver compras y proveedores", "abastecimiento", "libre", "supplyApi.listPurchaseOrders"),
  "abastecimiento.proveedores": P("Administrar proveedores", "abastecimiento", "registrada", "supplyApi.createSupplier / updateSupplier"),
  "abastecimiento.crear_oc": P("Crear una orden de compra", "abastecimiento", "registrada", "supplyApi.createPurchaseOrder"),
  "abastecimiento.enviar_oc": P("Enviar una orden de compra", "abastecimiento", "con_motivo", "supplyApi.sendPurchaseOrder", {
    surface: "financiero",
    hint: "Compromete plata con un proveedor.",
  }),
  "abastecimiento.recibir_oc": P("Recibir mercadería", "abastecimiento", "registrada", "supplyApi.receivePurchaseOrder", {
    surface: "stock",
    hint: "Suma stock real contra lo pedido.",
  }),
  "abastecimiento.cancelar_oc": P("Cancelar una orden de compra", "abastecimiento", "con_motivo", "supplyApi.cancelPurchaseOrder"),

  /* ---------------------------------------------------------- logística */
  "logistica.ver": P("Ver envíos", "logistica", "libre", "logisticaApi.listShipments"),
  "logistica.preparar": P("Preparar y empacar", "logistica", "registrada", "logisticaApi.startPicking / completePacking"),
  "logistica.despachar": P("Despachar un envío", "logistica", "registrada", "logisticaApi.dispatchShipment", {
    hint: "Genera el código de seguimiento y avisa al cliente.",
  }),
  "logistica.entregar": P("Marcar como entregado", "logistica", "registrada", "logisticaApi.markShipmentDelivered"),
  "logistica.incidencias": P("Abrir y resolver incidencias", "logistica", "registrada", "logisticaApi.openIncident / resolveIncident", {
    hint: "Resolver con «devolver» repone stock y dispara un reembolso.",
  }),
  "logistica.tarifas": P("Editar transportes, zonas y tarifas", "logistica", "con_motivo", "logisticaApi.createRate / updateRate / deleteRate", {
    surface: "financiero",
    hint: "Cambia el costo de envío de todos los pedidos futuros.",
  }),

  /* ----------------------------------------------------------- finanzas */
  "finanzas.ver": P("Ver el P&L y la rentabilidad", "finanzas", "libre", "financeApi.getPnlSummary"),
  "finanzas.gastos": P("Cargar y editar gastos", "finanzas", "registrada", "financeApi.createExpense / updateExpense", {
    surface: "financiero",
  }),
  "finanzas.borrar_gasto": P("Borrar un gasto", "finanzas", "con_motivo", "financeApi.deleteExpense", {
    surface: "financiero",
    hint: "Un gasto borrado cambia un P&L que alguien ya miró.",
  }),
  "finanzas.tarifas": P("Cambiar tarifas de comisión", "finanzas", "con_motivo", "financeApi.updateCommissionRate", {
    wired: true,
    surface: "financiero",
    hint: "⭐ No reescribe el pasado: lo ya devengado queda con la tasa que estaba vigente.",
  }),
  "finanzas.liquidar": P("Liquidar comisiones", "finanzas", "con_motivo", "financeApi.settleCommissions", {
    surface: "financiero",
    hint: "Cierra un período de comisiones a favor de un vendedor.",
  }),
  "finanzas.aprobar_reembolso": P("Aprobar un reembolso", "finanzas", "con_aprobacion", "pedidosApi.confirmRefund (vía Finanzas)", {
    wired: true,
    surface: "reembolsos",
    stepUp: true,
    hint: "Es plata saliendo. Pide volver a autenticarse y no lo puede aprobar quien lo pidió.",
  }),
  "finanzas.rechazar_reembolso": P("Rechazar un reembolso", "finanzas", "con_motivo", "pedidosApi.rejectRefund", {
    wired: true,
    surface: "reembolsos",
  }),

  /* -------------------------------------------------------- facturación */
  "facturacion.ver": P("Ver comprobantes", "facturacion", "libre", "billingApi.listDocuments"),
  "facturacion.emitir_nota": P("Emitir una nota de crédito o débito", "facturacion", "con_motivo", "billingApi.emitNote", {
    surface: "financiero",
    hint: "Es un comprobante fiscal: existe desde que se emite.",
  }),
  "facturacion.anular": P("Anular un comprobante", "facturacion", "con_aprobacion", "billingApi.voidDocument", {
    wired: true,
    surface: "financiero",
    stepUp: true,
    hint: "Anular tiene consecuencias fiscales y no se deshace.",
  }),
  "facturacion.iva": P("Cambiar categorías de IVA", "facturacion", "con_aprobacion", "billingApi.updateVatCategory", {
    surface: "financiero",
    hint: "Cambia cómo se calcula el impuesto de todo lo que se emita después.",
  }),

  /* ----------------------------------------------------------- clientes */
  "clientes.ver": P("Ver clientes", "clientes", "libre", "clientsApi.listAccounts"),
  "clientes.editar": P("Editar cuenta, contactos y direcciones", "clientes", "registrada", "clientsApi.saveAddress / saveTags"),
  "clientes.tier": P("Forzar el tier de un cliente", "clientes", "con_motivo", "clientsApi.setTierOverride", {
    hint: "Pisa lo que calcula el RFM: hay que poder saber quién lo decidió.",
  }),
  "clientes.rfm": P("Cambiar la configuración de RFM", "clientes", "con_motivo", "clientsApi.setRfmConfig", {
    surface: "configuracion",
    hint: "Recalcula los segmentos de todos los clientes a la vez.",
  }),
  "clientes.segmentos": P("Administrar segmentos manuales", "clientes", "registrada", "clientsApi.createManualSegment"),
  "clientes.exportar": P("Exportar datos de clientes", "clientes", "con_motivo", "pendiente — export CSV", {
    hint: "⭐ Sacar datos personales del panel es una acción registrable, no una consulta.",
  }),

  /* ---------------------------------------------------------- marketing */
  "marketing.ver": P("Ver campañas y promociones", "marketing", "libre", "marketingApi.listCampaigns"),
  "marketing.promociones": P("Crear y editar promociones y cupones", "marketing", "registrada", "marketingApi.createPromotion / createCoupon", {
    surface: "precios",
    hint: "⭐ Un descuento NO es un cambio de precio: el precio de lista no se toca. Se auditan por caminos distintos.",
  }),
  "marketing.activar_promocion": P("Activar o pausar una promoción", "marketing", "con_motivo", "marketingApi.setPromotionStatus / setCouponStatus", {
    surface: "precios",
    hint: "Cambia lo que paga el cliente desde el momento en que se activa.",
  }),
  "marketing.campanias": P("Crear y lanzar campañas", "marketing", "registrada", "marketingApi.createCampaign", {
    hint: "Sale hacia el cliente: aplica las bajas de canal antes de enviar.",
  }),
  "marketing.audiencias": P("Administrar audiencias", "marketing", "registrada", "marketingApi.createAudience"),
  "marketing.fidelizacion": P("Cambiar el programa de fidelización", "marketing", "con_motivo", "marketingApi.updateLoyaltyProgram", {
    surface: "financiero",
    hint: "Cambia cuánto vale un punto: afecta plata futura.",
  }),
  "marketing.bajas": P("Cambiar suscripciones de un contacto", "marketing", "registrada", "marketingApi.setSubscription", {
    hint: "Dar de alta a alguien que se dio de baja es un problema legal, no un detalle.",
  }),

  /* ------------------------------------------------------------- tienda */
  "tienda.ver": P("Ver la tienda y el contenido", "tienda", "libre", "tiendaApi.listPages"),
  "tienda.editar": P("Editar páginas y bloques", "tienda", "registrada", "tiendaApi.updatePage / savePageDraft"),
  "tienda.publicar": P("Publicar o programar una página", "tienda", "con_motivo", "tiendaApi.publishPage / schedulePage", {
    hint: "Lo publicado lo ve el público. Volver atrás no borra lo que ya se vio.",
  }),
  "tienda.tema": P("Cambiar la apariencia", "tienda", "con_motivo", "tiendaApi.updateTheme / resetTheme", {
    surface: "configuracion",
  }),
  "tienda.medios": P("Administrar la biblioteca de medios", "tienda", "registrada", "tiendaApi.createMedia / deleteMedia"),

  /* ---------------------------------------------------------- analytics */
  "analytics.ver": P("Ver métricas y reportes", "analytics", "libre", "analyticsApi.query", { wired: true }),
  "analytics.sensibles": P("Ver métricas sensibles", "analytics", "libre", "analyticsApi.canSeeSensitive → guard()", {
    wired: true,
    hint: "Margen, costo y rentabilidad. El motor NO las calcula si no hay permiso: no las tapa.",
  }),
  "analytics.cohortes": P("Ver cohortes y retención", "analytics", "libre", "analyticsApi.canSeeCohorts", { wired: true }),
  "analytics.objetivos": P("Definir objetivos y alertas", "analytics", "registrada", "analyticsApi.canEditTargets → setTarget", { wired: true }),
  "analytics.exportar": P("Exportar a CSV", "analytics", "con_motivo", "pendiente — Explorador / Reportes", {
    hint: "⭐ Exportar saca datos del panel: se registra con filas y filtros.",
  }),

  /* --------------------------------------------------- automatizaciones */
  "automatizaciones.ver": P("Ver reglas e historial", "automatizaciones", "libre", "automationsApi.canView", { wired: true }),
  "automatizaciones.editar": P("Crear y editar reglas", "automatizaciones", "registrada", "automationsApi.canEdit", { wired: true }),
  "automatizaciones.publicar": P("Publicar y pausar reglas", "automatizaciones", "con_motivo", "automationsApi.canPublish", {
    wired: true,
    hint: "Poner una regla a correr sobre datos reales.",
  }),
  "automatizaciones.sensibles": P("Usar acciones sensibles en una regla", "automatizaciones", "con_aprobacion", "automationsApi.canUseSensitive", {
    wired: true,
    hint: "⭐ Una automatización no puede saltear un grado: lo que a una persona le exige aprobación, a la regla también.",
  }),
  "automatizaciones.aprobar": P("Aprobar acciones sensibles", "automatizaciones", "registrada", "automationsApi.canApprove", {
    wired: true,
    hint: "Aprobar revalida sujeto y condiciones antes de ejecutar.",
  }),
  "automatizaciones.reloj": P("Avanzar el reloj simulado", "automatizaciones", "registrada", "automationsApi.canAdvanceClock", { wired: true }),

  /* -------------------------------------------------------- integraciones */
  "integraciones.ver": P("Ver el catálogo de integraciones", "integraciones", "libre", "integrationsApi.canView", { wired: true }),
  "integraciones.trafico": P("Ver la consola de tráfico", "integraciones", "libre", "integrationsApi.canViewTraffic", {
    wired: true,
    surface: "integraciones",
    hint: "El tráfico puede contener datos de clientes.",
  }),
  "integraciones.configurar": P("Configurar y probar una conexión", "integraciones", "con_motivo", "integrationsApi.canConfigure", {
    wired: true, surface: "integraciones",
  }),
  "integraciones.habilitar": P("Habilitar o deshabilitar una conexión", "integraciones", "con_motivo", "integrationsApi.canEnable", {
    wired: true, surface: "integraciones",
    hint: "⭐ Cambia por dónde pasa la operación real del negocio.",
  }),
  "integraciones.produccion": P("Pasar una integración a producción", "integraciones", "con_aprobacion", "integrationsApi.setMode", {
    surface: "integraciones", stepUp: true,
    hint: "Habla con el entorno real de un tercero. Hoy además está bloqueado porque el panel no guarda secretos.",
  }),
  "integraciones.reintentar": P("Reintentar o inyectar una llamada", "integraciones", "registrada", "integrationsApi.canRetry", {
    wired: true, surface: "integraciones",
  }),

  /* ----------------------------------------------------------- seguridad */
  "seguridad.ver": P("Ver el panel de seguridad", "seguridad", "libre", "securityApi.getSecuritySummary", { wired: true }),
  "seguridad.usuarios": P("Administrar usuarios", "seguridad", "registrada", "securityApi.createUser / updateUser", {
    wired: true, surface: "permisos",
  }),
  "seguridad.permisos": P("Cambiar roles y permisos", "seguridad", "con_aprobacion", "securityApi.setUserRole / setException", {
    wired: true, surface: "permisos", stepUp: true,
    hint: "⭐ Es el permiso que otorga permisos. Nadie puede editar su propio rol.",
  }),
  "seguridad.auditoria": P("Ver la auditoría y el activity log", "seguridad", "libre", "securityApi.getAuditLog (F2)", {
    surface: "permisos",
    hint: "Ver quién hizo qué es, en sí mismo, ver datos sensibles.",
  }),
  "seguridad.sesiones": P("Ver y cerrar sesiones", "seguridad", "registrada", "securityApi.listSessions", { wired: true }),
};

// La `key` va dentro del contrato para poder pasar el permiso solo.
Object.entries(PERMISSIONS).forEach(([key, p]) => { p.key = key; });

/* ---------------------------------------------------------- validación */

const REQUIRED = ["label", "module", "grade", "appliedAt"];

/**
 * Corre al cargar el módulo. Un permiso sin contrato completo **no se puede
 * usar**: `can()` lo trata como desconocido, y lo desconocido se deniega.
 */
export const assertPermissions = () => {
  const broken = [];
  const modules = new Set(PERMISSION_MODULES.map((m) => m.key));

  Object.entries(PERMISSIONS).forEach(([key, p]) => {
    const missing = REQUIRED.filter((f) => p[f] == null);
    if (missing.length) broken.push(`${key}: falta ${missing.join(", ")}`);
    if (!GRADES[p.grade]) broken.push(`${key}: grado desconocido «${p.grade}»`);
    if (!modules.has(p.module)) broken.push(`${key}: módulo desconocido «${p.module}»`);
    if (p.surface && !SURFACES[p.surface]) broken.push(`${key}: superficie desconocida «${p.surface}»`);
    if (!key.includes(".")) broken.push(`${key}: la clave tiene que ser «modulo.accion»`);
  });

  return broken;
};

/* ------------------------------------------------------------- lectura */

export const getPermission = (key) => PERMISSIONS[key] || null;

export const listPermissions = ({ module, grade, surface, wired } = {}) =>
  Object.values(PERMISSIONS)
    .filter((p) => !module || p.module === module)
    .filter((p) => !grade || p.grade === grade)
    .filter((p) => !surface || p.surface === surface)
    .filter((p) => wired == null || Boolean(p.wired) === wired);

export const permissionsByModule = () =>
  PERMISSION_MODULES
    .map((m) => ({ ...m, permissions: listPermissions({ module: m.key }) }))
    .filter((m) => m.permissions.length);

/** Los permisos que vigilan una de las ocho superficies (§4). */
export const permissionsBySurface = () =>
  Object.values(SURFACES).map((s) => ({
    ...s,
    permissions: listPermissions({ surface: s.key }),
  }));

/**
 * ⭐ Cuántos permisos **ya se aplican** en el punto que declaran.
 *
 * Es el mismo dato honesto que `wiredAt` en los puertos: lo declarado y lo
 * consumido no son lo mismo, y la pantalla tiene que poder decirlo. En F1 se
 * aplican los que ya tenían RBAC; el resto se cablea al pasar el actor por los
 * `api/` (F2) y al aplicar los grados (F3).
 */
export const coverage = () => {
  const all = Object.values(PERMISSIONS);
  const wired = all.filter((p) => p.wired);
  return {
    total: all.length,
    wired: wired.length,
    declared: all.length - wired.length,
    byGrade: Object.values(GRADES).map((g) => ({
      ...g, count: all.filter((p) => p.grade === g.key).length,
    })),
    sensitive: all.filter((p) => GRADES[p.grade].order >= 2).length,
    stepUp: all.filter((p) => p.stepUp).length,
  };
};

/** ¿Esta operación exige motivo? ¿Y aprobación? Lo contesta el catálogo. */
export const requiresReason = (key) => getGrade(getPermission(key)?.grade).needsReason;
export const requiresApproval = (key) => getGrade(getPermission(key)?.grade).needsApproval;
export const requiresStepUp = (key) => Boolean(getPermission(key)?.stepUp);
export const isAudited = (key) => getGrade(getPermission(key)?.grade).audits;
