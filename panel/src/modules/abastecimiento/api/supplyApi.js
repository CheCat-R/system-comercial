/**
 * Única puerta de entrada de la UI de Abastecimiento. Nada en `modules/abastecimiento/*.jsx`
 * importa `data/*.mock.js` directo — mismo criterio que `clientsApi.js` e `inventoryApi.js`.
 * Migrar a backend Laravel = reescribir sólo este archivo.
 *
 * Las únicas llamadas que cruzan a Inventario son de **lectura** (`getStockLevels`, `listSkus`,
 * `listWarehouses`, `listTransfers` — para el motor de Reposición del §3.6) más una de **escritura**:
 * `receiveGoods`, la frontera real documentada en §1 (Abastecimiento nunca toca stock directo,
 * delega el efecto físico de una recepción a Inventario).
 *
 * Estado en memoria: se resetea con un reload completo de la página (igual que los otros módulos).
 */
import { suppliers as seedSuppliers } from "../data/suppliers.mock";
import { supplierSkus as seedSupplierSkus } from "../data/supplierSkus.mock";
import { purchaseOrders as seedOrders } from "../data/purchaseOrders.mock";
import { receipts as seedReceipts } from "../data/receipts.mock";
import { pctReceived, orderTotal } from "../lib/purchaseOrders";
import { emit } from "../../automatizaciones/lib/bus";
import { TODAY, toDayString } from "../lib/time";
// La auditoría es una hoja sin dependencias, igual que el bus: importarla no
// puede crear un ciclo. **Registrar es responsabilidad del módulo dueño**, que es
// el único que sabe qué cambió (MODULO-SEGURIDAD.md §2.7).
import { audit, currentActor } from "../../seguridad/lib/audit";
import { change } from "../../seguridad/lib/diff";
import {
  getSku,
  listSkus as listInventorySkus,
  listWarehouses as listInventoryWarehouses,
  warehouseLabel,
  receiveGoods,
  getStockLevels as getInventoryStockLevels,
  listTransfers as listInventoryTransfers,
} from "../../inventario/api/inventoryApi";

const clone = (x) => JSON.parse(JSON.stringify(x));

let _suppliers = clone(seedSuppliers);
let _supplierSkus = clone(seedSupplierSkus);
let _orders = clone(seedOrders);
let _receipts = clone(seedReceipts);

const _seq = { supplier: _suppliers.length, supplierSku: _supplierSkus.length, order: 2006, receipt: 3004 };

