/**
 * ⭐ El diccionario de métricas.
 *
 * **La regla que define el módulo** (docs/MODULO-ANALYTICS.md §1.1): ninguna
 * métrica existe si no declara qué significa, con qué fórmula se calcula, de qué
 * módulo sale cada término y qué no incluye. `assertContract` lo hace cumplir:
 * una métrica incompleta **no se calcula**, no se muestra rota.
 *
 * Cada contrato:
 *   key          identificador estable
 *   label        cómo se llama en pantalla
 *   question     la pregunta de negocio que responde
 *   formula      la fórmula, en texto, tal como se lee
 *   unit         money | integer | decimal | percent | ratio | days | hours
 *   source[]     de qué `api/` sale cada término
 *   grain        a qué nivel se calcula
 *   excludes[]   qué deja explícitamente afuera
 *   caveat       cuándo desconfiar del número
 *   minSample    debajo de esto se muestra atenuado
 *   dimensions[] por qué se puede cortar (§3)
 *   higherIsBetter  para pintar el delta
 *   sensitive    true = margen/costo/CAC → sólo Admin y Dirección (§10)
 *   compute(facts)  la única implementación
 */
import { safeDiv } from "./format";

/* ------------------------------------------------------------- auxiliares */

const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);

/** Pedidos que cuentan como venta: pagados y no devueltos. */
const sold = (f) => f.orders.filter((o) => !o.returned);

/** Líneas que cuentan como venta. */
const soldLines = (f) => f.lines.filter((l) => !l.returned);

/**
 * El ingreso se suma **por línea**, no por pedido.
 *
 * Es lo que permite cortar por producto, categoría o marca sin inflar: cada
 * línea lleva su parte proporcional del pedido (`lineRevenueNet`, ver
 * `lib/facts.js`). Sumado sin filtros da exactamente el total del pedido.
 */
const revenueNet = (f) => sum(soldLines(f), (l) => l.lineRevenueNet);
const cogs = (f) => sum(soldLines(f), (l) => l.lineCogs);

const DIM_COMMON = ["tiempo", "categoria", "marca", "producto", "canal", "zona", "cliente", "deposito", "medioPago"];
const DIM_ORDER = ["tiempo", "canal", "zona", "cliente", "deposito", "medioPago"];
const DIM_TIME = ["tiempo"];

/* ================================================================== VENTAS */

