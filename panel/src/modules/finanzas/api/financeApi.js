/**
 * Única puerta de entrada de la UI de Finanzas.
 *
 * Finanzas **no posee** las transacciones: lee Pedidos (ingresos), Inventario (`SKU.cost` → COGS),
 * Logística (`getShipmentCost` → costo de envío real), Facturación (la NC de una devolución) y el
 * CRM (canal / vendedor), y **calcula** el P&L. Sus únicas entidades propias son **Gastos**,
 * **Tarifas de comisión** + su devengado, y la cola de **Reembolsos** (Fase 3).
 * Ver docs/MODULO-FINANZAS-FACTURACION.md §2 / §9.
 *
 * Estado en memoria: se resetea con un reload completo de la página.
 */
import { listOrders, confirmRefund as pedidoConfirmRefund, rejectRefund as pedidoRejectRefund } from "../../pedidos/api/pedidosApi";
import { getSku, warehouseLabel } from "../../inventario/api/inventoryApi";
import { getShipmentCost } from "../../logistica/api/logisticaApi";
import { getInvoiceForOrder } from "../../facturacion/api/billingApi";
import { listAccounts } from "../../clientes/api/clientsApi";
import { emptyPnl, addPnl, contributionMargin, grossMargin, marginPct } from "../lib/pnl";
import { monthKey, nowStamp } from "../lib/time";
import { expenses as seedExpenses } from "../data/expenses.mock";
import { commissionRates as seedRates } from "../data/commissions.mock";
import { emit } from "../../automatizaciones/lib/bus";
// El registro de puertos es una hoja sin dependencias: importarlo no crea un
// ciclo y Finanzas no aprende qué es una integración
// (docs/MODULO-INTEGRACIONES.md §1.4).
import { port } from "../../integraciones/lib/ports";
// Hoja sin dependencias, como el bus: registrar es del módulo dueño (§2.7).
import { audit, currentActor } from "../../seguridad/lib/audit";
import { sensitive } from "../../seguridad/lib/gate";
import { change, diffOf } from "../../seguridad/lib/diff";

const clone = (x) => JSON.parse(JSON.stringify(x));

let _expenses = clone(seedExpenses);
let _rates = clone(seedRates);
let _refunds = []; // se materializan solos desde los pedidos "Reembolso pendiente"
let _settlements = [];
const _seq = { expense: seedExpenses.length, refund: 0, settlement: 0 };

const COMPLETED = ["Despachado", "Entregado"];

const accountByName = (name) =>
  listAccounts().find((a) => a.name.trim().toLowerCase() === (name || "").trim().toLowerCase()) || null;

const channelOf = (order) => (accountByName(order.customerName)?.type === "company" ? "Mayorista B2B" : "Tienda web");

const isReturned = (o) =>
  o.fulfillmentStatus === "Devuelto" || ["Reembolsado", "Reembolso pendiente"].includes(o.paymentStatus);
const isRealized = (o) => COMPLETED.includes(o.fulfillmentStatus) || isReturned(o);
const paidOrders = () =>
  listOrders().filter((o) => ["Pagado", "Reembolsado", "Reembolso pendiente"].includes(o.paymentStatus));

// ---------------------------------------------------------------------------
// Tarifas de comisión (§9.4) — el P&L las lee en vivo
// ---------------------------------------------------------------------------
const gatewayRateFor = (method) => {
  const m = (method || "").toLowerCase();
  const hit = _rates.find((r) => r.kind === "pasarela" && r.key !== "__default__" && m.includes(r.key));
  return hit || _rates.find((r) => r.key === "__default__") || { percent: 0, label: "—" };
};

/**
 * ⭐ La comisión del cobro, por el puerto `payments.fee`.
 *
 * **Antes esto era acoplamiento directo a un proveedor**: la tabla de tarifas
 * guarda `key: "mercadopago"` y `gatewayRateFor` la resolvía **matcheando por
 * substring contra `order.paymentMethod`**, que es texto libre
 * (`"MercadoPago (Visa •••• 4242)"`). O sea, el núcleo financiero conocía el
 * nombre comercial de una pasarela y lo buscaba dentro de una cadena.
 *
 * Ahora Finanzas hace la pregunta correcta —"¿qué comisión cobró este cobro?"—
 * y quién la contesta es configuración. **El `fallback` es la tabla local de
 * siempre**, así que sin proveedor los números son idénticos a los de antes;
 * eso es justamente lo que se verifica al implementar esta fase.
 *
 * Sigue usando `gatewayRateFor` adentro, y está bien: esa tabla pasa a ser la
 * implementación local del puerto, no el criterio del módulo.
 */