const nowStamp = () => {
  const d = new Date();
  return `${toDayString(TODAY)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------
export const listSuppliers = () => _suppliers;
export const getSupplier = (id) => _suppliers.find((s) => s.id === id) || null;

export const createSupplier = (data) => {
  const supplier = { id: `PROV-${String(++_seq.supplier).padStart(2, "0")}`, isActive: true, ...data };
  _suppliers = [..._suppliers, supplier];
  return supplier;
};

export const updateSupplier = (id, data) => {
  _suppliers = _suppliers.map((s) => (s.id === id ? { ...s, ...data } : s));
  return getSupplier(id);
};

export const toggleSupplierActive = (id) => {
  _suppliers = _suppliers.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s));
  return getSupplier(id);
};

// ---------------------------------------------------------------------------
// Catálogo Proveedor × SKU
// ---------------------------------------------------------------------------
const enrichSupplierSku = (row) => {
  const sku = getSku(row.skuId);
  return { ...row, name: sku?.name || row.skuId, sku: sku?.sku || "" };
};

export const getSupplierCatalog = (supplierId) =>
  _supplierSkus.filter((r) => r.supplierId === supplierId).map(enrichSupplierSku);

export const getPreferredSupplierSku = (skuId) =>
  _supplierSkus.find((r) => r.skuId === skuId && r.isPreferred) || null;

export const getSupplierSkuCost = (supplierId, skuId) => {
  const row = _supplierSkus.find((r) => r.supplierId === supplierId && r.skuId === skuId);
  return row ? row.cost : null;
};

export const createSupplierSku = ({ supplierId, skuId, supplierSku, cost, minOrderQty, isPreferred }) => {
  if (isPreferred) {
    _supplierSkus = _supplierSkus.map((r) => (r.skuId === skuId ? { ...r, isPreferred: false } : r));
  }
  const row = { id: `SS-${String(++_seq.supplierSku).padStart(2, "0")}`, supplierId, skuId, supplierSku, cost: Number(cost), minOrderQty: Number(minOrderQty) || 1, isPreferred: Boolean(isPreferred) };
  _supplierSkus = [..._supplierSkus, row];
  return enrichSupplierSku(row);
};

export const updateSupplierSku = (id, data) => {
  if (data.isPreferred) {
    const current = _supplierSkus.find((r) => r.id === id);
    if (current) _supplierSkus = _supplierSkus.map((r) => (r.skuId === current.skuId ? { ...r, isPreferred: false } : r));
  }
  _supplierSkus = _supplierSkus.map((r) => (r.id === id ? { ...r, ...data } : r));
  return enrichSupplierSku(_supplierSkus.find((r) => r.id === id));
};

export const deleteSupplierSku = (id) => {
  _supplierSkus = _supplierSkus.filter((r) => r.id !== id);
};

// ---------------------------------------------------------------------------
// Órdenes de Compra
// ---------------------------------------------------------------------------
const enrichOrder = (order) => {
  const supplier = getSupplier(order.supplierId);
  return {
    ...order,
    supplierName: supplier?.name || order.supplierId,
    warehouseName: warehouseLabel(order.warehouseId),
    lines: order.lines.map((l) => {
      const sku = getSku(l.skuId);
      return { ...l, name: sku?.name || l.skuId, sku: sku?.sku || "", pending: l.qtyOrdered - l.qtyReceived, subtotal: l.qtyOrdered * l.unitCost };
    }),
    total: orderTotal(order),
    pct: pctReceived(order),
    receipts: _receipts.filter((r) => r.orderId === order.id).map((r) => enrichReceipt(r)),
  };
};

export const listPurchaseOrders = ({ supplierId, status } = {}) =>
  _orders
    .filter((o) => (!supplierId || o.supplierId === supplierId) && (!status || o.status === status))
    .map(enrichOrder)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getPurchaseOrder = (id) => {
  const order = _orders.find((o) => o.id === id);
  return order ? enrichOrder(order) : null;
};

/** El autor sale del actor en contexto, no del literal `"Vos"` de antes. */
export const createPurchaseOrder = ({ supplierId, warehouseId, expectedDate, lines, createdBy = null }) => {
  const cleanLines = lines.filter((l) => l.skuId && Number(l.qtyOrdered) > 0);
  if (!supplierId || !warehouseId || cleanLines.length === 0) {
    throw new Error("Elegí proveedor, depósito destino y al menos una línea con cantidad.");
  }
  const order = {
    id: `OC-${String(++_seq.order).padStart(4, "0")}`,
    supplierId, warehouseId, status: "borrador", origin: "manual",
    createdBy: createdBy || currentActor()?.name || "Sistema",
    createdAt: nowStamp(), sentAt: null, expectedDate: expectedDate || null, closedAt: null,
    lines: cleanLines.map((l) => ({ skuId: l.skuId, qtyOrdered: Number(l.qtyOrdered), unitCost: Number(l.unitCost) || 0, qtyReceived: 0 })),
  };
  _orders = [order, ..._orders];
  audit({
    action: "abastecimiento.crear_oc",
    subject: { type: "purchaseOrder", id: order.id, label: `Orden ${order.id}` },
    changes: [change("Estado", null, "borrador"), change("Líneas", null, order.lines.length, "number")],
    requireActor: true,
  });
  return getPurchaseOrder(order.id);
};

export const updatePurchaseOrderLines = (id, lines) => {
  _orders = _orders.map((o) =>
    o.id === id && o.status === "borrador"
      ? { ...o, lines: lines.filter((l) => l.skuId && Number(l.qtyOrdered) > 0).map((l) => ({ skuId: l.skuId, qtyOrdered: Number(l.qtyOrdered), unitCost: Number(l.unitCost) || 0, qtyReceived: 0 })) }
      : o
  );
  return getPurchaseOrder(id);
};

export const sendPurchaseOrder = (id) => {
  const order = _orders.find((o) => o.id === id);
  if (!order || order.status !== "borrador") throw new Error("Sólo se puede enviar una OC en borrador.");
  if (order.lines.length === 0) throw new Error("Agregá al menos una línea antes de enviar.");
  _orders = _orders.map((o) => (o.id === id ? { ...o, status: "enviada", sentAt: nowStamp() } : o));
  const sent = getPurchaseOrder(id);
  emit("compra.enviada", { type: "purchaseOrder", id }, { poId: id, supplierId: sent.supplierId, total: sent.total ?? 0 });
  return sent;
};

export const cancelPurchaseOrder = (id) => {
  _orders = _orders.map((o) => (o.id === id && o.status === "borrador" ? { ...o, status: "cancelada" } : o));
  return getPurchaseOrder(id);
};

export const closePurchaseOrder = (id) => {
  _orders = _orders.map((o) => (o.id === id && o.status === "recibida" ? { ...o, status: "cerrada", closedAt: nowStamp() } : o));
  return getPurchaseOrder(id);
};

/** `lines`: [{ skuId, qtyReceived }]. Genera la Recepción, mueve stock real vía `inventoryApi`
 * y actualiza el estado de la OC (parcial|recibida) según lo acumulado. */
export const receivePurchaseOrder = (orderId, { lines, receivedBy = null }) => {
  const order = _orders.find((o) => o.id === orderId);
  if (!order || !["enviada", "parcial"].includes(order.status)) {
    throw new Error("Sólo se puede recibir una OC enviada o parcialmente recibida.");
  }

  const receiptLines = [];
  order.lines.forEach((line) => {
    const wanted = lines.find((l) => l.skuId === line.skuId);
    if (!wanted) return;
    const pending = line.qtyOrdered - line.qtyReceived;
    const qty = Math.max(0, Math.min(Number(wanted.qtyReceived) || 0, pending));
    if (qty > 0) {
      line.qtyReceived += qty;
      receiptLines.push({ skuId: line.skuId, qty, unitCost: line.unitCost });
    }
  });

  if (receiptLines.length === 0) throw new Error("Cargá al menos una cantidad a recibir.");

  const receipt = { id: `REC-${String(++_seq.receipt).padStart(4, "0")}`, orderId, warehouseId: order.warehouseId, receivedBy, at: nowStamp(), lines: receiptLines };
  _receipts = [receipt, ..._receipts];

  receiveGoods({ warehouseId: order.warehouseId, lines: receiptLines, refId: receipt.id });

  const allReceived = order.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
  const newStatus = allReceived ? "recibida" : "parcial";
  _orders = _orders.map((o) => (o.id === orderId ? { ...o, status: newStatus, lines: order.lines } : o));

  emit("compra.recibida", { type: "purchaseOrder", id: orderId }, { poId: orderId, supplierId: order.supplierId, lines: receiptLines });
  return { order: getPurchaseOrder(orderId), receipt };
};

export const getOrderIdForReceipt = (receiptId) => _receipts.find((r) => r.id === receiptId)?.orderId || null;

// ---------------------------------------------------------------------------
// Compras (registro derivado — ver §2.2: Compra ≈ Ventas, se genera sola desde cada Recepción)
// ---------------------------------------------------------------------------
const enrichReceipt = (receipt) => {
  const order = _orders.find((o) => o.id === receipt.orderId);
  const supplier = order ? getSupplier(order.supplierId) : null;
  return {
    ...receipt,
    supplierId: order?.supplierId || null,
    supplierName: supplier?.name || "—",
    warehouseName: warehouseLabel(receipt.warehouseId),
    amount: receipt.lines.reduce((s, l) => s + l.qty * l.unitCost, 0),
    units: receipt.lines.reduce((s, l) => s + l.qty, 0),
    lines: receipt.lines.map((l) => ({ ...l, name: getSku(l.skuId)?.name || l.skuId, sku: getSku(l.skuId)?.sku || "" })),
  };
};

export const listPurchases = ({ supplierId, warehouseId } = {}) =>
  _receipts
    .map(enrichReceipt)
    .filter((r) => (!supplierId || r.supplierId === supplierId) && (!warehouseId || r.warehouseId === warehouseId))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

export const getPurchasingSummary = () => {
  const purchases = listPurchases();
  const bySupplier = new Map();
  const bySku = new Map();
  purchases.forEach((p) => {
    bySupplier.set(p.supplierName, (bySupplier.get(p.supplierName) || 0) + p.amount);
    p.lines.forEach((l) => bySku.set(l.name, (bySku.get(l.name) || 0) + l.qty));
  });
  const topSupplier = [...bySupplier.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSku = [...bySku.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    totalAmount: purchases.reduce((s, p) => s + p.amount, 0),
    totalUnits: purchases.reduce((s, p) => s + p.units, 0),
    topSupplier: topSupplier ? { name: topSupplier[0], amount: topSupplier[1] } : null,
    topSku: topSku ? { name: topSku[0], units: topSku[1] } : null,
  };
};

// ---------------------------------------------------------------------------
// KPIs generales / por proveedor
// ---------------------------------------------------------------------------
export const getPortfolioSummary = () => {
  const orders = listPurchaseOrders();
  const openOrders = orders.filter((o) => ["enviada", "parcial"].includes(o.status));
  return {
    activeSuppliers: _suppliers.filter((s) => s.isActive).length,
    openOrders: openOrders.length,
    committedAmount: openOrders.reduce((s, o) => s + o.lines.reduce((ls, l) => ls + l.pending * l.unitCost, 0), 0),
    purchasedTotal: listPurchases().reduce((s, p) => s + p.amount, 0),
  };
};

export const getSupplierAnalytics = (supplierId) => {
  const orders = listPurchaseOrders({ supplierId });
  const purchases = listPurchases({ supplierId });
  return {
    purchasedTotal: purchases.reduce((s, p) => s + p.amount, 0),
    openOrders: orders.filter((o) => ["enviada", "parcial"].includes(o.status)).length,
    ordersCount: orders.length,
    lastPurchaseAt: purchases[0]?.at || null,
  };
};

// ---------------------------------------------------------------------------
// Catálogo (SKU) y Depósitos — de solo lectura, Abastecimiento no es dueño de ninguno de los dos.
// ---------------------------------------------------------------------------
export const listWarehouses = () => listInventoryWarehouses();
export const listSkus = () => listInventorySkus();

// ---------------------------------------------------------------------------
// Reposición — sugerencias calculadas, NUNCA persistidas (ver §3.6 y §6.4). Se recalculan en
// cada visita cruzando `StockLevel` (Inventario, sólo lectura) con `SupplierSku` (este módulo).
// Nunca arma ni envía la OC sola — sólo agrupa por proveedor+depósito para que un humano revise.
// ---------------------------------------------------------------------------
const incomingQty = (skuId, warehouseId) =>
  listInventoryTransfers()
    .filter((t) => t.status === "en_transito" && t.destId === warehouseId)
    .reduce((sum, t) => sum + t.lines.filter((l) => l.skuId === skuId).reduce((s, l) => s + l.qtySent, 0), 0);

export const getReplenishmentSuggestions = ({ warehouseId } = {}) => {
  const levels = getInventoryStockLevels({ warehouseId })
    .filter((l) => ["bajo_minimo", "critico", "agotado"].includes(l.status));

  const items = levels
    .map((level) => {
      const preferred = getPreferredSupplierSku(level.skuId);
      const incoming = incomingQty(level.skuId, level.warehouseId);
      let suggestedQty = Math.max(level.minStock + level.safetyStock - level.onHand - incoming, 0);
      if (preferred && suggestedQty > 0 && preferred.minOrderQty > 0) {
        suggestedQty = Math.ceil(suggestedQty / preferred.minOrderQty) * preferred.minOrderQty;
      }
      const unitCost = preferred?.cost ?? null;
      return {
        skuId: level.skuId, name: level.name, sku: level.sku,
        warehouseId: level.warehouseId, warehouseName: level.warehouseName,
        onHand: level.onHand, minStock: level.minStock, safetyStock: level.safetyStock, status: level.status,
        supplierId: preferred?.supplierId || null,
        supplierName: preferred ? getSupplier(preferred.supplierId)?.name : null,
        suggestedQty, unitCost, estimatedCost: unitCost != null ? suggestedQty * unitCost : null,
      };
    })
    .filter((item) => item.suggestedQty > 0);

  const groups = new Map();
  items.forEach((item) => {
    const key = item.supplierId ? `${item.supplierId}::${item.warehouseId}` : `__unassigned__::${item.warehouseId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, supplierId: item.supplierId, supplierName: item.supplierName || "Sin proveedor asignado",
        warehouseId: item.warehouseId, warehouseName: item.warehouseName,
        items: [], totalEstimated: 0,
      });
    }
    const g = groups.get(key);
    g.items.push(item);
    g.totalEstimated += item.estimatedCost || 0;
  });

  return Array.from(groups.values()).sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1));
};

export const getReplenishmentSummary = () => {
  const groups = getReplenishmentSuggestions();
  const items = groups.flatMap((g) => g.items);
  return {
    belowMin: items.filter((i) => i.status === "bajo_minimo").length,
    critical: items.filter((i) => i.status === "critico" || i.status === "agotado").length,
    estimatedTotal: items.reduce((s, i) => s + (i.estimatedCost || 0), 0),
  };
};