const VENTAS = {
  revenue_net: {
    label: "Ingresos netos",
    question: "¿Cuánto vendimos, medido como se mide el margen?",
    formula: "Σ (subtotal − descuento + envío cobrado) de pedidos pagados no devueltos",
    unit: "money", grain: "pedido", area: "ventas",
    source: ["finanzas.getOrderPnlList", "analytics.history"],
    excludes: ["IVA", "pedidos devueltos", "pedidos pendientes de pago"],
    caveat: "Incluye el envío cobrado, igual que el P&L de Finanzas. Al cortar por producto, categoría o marca, el descuento y el envío del pedido se reparten entre las líneas en proporción a su precio de lista.",
    minSample: 5, dimensions: DIM_COMMON, higherIsBetter: true,
    compute: revenueNet,
  },

  revenue_gross: {
    label: "Ingresos cobrados",
    question: "¿Cuánta plata entró, con IVA y envío incluidos?",
    formula: "Σ order.total de pedidos pagados",
    unit: "money", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders", "analytics.history"],
    excludes: ["pedidos pendientes"],
    caveat: "Sirve para conciliar con caja, no para medir rentabilidad: el IVA no es ingreso propio.",
    minSample: 5, dimensions: DIM_COMMON, higherIsBetter: true,
    compute: (f) => sum(soldLines(f), (l) => l.lineRevenueGross),
  },

  orders_paid: {
    label: "Pedidos pagados",
    question: "¿Cuántas ventas cerramos?",
    formula: "count(pedidos con pago acreditado y no devueltos)",
    unit: "integer", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders", "analytics.history"],
    excludes: ["pendientes de pago", "cancelados", "devueltos"],
    caveat: null,
    minSample: 1, dimensions: DIM_ORDER, higherIsBetter: true,
    compute: (f) => sold(f).length,
  },

  units_sold: {
    label: "Unidades vendidas",
    question: "¿Cuántos artículos salieron?",
    formula: "Σ cantidad de cada línea de pedidos pagados",
    unit: "integer", grain: "línea", area: "ventas",
    source: ["pedidos.listOrders", "analytics.history"],
    excludes: ["devoluciones"],
    caveat: null,
    minSample: 1, dimensions: DIM_COMMON, higherIsBetter: true,
    compute: (f) => sum(soldLines(f), (l) => l.qty),
  },

  aov: {
    label: "Ticket promedio (AOV)",
    question: "¿Cuánto deja, en promedio, cada pedido que se cobra?",
    formula: "ingresosNetos / pedidosPagados",
    unit: "money", grain: "pedido", area: "ventas",
    source: ["finanzas.getOrderPnlList", "pedidos.listOrders"],
    excludes: ["IVA", "pedidos devueltos", "pedidos pendientes"],
    caveat: "Con menos de 30 pedidos el promedio se mueve entero con un caso atípico. Con un filtro de producto o categoría, el numerador es el ingreso atribuido a esas líneas y el denominador los pedidos que las contienen.",
    minSample: 30, dimensions: DIM_ORDER, higherIsBetter: true,
    compute: (f) => safeDiv(revenueNet(f), sold(f).length),
  },

  aov_gross: {
    label: "Ticket cobrado promedio",
    question: "¿Cuánto paga en promedio quien compra?",
    formula: "Σ order.total / pedidosPagados",
    unit: "money", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders"],
    excludes: ["pedidos devueltos"],
    caveat: "Incluye IVA y envío: es lo que ve el cliente en su resumen, no lo que queda para la empresa.",
    minSample: 30, dimensions: DIM_ORDER, higherIsBetter: true,
    compute: (f) => safeDiv(sum(sold(f), (o) => o.total), sold(f).length),
  },

  units_per_order: {
    label: "Unidades por pedido",
    question: "¿Cuántos artículos se lleva por compra?",
    formula: "unidadesVendidas / pedidosPagados",
    unit: "decimal", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders"],
    excludes: ["devueltos"],
    caveat: null,
    minSample: 20, dimensions: DIM_ORDER, higherIsBetter: true,
    compute: (f) => safeDiv(sum(soldLines(f), (l) => l.qty), sold(f).length),
  },

  avg_unit_price: {
    label: "Precio promedio por unidad",
    question: "¿A qué precio efectivo sale cada artículo?",
    formula: "ingresosNetos / unidadesVendidas",
    unit: "money", grain: "línea", area: "ventas",
    source: ["finanzas.getOrderPnlList", "pedidos.listOrders"],
    excludes: ["IVA"],
    caveat: null,
    minSample: 20, dimensions: DIM_COMMON, higherIsBetter: true,
    compute: (f) => safeDiv(revenueNet(f), sum(soldLines(f), (l) => l.qty)),
  },

  return_rate: {
    label: "Tasa de devolución",
    question: "¿Cuánto de lo vendido se vuelve?",
    formula: "pedidosDevueltos / pedidosPagados",
    unit: "percent", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders", "finanzas.getOrderPnlList"],
    excludes: ["reembolsos parciales", "cambios de talle sin devolución de dinero"],
    caveat: "En indumentaria y calzado un 5-10 % es normal; el problema es la tendencia, no el nivel.",
    minSample: 20, dimensions: DIM_ORDER, higherIsBetter: false,
    compute: (f) => safeDiv(f.orders.filter((o) => o.returned).length, f.orders.length),
  },

  discount_given: {
    label: "Descuento otorgado",
    question: "¿Cuánto margen resignamos en promociones y cupones?",
    formula: "Σ order.discount",
    unit: "money", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders (campo pasivo de Marketing)"],
    excludes: ["puntos de fidelización canjeados", "envío bonificado"],
    caveat: "El descuento es margen sacrificado, no un costo: por eso resta del ingreso y no aparece en el COGS.",
    minSample: 5, dimensions: DIM_COMMON, higherIsBetter: false,
    compute: (f) => sum(soldLines(f), (l) => l.lineDiscount),
  },

  discount_rate: {
    label: "Tasa de descuento",
    question: "¿Qué proporción del precio de lista regalamos?",
    formula: "descuentoOtorgado / Σ subtotal",
    unit: "percent", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders"],
    excludes: ["puntos canjeados"],
    caveat: null,
    minSample: 20, dimensions: DIM_ORDER, higherIsBetter: false,
    compute: (f) => safeDiv(sum(soldLines(f), (l) => l.lineDiscount), sum(soldLines(f), (l) => l.lineRevenue)),
  },

  checkout_conversion: {
    label: "Conversión de checkout",
    question: "De los pedidos que se inician, ¿cuántos terminan pagados?",
    formula: "pedidosPagados / pedidosCreados (ambos por fecha de creación)",
    unit: "percent", grain: "pedido", area: "ventas",
    source: ["pedidos.listOrders"],
    excludes: ["abandonos previos al pedido (no hay sesiones — ver §2.8)"],
    caveat: "NO es la tasa de conversión del sitio: mide el tramo entre crear el pedido y cobrarlo, no la visita.",
    minSample: 20, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(sold(f).length, f.context.createdInPeriod.total),
  },
};