const feePort = port("payments.fee", {
  fallback: ({ total, paymentMethod }) => {
    const rate = gatewayRateFor(paymentMethod);
    return { amount: Math.round(total * rate.percent), label: rate.label, percent: rate.percent };
  },
});

const gatewayFeeOf = (order) =>
  feePort({ orderId: order.id, total: order.total, paymentMethod: order.paymentMethod });

const sellerOf = (order) => {
  const acc = accountByName(order.customerName);
  if (!acc || acc.type !== "company") return null;
  const rate = _rates.find((r) => r.kind === "vendedor" && r.key === acc.ownerUserId);
  return rate ? { id: acc.ownerUserId, label: rate.label, percent: rate.percent } : null;
};

// ---------------------------------------------------------------------------
// P&L por pedido
// ---------------------------------------------------------------------------
const orderPnl = (order) => {
  const returned = isReturned(order);
  const dispatched = COMPLETED.includes(order.fulfillmentStatus);
  // El descuento de Marketing es margen sacrificado — reduce el ingreso neto, no es un costo
  // (docs/MODULO-MARKETING.md §6.4).
  const discount = order.discount || 0;
  const revenueNet = returned ? 0 : order.subtotal - discount + order.shipping;
  const seller = sellerOf(order);

  return {
    ...emptyPnl(),
    revenueNet,
    cogs: dispatched && !returned
      ? order.items.reduce((s, it) => s + (getSku(it.skuId)?.cost || 0) * it.qty, 0)
      : 0,
    shippingCost: getShipmentCost(order.id) || 0,
    shippingCharged: order.shipping,
    gatewayFee: gatewayFeeOf(order).amount,
    sellerCommission: seller ? Math.round(revenueNet * seller.percent) : 0,
  };
};

const enrichOrderPnl = (order) => {
  const p = orderPnl(order);
  const seller = sellerOf(order);
  return {
    id: order.id,
    orderId: order.id,
    customerName: order.customerName,
    channel: channelOf(order),
    seller: seller?.label || null,
    warehouseId: order.warehouseId,
    warehouseName: order.warehouseName,
    date: order.paidAt,
    paymentMethod: order.paymentMethod,
    gatewayLabel: gatewayFeeOf(order).label,
    returned: isReturned(order),
    subtotal: order.subtotal,
    discount: order.discount || 0,
    couponCode: order.couponCode || null,
    items: order.items,
    ...p,
    grossMargin: grossMargin(p),
    contributionMargin: contributionMargin(p),
    marginPct: marginPct(p),
    shippingMargin: p.shippingCharged - p.shippingCost,
  };
};

export const getOrderPnlList = ({ month } = {}) =>
  paidOrders()
    .filter(isRealized)
    .filter((o) => !month || monthKey(o.paidAt) === month)
    .map(enrichOrderPnl)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

export const getOrderPnl = (orderId) => {
  const order = listOrders().find((o) => o.id === orderId);
  return order ? enrichOrderPnl(order) : null;
};

// ---------------------------------------------------------------------------
// Resumen / cascada de P&L
// ---------------------------------------------------------------------------
export const getPnlSummary = ({ month } = {}) => {
  const list = getOrderPnlList({ month });
  const agg = list.reduce((acc, r) => addPnl(acc, r), emptyPnl());
  const gross = agg.revenueNet - agg.cogs;
  const cm = gross - agg.shippingCost - agg.gatewayFee - agg.sellerCommission + agg.adjustments;
  const operatingExpenses = _expenses
    .filter((e) => !month || monthKey(e.date) === month)
    .reduce((s, e) => s + e.amount, 0);
  const discountsGiven = list.filter((r) => !r.returned).reduce((s, r) => s + (r.discount || 0), 0);

  return {
    ...agg,
    orders: list.length,
    returnedOrders: list.filter((r) => r.returned).length,
    discountsGiven,
    grossMargin: gross,
    grossMarginPct: agg.revenueNet ? gross / agg.revenueNet : 0,
    contributionMargin: cm,
    contributionMarginPct: agg.revenueNet ? cm / agg.revenueNet : 0,
    operatingExpenses,
    netResult: cm - operatingExpenses,
    avgTicket: list.length ? agg.revenueNet / list.length : 0,
  };
};

