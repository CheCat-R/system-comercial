/**
 * La tabla de hechos: una sola foto sobre la que se calculan todas las métricas
 * de una pantalla.
 *
 * **Por qué existe** (docs/MODULO-ANALYTICS.md §6.1): cortar 45 métricas por 14
 * dimensiones recorriendo pedidos, cuentas, envíos y P&L en cada click es lento
 * y, peor, inconsistente — dos métricas podrían leer el catálogo en momentos
 * distintos. `buildFacts` arma el conjunto una vez y todas las métricas de esa
 * consulta trabajan sobre él.
 *
 * **Une dos orígenes que nunca se solapan** (§1.3): la historia generada cubre
 * meses cerrados hasta el 9 de agosto de 2026; desde el 10 mandan los módulos.
 */
import { listOrders } from "../../pedidos/api/pedidosApi";
import { getOrderPnlList, listExpenses } from "../../finanzas/api/financeApi";
import { listAccounts } from "../../clientes/api/clientsApi";
import { listProducts, listCategories, listBrands } from "../../productos/api/catalogApi";
import { listZones, listShipments, listIncidents } from "../../logistica/api/logisticaApi";
import { getStockGroupedBySku } from "../../inventario/api/inventoryApi";
import { listCampaigns, listAbandonedCarts } from "../../marketing/api/marketingApi";

import { historyOrders, historyAccounts, historyMarketingSpend } from "../data/history.mock";
import { LIVE_START, monthKey, inPeriod } from "./periods";

/* ------------------------------------------------------------ taxonomías */

const catalogIndex = () => {
  const products = listProducts();
  const categories = new Map(listCategories().map((c) => [c.id, c.name]));
  const brands = new Map(listBrands().map((b) => [b.id, b.name]));
  const bySku = new Map(products.map((p) => [p.sku, p]));
  return { bySku, categories, brands };
};

/** Zona geográfica: única geografía del sistema (Logística, por keyword). */
const zoneResolver = () => {
  let zones = [];
  try { zones = listZones(); } catch { zones = []; }
  return (address = "") => {
    const hit = zones.find((z) => (z.keywords || []).some((k) => address.includes(k)));
    return hit?.name || "Sin zona";
  };
};

/* ------------------------------------------------------- normalizadores */

/**
 * Reparte los importes del pedido entre sus líneas, **proporcionalmente al
 * precio de lista de cada una**.
 *
 * Sin esto, cortar el ingreso por producto o por categoría suma el pedido
 * entero en cada línea: la Mochila aparecería con el ingreso de todos los
 * pedidos que la contienen, incluido lo que se llevaron de otras categorías, y
 * la suma de los productos superaría al total. El descuento y el envío se
 * reparten igual, porque son del pedido y no de una línea en particular.
 */
const lineOf = (order, line, idx, index) => {
  const product = index.bySku.get(line.skuId) || null;
  const lineRevenue = line.qty * line.unitPrice;
  const share = order.subtotal > 0 ? lineRevenue / order.subtotal : 0;
  return {
    lineRevenueNet: Math.round(order.revenueNet * share),
    lineRevenueGross: Math.round(order.total * share),
    lineDiscount: Math.round(order.discount * share),
    id: `${order.id}-${idx}`,
    orderId: order.id,
    date: order.date,
    month: order.month,
    source: order.source,
    accountId: order.accountId,
    // Dimensiones del pedido, repetidas en la línea para poder filtrar sin join.
    channel: order.channel,
    zone: order.zone,
    warehouseId: order.warehouseId,
    paymentMethod: order.paymentMethod,
    returned: order.returned,
    skuId: line.skuId,
    productId: product?.id ?? null,
    productName: product?.name || line.skuId,
    categoryId: product?.categoryId ?? null,
    categoryName: index.categories.get(product?.categoryId) || "Sin categoría",
    brandId: product?.brandId ?? null,
    brandName: index.brands.get(product?.brandId) || "Sin marca",
    qty: line.qty,
    unitPrice: line.unitPrice,
    lineRevenue,
    lineCogs: order.returned ? 0 : line.qty * (line.unitCost ?? product?.cost ?? 0),
  };
};

/**
 * Pedido histórico → `OrderFact`, con **la misma fórmula que usa Finanzas**:
 * `revenueNet = subtotal − descuento + envío cobrado` (el envío cobrado es
 * ingreso; su costo se descuenta recién en el margen de contribución).
 */
const historyOrderFact = (o) => {
  const subtotal = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const revenueNet = o.returned ? 0 : subtotal - o.discount + o.shipping;
  const cogs = o.returned ? 0 : o.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const total = Math.round((subtotal - o.discount) * 1.21) + o.shipping;
  return {
    id: o.id,
    source: "history",
    date: o.date,
    createdAt: o.date,
    month: monthKey(o.date),
    accountId: o.accountId,
    customerName: o.customerName,
    accountType: o.accountType,
    channel: o.channel,
    zone: o.zone,
    warehouseId: o.warehouseId,
    warehouseName: o.warehouseId,
    paymentMethod: o.paymentMethod,
    couponCode: o.couponCode,
    returned: o.returned,
    subtotal,
    discount: o.discount,
    shipping: o.shipping,
    revenueNet,
    cogs,
    // 3,5 % es la tasa de pasarela que usa Finanzas para MercadoPago; la
    // transferencia no paga comisión.
    gatewayFee: o.paymentMethod.includes("Transferencia") ? 0 : Math.round(total * 0.035),
    total,
    units: o.lines.reduce((s, l) => s + l.qty, 0),
    lines: o.lines,
  };
};