/* ================================================================ CLIENTES */

const activeAccounts = (f) => new Set(sold(f).map((o) => o.accountId));
const newAccounts = (f) => new Set(sold(f).filter((o) => o.isNewCustomer).map((o) => o.accountId));

const CLIENTES = {
  customers_active: {
    label: "Clientes activos",
    question: "¿Cuántos clientes compraron en el período?",
    formula: "count(distinct cuentas con ≥1 pedido pagado)",
    unit: "integer", grain: "cuenta", area: "clientes",
    source: ["clientes.listAccounts", "pedidos.listOrders", "analytics.history"],
    excludes: ["cuentas sin compra en el período"],
    caveat: null,
    minSample: 1, dimensions: ["tiempo", "canal", "zona"], higherIsBetter: true,
    compute: (f) => activeAccounts(f).size,
  },

  customers_new: {
    label: "Clientes nuevos",
    question: "¿A cuántos clientes ganamos?",
    formula: "count(cuentas cuya primera compra cae en el período)",
    unit: "integer", grain: "cuenta", area: "clientes",
    source: ["clientes.listAccounts (metrics.firstOrderAt)", "analytics.history"],
    excludes: ["leads sin compra", "cuentas creadas sin comprar"],
    caveat: "La primera compra se calcula sobre todo el histórico, no sólo sobre el período consultado.",
    minSample: 1, dimensions: ["tiempo", "canal", "zona"], higherIsBetter: true,
    compute: (f) => newAccounts(f).size,
  },

  customers_returning: {
    label: "Clientes recurrentes",
    question: "¿Cuántos de los que compraron ya nos conocían?",
    formula: "clientesActivos − clientesNuevos",
    unit: "integer", grain: "cuenta", area: "clientes",
    source: ["clientes.listAccounts", "analytics.history"],
    excludes: [],
    caveat: null,
    minSample: 1, dimensions: ["tiempo", "canal", "zona"], higherIsBetter: true,
    compute: (f) => activeAccounts(f).size - newAccounts(f).size,
  },

  returning_revenue_share: {
    label: "% de ingreso recurrente",
    question: "¿Cuánto del negocio depende de los clientes que ya nos conocen?",
    formula: "ingresoDeClientesRecurrentes / ingresosNetos",
    unit: "percent", grain: "pedido", area: "clientes",
    source: ["clientes.listAccounts", "finanzas.getOrderPnlList"],
    excludes: [],
    caveat: "Un valor muy alto puede ser buena retención o adquisición frenada: mirarlo junto a clientes nuevos.",
    minSample: 20, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(sum(sold(f).filter((o) => !o.isNewCustomer), (o) => o.revenueNet), revenueNet(f)),
  },

  ltv_avg: {
    label: "LTV promedio (realizado)",
    question: "¿Cuánto dejó, en promedio, cada cliente hasta hoy?",
    formula: "promedio( Σ total pagado − Σ reembolsado ) por cuenta",
    unit: "money", grain: "cuenta", area: "clientes",
    source: ["clientes.listAccounts (metrics.ltv)", "analytics.history"],
    excludes: ["proyección futura"],
    caveat: "Es HISTÓRICO, no predictivo. Incluye IVA y envío porque suma order.total: para compararlo con el CAC hay que usar el LTV de margen.",
    minSample: 20, dimensions: ["tiempo", "canal", "zona"], higherIsBetter: true,
    compute: (f) => {
      const byAccount = new Map();
      f.context.allOrders.forEach((o) => {
        if (o.returned) return;
        byAccount.set(o.accountId, (byAccount.get(o.accountId) || 0) + o.total);
      });
      return safeDiv(sum([...byAccount.values()], (v) => v), byAccount.size);
    },
  },

  ltv_margin: {
    label: "LTV de margen",
    question: "¿Cuánto ganamos, no cuánto facturamos, con cada cliente?",
    formula: "LTVpromedio × margenContribución% del período",
    unit: "money", grain: "cuenta", area: "clientes", sensitive: true,
    source: ["clientes.listAccounts", "finanzas.getPnlSummary"],
    excludes: ["gastos operativos"],
    caveat: "Es el único LTV comparable con el CAC. Usa el margen del período consultado como aproximación del margen histórico.",
    minSample: 20, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => {
      const ltv = METRICS.ltv_avg.compute(f);
      const cmPct = METRICS.contribution_margin_pct.compute(f);
      return ltv == null || cmPct == null ? null : ltv * cmPct;
    },
  },

  cac: {
    label: "CAC",
    question: "¿Cuánto nos cuesta ganar un cliente nuevo?",
    formula: "(gastosDeMarketing + costoDeEnvíosDeCampaña) / clientesNuevos",
    unit: "money", grain: "cuenta", area: "clientes", sensitive: true,
    source: ["finanzas.listExpenses (categoría marketing)", "marketing.getCampaignMetrics", "clientes.listAccounts"],
    excludes: ["costo del equipo comercial", "descuentos de captación", "comisiones"],
    caveat: "Es un CAC contable AGREGADO. No es CAC por canal: el panel no tiene atribución de adquisición (§2.8).",
    minSample: 5, dimensions: DIM_TIME, higherIsBetter: false,
    compute: (f) => safeDiv(f.context.marketingSpend + f.context.marketing.cost, newAccounts(f).size),
  },

  ltv_cac_ratio: {
    label: "LTV / CAC",
    question: "¿El cliente devuelve lo que costó traerlo?",
    formula: "LTVdeMargen / CAC",
    unit: "ratio", grain: "cuenta", area: "clientes", sensitive: true,
    source: ["derivada de LTV de margen y CAC"],
    excludes: [],
    caveat: "La referencia habitual del rubro es 3×. Debajo de 1× cada cliente nuevo pierde plata.",
    minSample: 20, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => {
      const ltv = METRICS.ltv_margin.compute(f);
      const cac = METRICS.cac.compute(f);
      return ltv == null || !cac ? null : ltv / cac;
    },
  },

  repeat_rate: {
    label: "Tasa de recompra",
    question: "¿Qué proporción de clientes compra más de una vez?",
    formula: "cuentas con ≥2 pedidos / cuentas con ≥1 pedido",
    unit: "percent", grain: "cuenta", area: "clientes",
    source: ["pedidos.listOrders", "analytics.history"],
    excludes: ["cuentas sin compras"],
    caveat: "Es histórica total, no del período: un cliente que compró dos veces hace un año sigue contando.",
    minSample: 30, dimensions: ["canal", "zona"], higherIsBetter: true,
    compute: (f) => {
      const counts = new Map();
      f.context.allOrders.forEach((o) => {
        if (o.returned) return;
        counts.set(o.accountId, (counts.get(o.accountId) || 0) + 1);
      });
      const total = counts.size;
      const repeat = [...counts.values()].filter((n) => n >= 2).length;
      return safeDiv(repeat, total);
    },
  },

  orders_per_customer: {
    label: "Pedidos por cliente",
    question: "¿Con qué frecuencia compra quien compra?",
    formula: "pedidosPagados / clientesActivos",
    unit: "decimal", grain: "cuenta", area: "clientes",
    source: ["pedidos.listOrders", "analytics.history"],
    excludes: [],
    caveat: null,
    minSample: 20, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(sold(f).length, activeAccounts(f).size),
  },
};