export const getPnlWaterfall = ({ month } = {}) => {
  const s = getPnlSummary({ month });
  return [
    { key: "revenue", label: "Ingresos netos", amount: s.revenueNet, kind: "start" },
    { key: "cogs", label: "Costo de mercadería (COGS)", amount: -s.cogs, kind: "cost" },
    { key: "grossMargin", label: "Margen bruto", amount: s.grossMargin, pct: s.grossMarginPct, kind: "subtotal" },
    { key: "shipping", label: "Costo de envío real", amount: -s.shippingCost, kind: "cost" },
    { key: "gateway", label: "Comisiones de pasarela", amount: -s.gatewayFee, kind: "cost" },
    { key: "seller", label: "Comisiones de vendedores", amount: -s.sellerCommission, kind: "cost" },
    { key: "cm", label: "Margen de contribución", amount: s.contributionMargin, pct: s.contributionMarginPct, kind: "subtotal" },
    { key: "opex", label: "Gastos operativos", amount: -s.operatingExpenses, kind: "cost" },
    { key: "net", label: "Resultado", amount: s.netResult, kind: "total" },
  ];
};

// ---------------------------------------------------------------------------
// Rentabilidad por dimensión
// ---------------------------------------------------------------------------
const rollup = (list, keyFn, labelFn) => {
  const map = new Map();
  for (const r of list) {
    const key = keyFn(r);
    const g = map.get(key) || { key, label: labelFn(r), orders: 0, revenueNet: 0, cogs: 0, shippingCost: 0, gatewayFee: 0, contributionMargin: 0 };
    g.orders += 1;
    g.revenueNet += r.revenueNet;
    g.cogs += r.cogs;
    g.shippingCost += r.shippingCost;
    g.gatewayFee += r.gatewayFee;
    g.contributionMargin += r.contributionMargin;
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, marginPct: g.revenueNet ? g.contributionMargin / g.revenueNet : 0, avgTicket: g.orders ? g.revenueNet / g.orders : 0 }))
    .sort((a, b) => b.contributionMargin - a.contributionMargin);
};

const productRollup = (list, { byCategory } = {}) => {
  const map = new Map();
  for (const r of list) {
    if (r.returned) continue;
    const base = r.subtotal || 1;
    for (const it of r.items) {
      const sku = getSku(it.skuId);
      const share = (it.qty * it.unitPrice) / base;
      const lineRev = it.qty * it.unitPrice - (r.discount || 0) * share; // prorratea el descuento del pedido
      const lineCogs = (sku?.cost || 0) * it.qty;
      const alloc = (r.shippingCost + r.gatewayFee + r.sellerCommission) * share;
      const key = byCategory ? sku?.category || "Sin categoría" : it.skuId;
      const label = byCategory ? sku?.category || "Sin categoría" : sku?.name || it.skuId;
      const g = map.get(key) || { key, label, units: 0, revenueNet: 0, cogs: 0, allocatedCost: 0, contributionMargin: 0 };
      g.units += it.qty;
      g.revenueNet += lineRev;
      g.cogs += lineCogs;
      g.allocatedCost += alloc;
      g.contributionMargin += lineRev - lineCogs - alloc;
      map.set(key, g);
    }
  }
  return [...map.values()]
    .map((g) => ({ ...g, marginPct: g.revenueNet ? g.contributionMargin / g.revenueNet : 0 }))
    .sort((a, b) => b.contributionMargin - a.contributionMargin);
};

export const DIMENSIONS = [
  { key: "pedido", label: "Por pedido" },
  { key: "producto", label: "Por producto" },
  { key: "categoria", label: "Por categoría" },
  { key: "canal", label: "Por canal" },
  { key: "cliente", label: "Por cliente" },
  { key: "sucursal", label: "Por sucursal" },
];

export const getProfitabilityBy = (dimension, { month } = {}) => {
  const list = getOrderPnlList({ month });
  switch (dimension) {
    case "pedido": return list;
    case "producto": return productRollup(list);
    case "categoria": return productRollup(list, { byCategory: true });
    case "canal": return rollup(list, (r) => r.channel, (r) => r.channel);
    case "cliente": return rollup(list, (r) => r.customerName, (r) => r.customerName);
    case "sucursal": return rollup(list, (r) => r.warehouseId, (r) => r.warehouseName);
    default: return list;
  }
};