/**
 * Pedido vivo → `OrderFact`. El dinero sale de **Finanzas** (`getOrderPnlList`),
 * que es la autoridad de márgenes y costos (regla §8.2); el resto de las
 * dimensiones, de Pedidos.
 */
const liveOrderFacts = (accountsByName, resolveZone) => {
  const pnlById = new Map(getOrderPnlList().map((p) => [p.orderId, p]));

  return listOrders()
    .filter((o) => o.paymentStatus === "Pagado" || o.paymentStatus === "Reembolso pendiente")
    .filter((o) => o.paidAt)
    .map((o) => {
      const pnl = pnlById.get(o.id);
      const account = accountsByName.get(o.customerName) || null;
      const returned = Boolean(pnl?.returned);
      return {
        id: o.id,
        source: "live",
        date: o.paidAt,
        createdAt: o.createdAt,
        month: monthKey(o.paidAt),
        accountId: account?.id || o.customerName,
        customerName: o.customerName,
        accountType: account?.type || "person",
        channel: pnl?.channel || (account?.type === "company" ? "Mayorista B2B" : "Tienda web"),
        zone: resolveZone(o.address || ""),
        warehouseId: o.warehouseId,
        warehouseName: o.warehouseName,
        paymentMethod: o.paymentMethod,
        couponCode: o.couponCode,
        returned,
        subtotal: o.subtotal,
        discount: o.discount,
        shipping: o.shipping,
        // Si Finanzas ya lo calculó, se usa su número tal cual.
        revenueNet: pnl ? pnl.revenueNet : returned ? 0 : o.subtotal - o.discount + o.shipping,
        cogs: pnl ? pnl.cogs : 0,
        gatewayFee: pnl ? pnl.gatewayFee : 0,
        total: o.total,
        units: o.items.reduce((s, it) => s + it.qty, 0),
        lines: o.items.map((it) => ({ skuId: it.skuId, qty: it.qty, unitPrice: it.unitPrice })),
      };
    });
};

/* ------------------------------------------------------------ buildFacts */

/** Filtros que se aplican **antes** de calcular (§5). */
const passesFilters = (order, f = {}) => {
  if (f.channel?.length && !f.channel.includes(order.channel)) return false;
  if (f.zone?.length && !f.zone.includes(order.zone)) return false;
  if (f.warehouseId?.length && !f.warehouseId.includes(order.warehouseId)) return false;
  if (f.paymentMethod?.length && !f.paymentMethod.some((m) => order.paymentMethod.includes(m))) return false;
  if (f.accountType?.length && !f.accountType.includes(order.accountType)) return false;
  if (f.discount === "with" && !order.discount) return false;
  if (f.discount === "without" && order.discount) return false;
  if (f.discount === "coupon" && !order.couponCode) return false;
  if (f.minTicket != null && order.revenueNet < f.minTicket) return false;
  if (f.maxTicket != null && order.revenueNet > f.maxTicket) return false;
  return true;
};

const passesLineFilters = (line, f = {}) => {
  if (f.categoryId?.length && !f.categoryId.includes(line.categoryId)) return false;
  if (f.brandId?.length && !f.brandId.includes(line.brandId)) return false;
  if (f.skuId?.length && !f.skuId.includes(line.skuId)) return false;
  return true;
};

/**
 * Construye la foto del período.
 *
 * @param {object} period  de `resolvePeriod`
 * @param {object} filters de §5
 * @returns {{orders, lines, accounts, context}}
 */