/* =============================================================== FINANZAS */

const FINANZAS = {
  cogs: {
    label: "COGS",
    question: "¿Cuánto costó la mercadería que vendimos?",
    formula: "Σ cantidad × costo del SKU",
    unit: "money", grain: "línea", area: "finanzas", sensitive: true,
    source: ["finanzas.getOrderPnlList", "productos.catalogApi (cost)"],
    excludes: ["envío", "comisiones", "gastos operativos"],
    caveat: "Finanzas sólo imputa COGS cuando el pedido fue despachado: un pedido pagado sin despachar infla el margen del período.",
    minSample: 5, dimensions: DIM_COMMON, higherIsBetter: false,
    compute: cogs,
  },

  gross_margin: {
    label: "Margen bruto",
    question: "¿Cuánto queda después de pagar la mercadería?",
    formula: "ingresosNetos − COGS",
    unit: "money", grain: "pedido", area: "finanzas", sensitive: true,
    source: ["finanzas.getPnlSummary"],
    excludes: ["envío real", "comisiones", "gastos operativos"],
    caveat: null,
    minSample: 5, dimensions: DIM_COMMON, higherIsBetter: true,
    compute: (f) => revenueNet(f) - cogs(f),
  },

  gross_margin_pct: {
    label: "Margen bruto %",
    question: "¿Qué proporción de la venta sobrevive al costo de la mercadería?",
    formula: "(ingresosNetos − COGS) / ingresosNetos",
    unit: "percent", grain: "pedido", area: "finanzas", sensitive: true,
    source: ["finanzas.getPnlSummary"],
    excludes: ["envío real", "comisiones", "gastos operativos"],
    caveat: null,
    minSample: 10, dimensions: DIM_COMMON, higherIsBetter: true,
    compute: (f) => safeDiv(revenueNet(f) - cogs(f), revenueNet(f)),
  },

  contribution_margin: {
    label: "Margen de contribución",
    question: "¿Cuánto queda después de todos los costos variables de la venta?",
    formula: "margenBruto − costoEnvíoReal − comisiónPasarela",
    unit: "money", grain: "pedido", area: "finanzas", sensitive: true,
    source: ["finanzas.getPnlSummary", "logistica.getShipmentCost"],
    excludes: ["gastos operativos fijos"],
    caveat: "Los envíos sin costo cargado cuentan como 0: en períodos con envíos en curso el margen sale optimista.",
    minSample: 5, dimensions: DIM_ORDER, higherIsBetter: true,
    compute: (f) => {
      const shippingCost = sum(f.context.logistics.shipments, (s) => s.cost || 0);
      return revenueNet(f) - cogs(f) - shippingCost - sum(sold(f), (o) => o.gatewayFee);
    },
  },

  contribution_margin_pct: {
    label: "Margen de contribución %",
    question: "¿Qué proporción de cada venta queda para cubrir los costos fijos?",
    formula: "margenContribución / ingresosNetos",
    unit: "percent", grain: "pedido", area: "finanzas", sensitive: true,
    source: ["finanzas.getPnlSummary"],
    excludes: ["gastos operativos fijos"],
    caveat: null,
    minSample: 10, dimensions: DIM_ORDER, higherIsBetter: true,
    compute: (f) => safeDiv(METRICS.contribution_margin.compute(f), revenueNet(f)),
  },

  gateway_fee: {
    label: "Comisión de pasarela",
    question: "¿Cuánto se lleva el medio de pago?",
    formula: "Σ total × tasa del medio de pago",
    unit: "money", grain: "pedido", area: "finanzas", sensitive: true,
    source: ["finanzas.getOrderPnlList"],
    excludes: ["comisiones de vendedores"],
    caveat: null,
    minSample: 5, dimensions: ["tiempo", "medioPago", "canal"], higherIsBetter: false,
    compute: (f) => sum(sold(f), (o) => o.gatewayFee),
  },

  shipping_gap: {
    label: "Brecha de envío",
    question: "¿El envío que cobramos cubre lo que nos cuesta?",
    formula: "envíoCobrado − costoDeEnvíoReal",
    unit: "money", grain: "pedido", area: "finanzas", sensitive: true,
    source: ["pedidos.listOrders", "logistica.listShipments"],
    excludes: ["envíos sin costo cargado"],
    caveat: "Negativo significa que subsidiamos el envío — a veces es deliberado (envío gratis por monto).",
    minSample: 5, dimensions: ["tiempo", "zona", "canal"], higherIsBetter: true,
    compute: (f) => sum(sold(f), (o) => o.shipping) - sum(f.context.logistics.shipments, (s) => s.cost || 0),
  },
};