// ---------------------------------------------------------------------------
// Flujo de fondos
// ---------------------------------------------------------------------------
export const getCashFlow = ({ month } = {}) => {
  const inMonth = paidOrders().filter((o) => !month || monthKey(o.paidAt) === month);
  const cobros = inMonth.reduce((s, o) => s + o.total, 0);
  const comisionPasarela = inMonth.reduce((s, o) => s + Math.round(o.total * gatewayRateFor(o.paymentMethod).percent), 0);
  const reembolsos = listRefunds()
    .filter((r) => r.status === "ejecutado" && (!month || monthKey(r.executedAt) === month))
    .reduce((s, r) => s + r.amount, 0);
  const costoEnvios = getOrderPnlList({ month }).reduce((s, r) => s + r.shippingCost, 0);
  const gastos = _expenses
    .filter((e) => e.status === "pagado" && (!month || monthKey(e.paidAt) === month))
    .reduce((s, e) => s + e.amount, 0);
  const comisionesVendedores = _settlements
    .filter((x) => !month || monthKey(x.settledAt) === month)
    .reduce((s, x) => s + x.amount, 0);
  const salidas = comisionPasarela + reembolsos + costoEnvios + gastos + comisionesVendedores;

  return { cobros, comisionPasarela, reembolsos, costoEnvios, gastos, comisionesVendedores, salidas, neto: cobros - salidas };
};

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export const getFinanceAlerts = () => {
  const alerts = [];
  const pendingRefunds = listRefunds().filter((r) => r.status === "solicitado");
  if (pendingRefunds.length) {
    alerts.push({
      key: "pending-refunds", tone: "warning",
      text: `${pendingRefunds.length} reembolso(s) pendiente(s) de tu aprobación — $${
        Math.round(pendingRefunds.reduce((s, r) => s + r.amount, 0)).toLocaleString("es-AR")
      } sin ejecutar.`,
    });
  }
  const unpaidExpenses = _expenses.filter((e) => e.status === "pendiente");
  if (unpaidExpenses.length) {
    alerts.push({
      key: "unpaid-expenses", tone: "info",
      text: `${unpaidExpenses.length} gasto(s) pendiente(s) de pago por $${
        Math.round(unpaidExpenses.reduce((s, e) => s + e.amount, 0)).toLocaleString("es-AR")
      }.`,
    });
  }
  const pagadoSinDespachar = listOrders().filter((o) => o.paymentStatus === "Pagado" && o.fulfillmentStatus === "Sin despachar");
  if (pagadoSinDespachar.length) {
    alerts.push({
      key: "pending-fulfillment", tone: "info",
      text: `${pagadoSinDespachar.length} pedido(s) con el pago cobrado y el despacho pendiente.`,
    });
  }
  return alerts;
};

export const getAvailableMonths = () => {
  const fromOrders = paidOrders().map((o) => monthKey(o.paidAt));
  const fromExpenses = _expenses.map((e) => monthKey(e.date));
  return [...new Set([...fromOrders, ...fromExpenses])].sort().reverse();
};

// ---------------------------------------------------------------------------
// Gastos (§9.3)
// ---------------------------------------------------------------------------
const enrichExpense = (e) => ({ ...e, costCenterName: e.costCenter === "global" ? "Toda la empresa" : warehouseLabel(e.costCenter) });

export const listExpenses = ({ status, category, month } = {}) =>
  _expenses
    .filter((e) => !status || e.status === status)
    .filter((e) => !category || e.category === category)
    .filter((e) => !month || monthKey(e.date) === month)
    .map(enrichExpense)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

export const getExpensesSummary = ({ month } = {}) => {
  const list = listExpenses({ month });
  const byCenter = {};
  for (const e of list) byCenter[e.costCenterName] = (byCenter[e.costCenterName] || 0) + e.amount;
  const topCenter = Object.entries(byCenter).sort((a, b) => b[1] - a[1])[0];
  return {
    total: list.reduce((s, e) => s + e.amount, 0),
    pending: list.filter((e) => e.status === "pendiente").reduce((s, e) => s + e.amount, 0),
    pendingCount: list.filter((e) => e.status === "pendiente").length,
    recurring: _expenses.filter((e) => e.recurrence !== "unico").length,
    topCenter: topCenter ? { name: topCenter[0], amount: topCenter[1] } : null,
  };
};