export const buildFacts = (period, filters = {}) => {
  const index = catalogIndex();
  const resolveZone = zoneResolver();

  let accounts = [];
  try { accounts = listAccounts(); } catch { accounts = []; }
  const accountsByName = new Map(accounts.map((a) => [a.name, a]));

  // --- unión de orígenes, sin solapamiento ---
  const liveCutoff = LIVE_START.getTime();
  const history = historyOrders
    .filter((o) => new Date(o.date).getTime() < liveCutoff)
    .map(historyOrderFact);
  const live = liveOrderFacts(accountsByName, resolveZone)
    .filter((o) => new Date(o.date).getTime() >= liveCutoff);

  const all = [...history, ...live];

  // --- primera compra por cuenta, sobre TODO el histórico (no sólo el período) ---
  const firstOrderAt = new Map();
  all.forEach((o) => {
    const prev = firstOrderAt.get(o.accountId);
    if (!prev || o.date < prev) firstOrderAt.set(o.accountId, o.date);
  });
  all.forEach((o) => { o.isNewCustomer = firstOrderAt.get(o.accountId) === o.date; });

  // --- recorte al período + filtros ---
  const orders = all
    .filter((o) => inPeriod(o.date, period))
    .filter((o) => passesFilters(o, filters))
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = orders
    .flatMap((o) => o.lines.map((l, i) => lineOf(o, l, i, index)))
    .filter((l) => passesLineFilters(l, filters));

  // Si hay filtro de producto, los pedidos se recortan a los que lo contienen:
  // "ingresos de Calzado" no puede sumar pedidos sin calzado.
  const hasLineFilter = Boolean(filters.categoryId?.length || filters.brandId?.length || filters.skuId?.length);
  const orderIdsWithLines = new Set(lines.map((l) => l.orderId));
  const scopedOrders = hasLineFilter ? orders.filter((o) => orderIdsWithLines.has(o.id)) : orders;

  return {
    period,
    orders: scopedOrders,
    lines,
    accounts,
    context: {
      allOrders: all,
      firstOrderAt,
      historyAccounts,
      marketingSpend: marketingSpendFor(period),
      createdInPeriod: createdOrdersIn(period),
      hasLineFilter,
      // Contexto de otros módulos, leído una sola vez con el resto de la foto:
      // así ninguna métrica consulta por su cuenta y todas ven lo mismo (§6.1).
      logistics: logisticsContext(period),
      inventory: inventoryContext(),
      marketing: marketingContext(period),
    },
  };
};

/* --------------------------------------------- contexto de otros módulos */

function logisticsContext(period) {
  try {
    const shipments = listShipments();
    const incidents = listIncidents();
    const withIncident = new Set(incidents.map((i) => i.shipmentId));
    const inWindow = shipments.filter((s) => inPeriod(s.dispatchedAt || s.createdAt, period));
    return {
      shipments: inWindow,
      dispatched: inWindow.filter((s) => s.dispatchedAt),
      delivered: inWindow.filter((s) => s.deliveredAt),
      withIncident: inWindow.filter((s) => withIncident.has(s.id)),
      incidents,
    };
  } catch {
    return { shipments: [], dispatched: [], delivered: [], withIncident: [], incidents: [] };
  }
}

/** Inventario es una **foto de hoy**, no del período: el stock no tiene historia. */
function inventoryContext() {
  try {
    const skus = getStockGroupedBySku();
    return {
      skus,
      value: skus.reduce((s, g) => s + g.onHand * (g.cost || 0), 0),
      outOfStock: skus.filter((g) => g.available <= 0).length,
      isSnapshot: true,
    };
  } catch {
    return { skus: [], value: 0, outOfStock: 0, isSnapshot: true };
  }
}

function marketingContext(period) {
  try {
    const campaigns = listCampaigns().filter((c) => !c.launchedAt || inPeriod(c.launchedAt, period));
    const agg = campaigns.reduce(
      (acc, c) => {
        const m = c.metrics || {};
        acc.sent += m.sent || 0;
        acc.delivered += m.delivered || 0;
        acc.opened += m.opened || 0;
        acc.clicked += m.clicked || 0;
        acc.conversions += m.conversions || 0;
        acc.revenue += m.revenue || 0;
        acc.cost += m.cost || 0;
        return acc;
      },
      { sent: 0, delivered: 0, opened: 0, clicked: 0, conversions: 0, revenue: 0, cost: 0 }
    );
    const carts = listAbandonedCarts();
    return {
      campaigns, ...agg,
      cartsWithRecovery: carts.filter((c) => c.recoveryCampaignId || c.recoveryCampaignName).length,
      cartsRecovered: carts.filter((c) => c.status === "recuperado").length,
    };
  } catch {
    return { campaigns: [], sent: 0, delivered: 0, opened: 0, clicked: 0, conversions: 0, revenue: 0, cost: 0, cartsWithRecovery: 0, cartsRecovered: 0 };
  }
}

/* ---------------------------------------------------- contexto adicional */

/**
 * Inversión de marketing del período — el numerador del CAC.
 * Meses históricos: `historyMarketingSpend`. Meses vivos: los gastos de
 * categoría `marketing` que carga Finanzas.
 */
function marketingSpendFor(period) {
  let total = 0;

  Object.entries(historyMarketingSpend).forEach(([month, amount]) => {
    const mid = new Date(`${month}-15T12:00:00`);
    if (inPeriod(mid, period)) total += amount;
  });

  try {
    listExpenses({ category: "marketing" }).forEach((e) => {
      if (inPeriod(e.date, period)) total += e.amount;
    });
  } catch {
    /* Finanzas no disponible: queda sólo el aporte histórico. */
  }

  return total;
}

/** Pedidos **creados** en el período — denominador de la conversión de checkout. */
function createdOrdersIn(period) {
  try {
    const cutoff = LIVE_START.getTime();
    const live = listOrders()
      .filter((o) => new Date(o.createdAt).getTime() >= cutoff)
      .filter((o) => inPeriod(o.createdAt, period));
    const history = historyOrders
      .filter((o) => new Date(o.date).getTime() < cutoff)
      .filter((o) => inPeriod(o.date, period));
    return { total: live.length + history.length, live: live.length };
  } catch {
    return { total: 0, live: 0 };
  }
}