/* ============================================================== MARKETING */

const MARKETING = {
  attributed_revenue: {
    label: "Ingreso atribuido",
    question: "¿Cuánto vendieron las campañas?",
    formula: "Σ ingreso de conversiones atribuidas por last-touch (ventana 14 días)",
    unit: "money", grain: "campaña", area: "marketing",
    source: ["marketing.getCampaignMetrics"],
    excludes: ["ventas sin contacto previo", "ventas fuera de la ventana de 14 días"],
    caveat: "Atribución last-touch: le adjudica la venta al último contacto, no reparte el crédito.",
    minSample: 1, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => f.context.marketing.revenue,
  },

  roas: {
    label: "ROAS",
    question: "¿Cuánto vuelve por cada peso invertido en campañas?",
    formula: "ingresoAtribuido / costoDeCampañas",
    unit: "ratio", grain: "campaña", area: "marketing", sensitive: true,
    source: ["marketing.getCampaignMetrics"],
    excludes: ["gasto de marketing fuera de campañas (ese está en el CAC)"],
    caveat: "Sólo cubre el costo de envío del canal, no la producción de la campaña ni la pauta.",
    minSample: 1, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(f.context.marketing.revenue, f.context.marketing.cost),
  },

  open_rate: {
    label: "Tasa de apertura",
    question: "¿Llega el mensaje?",
    formula: "abiertos / entregados",
    unit: "percent", grain: "envío", area: "marketing",
    source: ["marketing.getCampaignMetrics"],
    excludes: ["rebotados", "bajas"],
    caveat: "Los envíos son simulados (docs/MODULO-MARKETING.md §1.1).",
    minSample: 50, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(f.context.marketing.opened, f.context.marketing.delivered),
  },

  click_rate: {
    label: "Tasa de clic",
    question: "¿Interesa el mensaje a quien lo abre?",
    formula: "clics / abiertos",
    unit: "percent", grain: "envío", area: "marketing",
    source: ["marketing.getCampaignMetrics"],
    excludes: [],
    caveat: "Los envíos son simulados.",
    minSample: 50, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(f.context.marketing.clicked, f.context.marketing.opened),
  },

  campaign_conversion: {
    label: "Conversión de campaña",
    question: "¿Vende el mensaje?",
    formula: "conversionesAtribuidas / envíosEntregados",
    unit: "percent", grain: "envío", area: "marketing",
    source: ["marketing.getCampaignMetrics"],
    excludes: [],
    caveat: "NO es la tasa de conversión del sitio.",
    minSample: 50, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(f.context.marketing.conversions, f.context.marketing.delivered),
  },

  cart_recovery_rate: {
    label: "Recuperación de carrito",
    question: "¿Sirve perseguir el carrito abandonado?",
    formula: "carritosRecuperados / carritosConRecuperaciónEnviada",
    unit: "percent", grain: "carrito", area: "marketing",
    source: ["marketing.listAbandonedCarts"],
    excludes: ["carritos sin acción de recuperación"],
    caveat: "Los carritos son simulados: la Tienda real los alimentaría por evento.",
    minSample: 10, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => safeDiv(f.context.marketing.cartsRecovered, f.context.marketing.cartsWithRecovery),
  },

  coupon_orders: {
    label: "Pedidos con cupón",
    question: "¿Cuánto se usan los cupones?",
    formula: "count(pedidos con couponCode)",
    unit: "integer", grain: "pedido", area: "marketing",
    source: ["pedidos.listOrders"],
    excludes: ["promociones automáticas sin código"],
    caveat: null,
    minSample: 5, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => sold(f).filter((o) => o.couponCode).length,
  },

  aov_with_coupon: {
    label: "Ticket promedio con cupón",
    question: "¿El cupón sube o baja el ticket?",
    formula: "ingresosNetos(pedidos con cupón) / pedidosConCupón",
    unit: "money", grain: "pedido", area: "marketing",
    source: ["pedidos.listOrders", "finanzas.getOrderPnlList"],
    excludes: ["pedidos sin cupón"],
    caveat: "Comparar contra el ticket promedio general: si es menor, el cupón está subsidiando compras que ya iban a ocurrir.",
    minSample: 20, dimensions: DIM_TIME, higherIsBetter: true,
    compute: (f) => {
      const withCoupon = sold(f).filter((o) => o.couponCode);
      return safeDiv(sum(withCoupon, (o) => o.revenueNet), withCoupon.length);
    },
  },
};