export const createExpense = (data) => {
  const expense = {
    id: `GTO-${String(++_seq.expense).padStart(3, "0")}`,
    category: data.category || "otros",
    description: data.description?.trim() || "Gasto sin descripción",
    amount: Math.max(0, Math.round(Number(data.amount) || 0)),
    date: data.date || nowStamp(),
    recurrence: data.recurrence || "unico",
    costCenter: data.costCenter || "global",
    account: data.account || "banco",
    status: data.status === "pagado" ? "pagado" : "pendiente",
    paidAt: data.status === "pagado" ? nowStamp() : null,
    createdAt: nowStamp(),
  };
  _expenses = [expense, ..._expenses];
  emit("gasto.creado", { type: "document", id: expense.id }, { expenseId: expense.id, category: expense.category, amount: expense.amount });
  audit({
    action: "finanzas.gastos",
    subject: { type: "expense", id: expense.id, label: expense.description },
    changes: [
      change("Alta del gasto", null, expense.description),
      change("Importe", null, expense.amount, "money"),
      change("Categoría", null, expense.category),
    ],
    requireActor: true,
  });
  return enrichExpense(expense);
};

export const updateExpense = (id, data) => {
  const before = _expenses.find((e) => e.id === id);
  _expenses = _expenses.map((e) => (e.id === id ? {
    ...e, ...data,
    amount: data.amount != null ? Math.max(0, Math.round(Number(data.amount))) : e.amount,
  } : e));
  const after = _expenses.find((e) => e.id === id);

  // ⭐ El diff compara **sólo los campos declarados auditables**: uno automático
  // sobre el objeto entero registraría ruido y filtraría campos internos.
  const changes = diffOf(before, after, "expense");
  if (changes.length) {
    audit({
      action: "finanzas.gastos",
      subject: { type: "expense", id, label: after.description },
      changes,
      requireActor: true,
    });
  }
  return enrichExpense(after);
};

export const markExpensePaid = (id) => {
  _expenses = _expenses.map((e) => (e.id === id ? { ...e, status: "pagado", paidAt: nowStamp() } : e));
  return enrichExpense(_expenses.find((e) => e.id === id));
};

export const deleteExpense = (id) => {
  const before = _expenses.find((e) => e.id === id);
  _expenses = _expenses.filter((e) => e.id !== id);
  if (before) {
    // Un gasto borrado cambia un P&L que alguien ya miró: el asiento guarda el
    // importe, porque después de esto el gasto no existe para consultarlo.
    audit({
      action: "finanzas.borrar_gasto",
      subject: { type: "expense", id, label: before.description },
      changes: [change("Gasto", `${before.description} · ${before.amount.toLocaleString("es-AR")}`, "borrado")],
      requireActor: true,
    });
  }
};

// ---------------------------------------------------------------------------
// Comisiones (§9.4)
// ---------------------------------------------------------------------------
export const getCommissionRates = () => clone(_rates);

export const updateCommissionRate = (id, patch, { reason } = {}) => {
  const before = _rates.find((r) => r.id === id);
  if (!before) throw new Error("Esa tarifa no existe.");

  return sensitive({
    action: "finanzas.tarifas",
    subject: { type: "rate", id, label: before.label || id },
    reason,
    preview: `${before.label || id}: ${(before.percent * 100).toFixed(2)} % → ${((patch.percent != null ? Number(patch.percent) : before.percent) * 100).toFixed(2)} %`,
    // ⭐ La nota que evita un malentendido caro: cambiar la tarifa no reescribe
    // el pasado. Lo ya devengado queda con la tasa que estaba vigente.
    meta: { alcance: "sólo hacia adelante: lo ya devengado no se recalcula" },
    run: () => {
      _rates = _rates.map((r) => (r.id === id ? { ...r, ...patch, percent: patch.percent != null ? Number(patch.percent) : r.percent } : r));
      const after = _rates.find((r) => r.id === id);
      return { value: getCommissionRates(), changes: diffOf(before, after, "rate") };
    },
  });
};

const settledOrderIds = () => new Set(_settlements.flatMap((s) => s.orderIds));

/** Devengado: pasarela (una por pedido pagado, ya la descontó la pasarela) + vendedor (una por
 * venta B2B concretada, se liquida aparte). */