/* ============================================================= INVENTARIO */

const INVENTARIO = {
  stock_value: {
    label: "Valor de stock",
    question: "¿Cuánta plata está inmovilizada en mercadería?",
    formula: "Σ unidades en mano × costo del SKU",
    unit: "money", grain: "SKU", area: "inventario", sensitive: true,
    source: ["inventario.getStockGroupedBySku", "productos.catalogApi (cost)"],
    excludes: ["mercadería en tránsito", "stock reservado se cuenta igual"],
    caveat: "Es una FOTO DE HOY, no del período: el stock no tiene historia en el panel.",
    minSample: 1, dimensions: [], higherIsBetter: false,
    compute: (f) => f.context.inventory.value,
  },

  out_of_stock: {
    label: "SKUs sin stock",
    question: "¿Qué no podemos vender?",
    formula: "count(SKU con disponible ≤ 0)",
    unit: "integer", grain: "SKU", area: "inventario",
    source: ["inventario.getStockGroupedBySku"],
    excludes: ["productos en borrador"],
    caveat: "Foto de hoy, no del período.",
    minSample: 1, dimensions: [], higherIsBetter: false,
    compute: (f) => f.context.inventory.outOfStock,
  },

  stock_coverage_days: {
    label: "Cobertura de stock",
    question: "¿Para cuántos días alcanza lo que tenemos?",
    formula: "unidadesEnMano / (unidadesVendidas / díasDelPeríodo)",
    unit: "days", grain: "SKU", area: "inventario",
    source: ["inventario.getStockGroupedBySku", "pedidos.listOrders"],
    excludes: ["reposición en camino"],
    caveat: "Sin ventas en el período no hay cobertura calculable. Mezcla una foto de stock con un flujo de ventas.",
    minSample: 10, dimensions: [], higherIsBetter: true,
    compute: (f) => {
      const units = sum(soldLines(f), (l) => l.qty);
      const onHand = sum(f.context.inventory.skus, (g) => g.onHand);
      return safeDiv(onHand, safeDiv(units, f.period.days));
    },
  },

  inventory_turnover: {
    label: "Rotación de stock",
    question: "¿Cuántas veces se renueva el stock en el período?",
    formula: "COGS del período / valorDeStock",
    unit: "decimal", grain: "SKU", area: "inventario", sensitive: true,
    source: ["finanzas.getPnlSummary", "inventario.getStockGroupedBySku"],
    excludes: [],
    caveat: "NO anualizar el resultado de un período corto: multiplicar por 12 una rotación de 24 días no significa nada.",
    minSample: 10, dimensions: [], higherIsBetter: true,
    compute: (f) => safeDiv(cogs(f), f.context.inventory.value),
  },
};