export const listCommissions = ({ kind } = {}) => {
  const settled = settledOrderIds();
  const rows = [];
  for (const o of paidOrders()) {
    const gwRate = gatewayRateFor(o.paymentMethod);
    if (!kind || kind === "pasarela") {
      rows.push({
        id: `COM-P-${o.id}`, kind: "pasarela", orderId: o.id, customerName: o.customerName,
        base: o.total, rate: gwRate.percent, amount: Math.round(o.total * gwRate.percent),
        rateLabel: gwRate.label, date: o.paidAt, status: "descontada", settlementId: null,
      });
    }
    const seller = sellerOf(o);
    if (seller && isRealized(o) && !isReturned(o) && (!kind || kind === "vendedor")) {
      const base = o.subtotal + o.shipping;
      rows.push({
        id: `COM-V-${o.id}`, kind: "vendedor", orderId: o.id, customerName: o.customerName,
        base, rate: seller.percent, amount: Math.round(base * seller.percent),
        rateLabel: seller.label, sellerId: seller.id, date: o.paidAt,
        status: settled.has(o.id) ? "liquidada" : "devengada",
        settlementId: _settlements.find((s) => s.orderIds.includes(o.id))?.id || null,
      });
    }
  }
  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const getCommissionsSummary = ({ month } = {}) => {
  const all = listCommissions();
  const inMonth = (r) => !month || monthKey(r.date) === month;
  const pasarela = all.filter((r) => r.kind === "pasarela" && inMonth(r));
  const vendedor = all.filter((r) => r.kind === "vendedor" && inMonth(r));
  return {
    pasarelaTotal: pasarela.reduce((s, r) => s + r.amount, 0),
    devengadoVendedores: vendedor.reduce((s, r) => s + r.amount, 0),
    pendienteLiquidar: all.filter((r) => r.kind === "vendedor" && r.status === "devengada").reduce((s, r) => s + r.amount, 0),
  };
};

export const listSettlements = () =>
  _settlements.map((s) => ({ ...s })).sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));

/** Agrupa las comisiones de vendedor devengadas y no liquidadas por vendedor. */
export const getPendingSettlements = () => {
  const map = new Map();
  for (const c of listCommissions({ kind: "vendedor" })) {
    if (c.status !== "devengada") continue;
    const g = map.get(c.sellerId) || { sellerId: c.sellerId, label: c.rateLabel, count: 0, amount: 0, orderIds: [] };
    g.count += 1;
    g.amount += c.amount;
    g.orderIds.push(c.orderId);
    map.set(c.sellerId, g);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
};

export const settleCommissions = (sellerId) => {
  const group = getPendingSettlements().find((g) => g.sellerId === sellerId);
  if (!group || !group.orderIds.length) throw new Error("No hay comisiones pendientes de este vendedor.");
  const settlement = {
    id: `LIQ-${String(++_seq.settlement).padStart(3, "0")}`,
    sellerId, label: group.label, count: group.count, amount: group.amount,
    orderIds: [...group.orderIds], settledAt: nowStamp(),
  };
  _settlements = [settlement, ..._settlements];
  audit({
    action: "finanzas.liquidar",
    subject: { type: "rate", id: settlement.id, label: `Liquidación ${group.label}` },
    changes: [
      change("Comisiones liquidadas", null, settlement.count, "number"),
      change("Importe", null, settlement.amount, "money"),
    ],
    ref: settlement.id,
    requireActor: true,
  });
  return settlement;
};

// ---------------------------------------------------------------------------
// Reembolsos — cola de aprobación (§9.5). Se materializan solos desde los pedidos que Logística
// dejó en "Reembolso pendiente"; el Pedido no pasa a "Reembolsado" hasta la aprobación (§6.11).
// ---------------------------------------------------------------------------
const ensureRefunds = () => {
  for (const o of listOrders()) {
    if (o.paymentStatus !== "Reembolso pendiente") continue;
    if (_refunds.some((r) => r.orderId === o.id && r.status === "solicitado")) continue;
    const nc = getInvoiceForOrder(o.id)?.relatedNotes?.find((n) => n.docType === "nota_credito") || null;
    _refunds = [{
      id: `RMB-${String(++_seq.refund).padStart(3, "0")}`,
      orderId: o.id,
      customerName: o.customerName,
      amount: o.total,
      reason: "Devolución gestionada por Logística (incidencia resuelta como \"devolver\").",
      creditNoteId: nc?.id || null,
      creditNoteLabel: nc ? `NC ${nc.letter} ${nc.fullNumber}` : null,
      requestedBy: "Logística / CX",
      requestedAt: o.returnedAt || nowStamp(),
      method: null, note: "",
      status: "solicitado",
      approvedBy: null, approvedAt: null, executedAt: null,
    }, ..._refunds];
  }
};

const enrichRefund = (r) => ({ ...r });

export const listRefunds = ({ status } = {}) => {
  ensureRefunds();
  return _refunds
    .filter((r) => !status || r.status === status)
    .map(enrichRefund)
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
};

export const getRefund = (id) => {
  ensureRefunds();
  const r = _refunds.find((x) => x.id === id);
  return r ? enrichRefund(r) : null;
};

export const getRefundsSummary = ({ month } = {}) => {
  const all = listRefunds();
  const pending = all.filter((r) => r.status === "solicitado");
  const executed = all.filter((r) => r.status === "ejecutado" && (!month || monthKey(r.executedAt) === month));
  const rejected = all.filter((r) => r.status === "rechazado" && (!month || monthKey(r.approvedAt) === month));
  return {
    pendingCount: pending.length,
    pendingAmount: pending.reduce((s, r) => s + r.amount, 0),
    executedAmount: executed.reduce((s, r) => s + r.amount, 0),
    executedCount: executed.length,
    rejectedCount: rejected.length,
  };
};

/**
 * ⭐ «Solicitado por: Logística / CX» era un texto fijo.
 *
 * El gate de dos pasos existía desde la F3 de Finanzas, pero **sin identidad**:
 * decía el área, no la persona. Ahora quien pide y quien firma son dos actores
 * distintos y verificados, y `approvedBy` deja de ser el literal `"Finanzas"`.
 */
export const approveRefund = (id, { method = "original", note = "", reason } = {}) => {
  ensureRefunds();
  const refund = _refunds.find((r) => r.id === id);
  if (!refund || refund.status !== "solicitado") throw new Error("El reembolso ya fue resuelto.");

  return sensitive({
    action: "finanzas.aprobar_reembolso",
    subject: { type: "order", id: refund.orderId, label: `Pedido #${refund.orderId}` },
    reason,
    ref: id,
    preview: `Devolver $${Math.round(refund.amount).toLocaleString("es-AR")} del pedido #${refund.orderId}`,
    meta: { importe: `$${Math.round(refund.amount).toLocaleString("es-AR")}`, medio: method },
    revalidate: () => {
      const now = _refunds.find((r) => r.id === id);
      if (!now) return "Ese reembolso ya no existe.";
      if (now.status !== "solicitado") return `El reembolso ya está ${now.status}.`;
      return null;
    },
    run: () => {
      pedidoConfirmRefund(refund.orderId);
      _refunds = _refunds.map((r) => (r.id === id ? {
        ...r, status: "ejecutado", method, note: note.trim(),
        approvedBy: currentActor()?.name || "—", approvedAt: nowStamp(), executedAt: nowStamp(),
      } : r));
      emit("reembolso.aprobado", { type: "order", id: refund.orderId }, { orderId: refund.orderId, amount: refund.amount });
      return {
        value: getRefund(id),
        changes: [
          change("Estado del reembolso", "solicitado", "ejecutado"),
          change("Importe devuelto", null, refund.amount, "money"),
        ],
      };
    },
  });
};

export const rejectRefund = (id, { note = "", reason } = {}) => {
  ensureRefunds();
  const refund = _refunds.find((r) => r.id === id);
  if (!refund || refund.status !== "solicitado") throw new Error("El reembolso ya fue resuelto.");

  return sensitive({
    action: "finanzas.rechazar_reembolso",
    subject: { type: "order", id: refund.orderId, label: `Pedido #${refund.orderId}` },
    reason: reason || note,
    ref: id,
    preview: `No devolver los $${Math.round(refund.amount).toLocaleString("es-AR")} del pedido #${refund.orderId}`,
    run: () => {
      pedidoRejectRefund(refund.orderId);
      _refunds = _refunds.map((r) => (r.id === id ? {
        ...r, status: "rechazado", note: note.trim(), approvedBy: currentActor()?.name || "—", approvedAt: nowStamp(),
      } : r));
      emit("reembolso.rechazado", { type: "order", id: refund.orderId }, { orderId: refund.orderId, reason: note.trim() });
      return { value: getRefund(id), changes: [change("Estado del reembolso", "solicitado", "rechazado")] };
    },
  });
};