/* ============================================================== LOGÍSTICA */

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;

const LOGISTICA = {
  dispatch_lead_time: {
    label: "Lead time de despacho",
    question: "¿Cuánto tardamos en sacar el pedido?",
    formula: "promedio(fechaDespacho − fechaPago)",
    unit: "hours", grain: "envío", area: "logistica",
    source: ["logistica.listShipments", "pedidos.listOrders"],
    excludes: ["pedidos sin despachar"],
    caveat: "Sólo cuenta lo ya despachado: si hay una cola grande sin salir, el número sale mejor de lo que es.",
    minSample: 10, dimensions: ["tiempo", "deposito", "zona"], higherIsBetter: false,
    compute: (f) => {
      const rows = f.context.logistics.dispatched.filter((s) => s.createdAt && s.dispatchedAt);
      return safeDiv(sum(rows, (s) => hoursBetween(s.createdAt, s.dispatchedAt)), rows.length);
    },
  },

  delivery_lead_time: {
    label: "Lead time de entrega",
    question: "¿Cuánto tarda el transportista?",
    formula: "promedio(fechaEntrega − fechaDespacho)",
    unit: "days", grain: "envío", area: "logistica",
    source: ["logistica.listShipments"],
    excludes: ["envíos en tránsito"],
    caveat: "Sólo cuenta lo ya entregado: los envíos demorados que aún no llegaron no entran.",
    minSample: 10, dimensions: ["tiempo", "zona", "transportista"], higherIsBetter: false,
    compute: (f) => {
      const rows = f.context.logistics.delivered.filter((s) => s.dispatchedAt && s.deliveredAt);
      return safeDiv(sum(rows, (s) => hoursBetween(s.dispatchedAt, s.deliveredAt) / 24), rows.length);
    },
  },

  delivery_rate: {
    label: "Tasa de entrega",
    question: "De lo despachado, ¿cuánto llegó?",
    formula: "envíosEntregados / envíosDespachados",
    unit: "percent", grain: "envío", area: "logistica",
    source: ["logistica.listShipments"],
    excludes: ["envíos en tránsito"],
    caveat: null,
    minSample: 10, dimensions: ["tiempo", "zona", "transportista"], higherIsBetter: true,
    compute: (f) => safeDiv(f.context.logistics.delivered.length, f.context.logistics.dispatched.length),
  },

  incident_rate: {
    label: "Tasa de incidencias",
    question: "¿Qué proporción de envíos se complica?",
    formula: "envíosConIncidencia / envíos",
    unit: "percent", grain: "envío", area: "logistica",
    source: ["logistica.listIncidents", "logistica.listShipments"],
    excludes: ["reclamos gestionados fuera del sistema"],
    caveat: null,
    minSample: 10, dimensions: ["tiempo", "zona", "transportista"], higherIsBetter: false,
    compute: (f) => safeDiv(f.context.logistics.withIncident.length, f.context.logistics.shipments.length),
  },

  avg_shipping_cost: {
    label: "Costo de envío promedio",
    question: "¿Cuánto nos sale mover cada pedido?",
    formula: "Σ costo de envío / envíos con costo cargado",
    unit: "money", grain: "envío", area: "logistica", sensitive: true,
    source: ["logistica.listShipments"],
    excludes: ["envíos sin costo cargado"],
    caveat: null,
    minSample: 10, dimensions: ["tiempo", "zona", "transportista"], higherIsBetter: false,
    compute: (f) => {
      const rows = f.context.logistics.shipments.filter((s) => s.cost);
      return safeDiv(sum(rows, (s) => s.cost), rows.length);
    },
  },
};

/* ============================================================== registro */

export const METRICS = { ...VENTAS, ...CLIENTES, ...FINANZAS, ...MARKETING, ...INVENTARIO, ...LOGISTICA };

// La `key` va dentro del contrato para que se pueda pasar la métrica sola.
Object.entries(METRICS).forEach(([key, m]) => { m.key = key; });

export const AREAS = [
  { key: "ventas", label: "Ventas y pedidos", hint: "Lo que se vendió y a qué precio" },
  { key: "clientes", label: "Clientes", hint: "Quién compra, cuánto deja y si vuelve" },
  { key: "finanzas", label: "Finanzas", hint: "Qué queda después de los costos" },
  { key: "marketing", label: "Marketing", hint: "Qué trajo la inversión en campañas" },
  { key: "inventario", label: "Inventario", hint: "Qué hay y cuánto dura" },
  { key: "logistica", label: "Logística", hint: "Cuánto tardamos y cuánto cuesta" },
];

const REQUIRED = ["label", "question", "formula", "unit", "source", "grain", "compute"];

/**
 * Hace cumplir la regla §1.1: una métrica sin contrato completo **no se
 * calcula**. Se llama al arrancar el módulo, no en cada consulta.
 */
export const assertContracts = () => {
  const broken = [];
  Object.entries(METRICS).forEach(([key, m]) => {
    const missing = REQUIRED.filter((field) => m[field] == null || (Array.isArray(m[field]) && !m[field].length));
    if (missing.length) broken.push(`${key}: falta ${missing.join(", ")}`);
  });
  return broken;
};

export const getMetric = (key) => METRICS[key] || null;

export const listMetrics = ({ area, canSeeSensitive = true } = {}) =>
  Object.values(METRICS)
    .filter((m) => !area || m.area === area)
    .filter((m) => canSeeSensitive || !m.sensitive);

/** Motivo por el que una dimensión no aplica a una métrica (§3). */
export const dimensionRejection = (metric, dimensionKey) => {
  if (!metric) return "Elegí una métrica primero.";
  if (!metric.dimensions?.length) {
    return `«${metric.label}» es un total del período: no se corta por ninguna dimensión.`;
  }
  if (!metric.dimensions.includes(dimensionKey)) {
    return `«${metric.label}» se calcula a nivel ${metric.grain} y no tiene esa dimensión.`;
  }
  return null;
};

/** Tamaño de muestra que sostiene la métrica, para mostrar el `n` (§8.6). */
export const sampleOf = (metric, facts) => {
  switch (metric.grain) {
    case "cuenta": return new Set(facts.orders.map((o) => o.accountId)).size;
    case "línea": return facts.lines.length;
    case "envío": return facts.context.logistics.shipments.length;
    case "campaña": return facts.context.marketing.campaigns.length;
    case "carrito": return facts.context.marketing.cartsWithRecovery;
    case "SKU": return facts.context.inventory.skus.length;
    default: return facts.orders.length;
  }
};
