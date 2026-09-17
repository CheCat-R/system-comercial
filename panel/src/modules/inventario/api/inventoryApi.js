/**
 * Única puerta de entrada de la UI de Inventario. Nada en `modules/inventario/*.jsx` importa
 * `data/*.mock.js` directo — ver docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §4.13 (regla dura,
 * mismo criterio que `modules/clientes/api/clientsApi.js`). Migrar a backend Laravel = reescribir
 * sólo este archivo.
 *
 * Estado en memoria: se resetea con un reload completo de la página (comportamiento esperado
 * en esta etapa mock).
 */
import { branches as seedBranches, warehouses as seedWarehouses } from "../data/branches.mock";
import { skus as seedSkus } from "../data/skus.mock";
import { stockLevels as seedStockLevels } from "../data/stockLevels.mock";
import { movements as seedMovements } from "../data/movements.mock";
import { adjustments as seedAdjustments } from "../data/adjustments.mock";
import { transfers as seedTransfers } from "../data/transfers.mock";
import { physicalCounts as seedPhysicalCounts } from "../data/physicalCounts.mock";
import { available, stockStatusKey, worstStatusKey } from "../lib/stock";
import { ADJUSTMENT_REASONS } from "../lib/movements";
import { emit } from "../../automatizaciones/lib/bus";
import { TODAY, toDayString } from "../lib/time";
// La auditoría es una hoja sin dependencias, igual que el bus: importarla no
// puede crear un ciclo. **Registrar es responsabilidad del módulo dueño**, que es
// el único que sabe qué cambió (MODULO-SEGURIDAD.md §2.7).
import { currentActor } from "../../seguridad/lib/audit";
import { change } from "../../seguridad/lib/diff";
import { sensitive } from "../../seguridad/lib/gate";
import { escalate, THRESHOLDS } from "../../seguridad/lib/permissions";

const clone = (x) => JSON.parse(JSON.stringify(x));

let _branches = clone(seedBranches);
let _warehouses = clone(seedWarehouses);
const _skus = clone(seedSkus);
let _stockLevels = clone(seedStockLevels);
let _movements = clone(seedMovements);
let _adjustments = clone(seedAdjustments);
let _transfers = clone(seedTransfers);
let _counts = clone(seedPhysicalCounts);

let _seq = { branch: _branches.length, warehouse: _warehouses.length, mov: _movements.length, adj: _adjustments.length, transfer: _transfers.length, count: _counts.length };

const nowStamp = () => {
  const d = new Date();
  return `${toDayString(TODAY)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Sucursales y Depósitos
// ---------------------------------------------------------------------------
export const listBranches = () => _branches;
export const getBranch = (id) => _branches.find((b) => b.id === id) || null;

export const listWarehouses = (branchId) =>
  branchId ? _warehouses.filter((w) => w.branchId === branchId) : _warehouses;

export const getWarehouse = (id) => _warehouses.find((w) => w.id === id) || null;

export const warehouseLabel = (id) => {
  const w = getWarehouse(id);
  if (!w) return "—";
  const b = getBranch(w.branchId);
  return `${w.name}${b ? ` · ${b.name}` : ""}`;
};

export const createBranch = ({ name, address }) => {
  const branch = { id: `SUC-${String(++_seq.branch).padStart(2, "0")}`, name, address, isActive: true };
  _branches = [..._branches, branch];
  return branch;
};

export const updateBranch = (id, data) => {
  _branches = _branches.map((b) => (b.id === id ? { ...b, ...data } : b));
  return getBranch(id);
};

export const toggleBranchActive = (id) => {
  _branches = _branches.map((b) => (b.id === id ? { ...b, isActive: !b.isActive } : b));
  return getBranch(id);
};

export const createWarehouse = ({ branchId, name, type }) => {
  const warehouse = { id: `DEP-${String(++_seq.warehouse).padStart(2, "0")}`, branchId, name, type, isActive: true };
  _warehouses = [..._warehouses, warehouse];
  return warehouse;
};

export const updateWarehouse = (id, data) => {
  _warehouses = _warehouses.map((w) => (w.id === id ? { ...w, ...data } : w));
  return getWarehouse(id);
};

export const toggleWarehouseActive = (id) => {
  _warehouses = _warehouses.map((w) => (w.id === id ? { ...w, isActive: !w.isActive } : w));
  return getWarehouse(id);
};

// ---------------------------------------------------------------------------
// Catálogo (SKU) — espejo liviano, ver data/skus.mock.js
// ---------------------------------------------------------------------------
export const listSkus = () => _skus;
export const getSku = (id) => _skus.find((s) => s.id === id) || null;

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------
const enrichLevel = (level) => {
  const sku = getSku(level.skuId);
  const warehouse = getWarehouse(level.warehouseId);
  const branch = warehouse ? getBranch(warehouse.branchId) : null;
  return {
    ...level,
    name: sku?.name || level.skuId,
    sku: sku?.sku || "",
    category: sku?.category || "",
    cost: sku?.cost || 0,
    warehouseName: warehouse?.name || level.warehouseId,
    warehouseType: warehouse?.type || "venta",
    branchId: warehouse?.branchId || null,
    branchName: branch?.name || "",
    available: available(level),
    status: stockStatusKey(level),
  };
};

/** Filas SKU × Depósito, enriquecidas y filtradas. */
export const getStockLevels = ({ branchId, warehouseId, search, status } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _stockLevels
    .map(enrichLevel)
    .filter((row) => {
      if (branchId && row.branchId !== branchId) return false;
      if (warehouseId && row.warehouseId !== warehouseId) return false;
      if (status && row.status !== status) return false;
      if (q && !(row.name.toLowerCase().includes(q) || row.sku.toLowerCase().includes(q))) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.warehouseName.localeCompare(b.warehouseName));
};

/** Igual que `getStockLevels`, pero consolidado por SKU con desglose por depósito. */
export const getStockGroupedBySku = (filters = {}) => {
  const rows = getStockLevels(filters);
  const bySku = new Map();
  rows.forEach((row) => {
    if (!bySku.has(row.skuId)) {
      bySku.set(row.skuId, {
        skuId: row.skuId, id: row.skuId, name: row.name, sku: row.sku, category: row.category, cost: row.cost,
        onHand: 0, reserved: 0, minStock: 0, safetyStock: 0, breakdown: [],
      });
    }
    const g = bySku.get(row.skuId);
    g.onHand += row.onHand;
    g.reserved += row.reserved;
    g.minStock += row.minStock;
    g.safetyStock += row.safetyStock;
    g.breakdown.push(row);
  });
  return Array.from(bySku.values()).map((g) => ({
    ...g,
    available: Math.max(g.onHand - g.reserved, 0),
    status: worstStatusKey(g.breakdown),
  }));
};

export const getPortfolioSummary = () => {
  const rows = getStockLevels();
  return {
    totalValue: rows.reduce((sum, r) => sum + r.onHand * r.cost, 0),
    belowMin: rows.filter((r) => r.status === "bajo_minimo" || r.status === "critico").length,
    outOfStock: rows.filter((r) => r.status === "agotado").length,
    totalReserved: rows.reduce((sum, r) => sum + r.reserved, 0),
  };
};

export const setThresholds = (skuId, warehouseId, { minStock, safetyStock }) => {
  _stockLevels = _stockLevels.map((l) =>
    l.skuId === skuId && l.warehouseId === warehouseId ? { ...l, minStock, safetyStock } : l
  );
  return enrichLevel(_stockLevels.find((l) => l.skuId === skuId && l.warehouseId === warehouseId));
};

export const setThresholdsBulk = (pairs, { minStock, safetyStock }) => {
  const keys = new Set(pairs.map((p) => `${p.skuId}::${p.warehouseId}`));
  _stockLevels = _stockLevels.map((l) =>
    keys.has(`${l.skuId}::${l.warehouseId}`) ? { ...l, minStock, safetyStock } : l
  );
};

const findLevel = (skuId, warehouseId) => {
  let level = _stockLevels.find((l) => l.skuId === skuId && l.warehouseId === warehouseId);
  if (!level) {
    level = { skuId, warehouseId, onHand: 0, reserved: 0, minStock: 0, safetyStock: 0 };
    _stockLevels = [..._stockLevels, level];
  }
  return level;
};

// ---------------------------------------------------------------------------
// Movimientos (kardex — append-only)
// ---------------------------------------------------------------------------
const pushMovement = ({ skuId, warehouseId, type, qty, counter = "onHand", refType, refId }) => {
  const level = findLevel(skuId, warehouseId);
  const balanceAfter = counter === "reserved" ? level.reserved : level.onHand;
  const movement = {
    id: `MOV-${String(++_seq.mov).padStart(4, "0")}`,
    skuId, warehouseId, type, qty, counter, balanceAfter,
    refType: refType || null, refId: refId || null,
    at: nowStamp(),
  };
  _movements = [movement, ..._movements];
  return movement;
};

export const getMovements = ({ skuId, warehouseId, type, search } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _movements
    .map((m) => {
      const sku = getSku(m.skuId);
      return { ...m, name: sku?.name || m.skuId, sku: sku?.sku || "", warehouseName: warehouseLabel(m.warehouseId) };
    })
    .filter((m) => {
      if (skuId && m.skuId !== skuId) return false;
      if (warehouseId && m.warehouseId !== warehouseId) return false;
      if (type && m.type !== type) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))) return false;
      return true;
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at));
};

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------
export const listAdjustments = () =>
  _adjustments
    .map((a) => ({ ...a, warehouseName: warehouseLabel(a.warehouseId), netQty: a.lines.reduce((s, l) => s + l.delta, 0) }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

export const getAdjustment = (id) => {
  const a = _adjustments.find((x) => x.id === id);
  if (!a) return null;
  return {
    ...a,
    warehouseName: warehouseLabel(a.warehouseId),
    lines: a.lines.map((l) => ({ ...l, name: getSku(l.skuId)?.name || l.skuId, sku: getSku(l.skuId)?.sku || "" })),
  };
};

/**
 * ⭐ El autor ya no es el literal `"Vos"`.
 *
 * Era el ejemplo más claro de lo que Seguridad vino a arreglar: el campo existía,
 * tenía un valor por defecto escrito a mano, y nadie le pasaba nunca el usuario
 * real. Ahora sale del actor en contexto — que puede ser una persona, una
 * automatización o una integración.
 */
/**
 * ⭐ Cuánto vale, en plata, lo que este ajuste hace aparecer o desaparecer.
 *
 * Es lo que decide si el ajuste sigue siendo una corrección o ya es una
 * pérdida: **el mismo formulario cambia de grado según el número que se
 * escriba**. Se valoriza al costo, en valor absoluto — perder 30 unidades y
 * encontrar 30 son las dos cosas que hay que poder explicar.
 */
export const valueOfAdjustment = (lines = []) =>
  lines.reduce((sum, l) => sum + Math.abs(Number(l.delta) || 0) * (getSku(l.skuId)?.cost || 0), 0);

export const createAdjustment = ({ warehouseId, reason, detail = "", lines, createdBy = null }) => {
  const cleanLines = lines.filter((l) => l.skuId && Number(l.delta) !== 0);
  if (!warehouseId || cleanLines.length === 0) {
    throw new Error("El ajuste necesita un depósito y al menos una línea con cantidad distinta de cero.");
  }

  // ⭐ El grado no depende sólo de qué operación es, sino de cuánto duele esta
  // vez. Cuánto es "mucho" lo declara Seguridad (`THRESHOLDS.ajuste`); si el
  // umbral viviera acá, moverlo sería bajarle el control sin que nadie se entere.
  const value = valueOfAdjustment(cleanLines);
  const action = escalate("ajuste", value > THRESHOLDS.ajuste.amount);

  // ⭐ El motivo tipificado no alcanza como motivo.
  //
  // «Rotura» dice la categoría, no el hecho: dentro de seis meses nadie va a
  // poder reconstruir qué pasó. El kardex se queda con el código —que es lo que
  // agrupa y reporta— y la auditoría se queda con la frase.
  const reasonText = [ADJUSTMENT_REASONS[reason] || reason, String(detail || "").trim()]
    .filter(Boolean).join(" — ");

  return sensitive({
    action,
    subject: { type: "sku", id: cleanLines[0].skuId, label: `Ajuste en ${warehouseLabel(warehouseId)}` },
    reason: reasonText,
    preview: `${cleanLines.length} línea(s) en ${warehouseLabel(warehouseId)}, valorizadas en $${Math.round(value).toLocaleString("es-AR")}`,
    meta: { deposito: warehouseLabel(warehouseId), valorizacion: `$${Math.round(value).toLocaleString("es-AR")}` },
    run: () => {
      const author = createdBy || currentActor()?.name || "Sistema";
      const adjustment = { id: `AJU-${String(++_seq.adj).padStart(3, "0")}`, warehouseId, reason, createdBy: author, at: nowStamp(), lines: cleanLines };
      _adjustments = [adjustment, ..._adjustments];

      cleanLines.forEach((line) => {
        const level = findLevel(line.skuId, warehouseId);
        level.onHand = Math.max(level.onHand + Number(line.delta), 0);
        pushMovement({
          skuId: line.skuId,
          warehouseId,
          type: line.delta > 0 ? "ajuste_pos" : "ajuste_neg",
          qty: line.delta,
          refType: "adjustment",
          refId: adjustment.id,
        });
        emit("stock.ajustado", { type: "sku", id: line.skuId }, { skuId: line.skuId, delta: Number(line.delta), reason });
      });

      // ⭐ Un solo asiento, con una línea de cambio por SKU.
      //
      // En F2 esto dejaba **un asiento por SKU**, y estaba mal: un ajuste es
      // *una* operación con *un* motivo, y verla partida en cinco asientos
      // idénticos hace dudar de si fueron cinco ajustes. El registro de cambios
      // es por campo, sí — pero los campos son de la operación, no asientos
      // distintos. Ahora lo registra el portón, junto con el motivo y la
      // valorización que decidieron el grado.
      const changes = cleanLines.map((line) => {
        const level = findLevel(line.skuId, warehouseId);
        return change(
          getSku(line.skuId)?.name || line.skuId,
          level.onHand - Number(line.delta),
          level.onHand,
          "number",
        );
      });

      return { value: getAdjustment(adjustment.id), changes };
    },
  });
};

// ---------------------------------------------------------------------------
// Transferencias
// ---------------------------------------------------------------------------
const enrichTransfer = (t) => ({
  ...t,
  originName: warehouseLabel(t.originId),
  destName: warehouseLabel(t.destId),
  lines: t.lines.map((l) => ({ ...l, name: getSku(l.skuId)?.name || l.skuId, sku: getSku(l.skuId)?.sku || "" })),
});

export const listTransfers = () =>
  _transfers.map(enrichTransfer).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getTransfer = (id) => {
  const t = _transfers.find((x) => x.id === id);
  return t ? enrichTransfer(t) : null;
};

export const createTransfer = ({ originId, destId, lines, createdBy = null }) => {
  const cleanLines = lines.filter((l) => l.skuId && Number(l.qtySent) > 0);
  if (!originId || !destId || originId === destId || cleanLines.length === 0) {
    throw new Error("Elegí origen, destino distinto entre sí, y al menos una línea con cantidad.");
  }
  const transfer = {
    id: `TRA-${String(++_seq.transfer).padStart(3, "0")}`,
    originId, destId, status: "borrador", createdBy, createdAt: nowStamp(), sentAt: null, receivedAt: null,
    lines: cleanLines.map((l) => ({ skuId: l.skuId, qtySent: Number(l.qtySent), qtyReceived: null })),
  };
  _transfers = [transfer, ..._transfers];
  return getTransfer(transfer.id);
};

export const updateTransferLines = (id, lines) => {
  _transfers = _transfers.map((t) =>
    t.id === id && t.status === "borrador"
      ? { ...t, lines: lines.filter((l) => l.skuId && Number(l.qtySent) > 0).map((l) => ({ skuId: l.skuId, qtySent: Number(l.qtySent), qtyReceived: null })) }
      : t
  );
  return getTransfer(id);
};

export const sendTransfer = (id) => {
  const transfer = _transfers.find((t) => t.id === id);
  if (!transfer || transfer.status !== "borrador") throw new Error("Sólo se puede enviar una transferencia en borrador.");

  for (const line of transfer.lines) {
    const level = findLevel(line.skuId, transfer.originId);
    if (available(level) < line.qtySent) {
      const sku = getSku(line.skuId);
      throw new Error(`No hay disponible suficiente de "${sku?.name || line.skuId}" en ${warehouseLabel(transfer.originId)}.`);
    }
  }

  transfer.lines.forEach((line) => {
    const level = findLevel(line.skuId, transfer.originId);
    level.onHand -= line.qtySent;
    pushMovement({ skuId: line.skuId, warehouseId: transfer.originId, type: "transfer_out", qty: -line.qtySent, refType: "transfer", refId: transfer.id });
  });

  _transfers = _transfers.map((t) => (t.id === id ? { ...t, status: "en_transito", sentAt: nowStamp() } : t));
  return getTransfer(id);
};

/** `receivedLines`: [{ skuId, qtyReceived }]. Si `qtyReceived` < `qtySent`, la diferencia queda registrada (no se ajusta sola). */
export const receiveTransfer = (id, receivedLines) => {
  const transfer = _transfers.find((t) => t.id === id);
  if (!transfer || transfer.status !== "en_transito") throw new Error("Sólo se puede recibir una transferencia en tránsito.");

  const receivedMap = new Map(receivedLines.map((l) => [l.skuId, Number(l.qtyReceived)]));

  transfer.lines.forEach((line) => {
    const qtyReceived = receivedMap.has(line.skuId) ? receivedMap.get(line.skuId) : line.qtySent;
    line.qtyReceived = qtyReceived;
    if (qtyReceived > 0) {
      const level = findLevel(line.skuId, transfer.destId);
      level.onHand += qtyReceived;
      pushMovement({ skuId: line.skuId, warehouseId: transfer.destId, type: "transfer_in", qty: qtyReceived, refType: "transfer", refId: transfer.id });
    }
  });

  const hasDifference = transfer.lines.some((l) => l.qtyReceived !== l.qtySent);
  _transfers = _transfers.map((t) => (t.id === id ? { ...t, status: "recibida", receivedAt: nowStamp(), lines: transfer.lines } : t));
  return { transfer: getTransfer(id), hasDifference };
};

export const cancelTransfer = (id) => {
  _transfers = _transfers.map((t) => (t.id === id && t.status === "borrador" ? { ...t, status: "cancelada" } : t));
  return getTransfer(id);
};

// ---------------------------------------------------------------------------
// Inventario físico — wizard planificar → contar → revisar → cerrar (ver §3.5). Al cerrar,
// las diferencias generan Ajustes automáticos vía `createAdjustment`: la corrección de stock
// nunca se tipea a mano, siempre queda esta trazabilidad.
// ---------------------------------------------------------------------------
const enrichCount = (count) => {
  const lines = count.lines.map((l) => {
    const sku = getSku(l.skuId);
    return { ...l, name: sku?.name || l.skuId, sku: sku?.sku || "", diff: l.qtyContada == null ? null : l.qtyContada - l.qtySistema };
  });
  return { ...count, warehouseName: warehouseLabel(count.warehouseId), lines, diffCount: lines.filter((l) => l.diff).length };
};

export const listPhysicalCounts = () =>
  _counts.map(enrichCount).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getPhysicalCount = (id) => {
  const count = _counts.find((c) => c.id === id);
  return count ? enrichCount(count) : null;
};

export const createPhysicalCount = ({ warehouseId, scope, scopeValue, createdBy = null }) => {
  const levelsInWarehouse = _stockLevels.filter((l) => l.warehouseId === warehouseId);
  let skuIds;
  if (scope === "categoria") {
    skuIds = levelsInWarehouse.filter((l) => getSku(l.skuId)?.category === scopeValue).map((l) => l.skuId);
  } else if (scope === "muestra") {
    const n = Math.max(Number(scopeValue) || 1, 1);
    skuIds = [...levelsInWarehouse].sort(() => Math.random() - 0.5).slice(0, n).map((l) => l.skuId);
  } else {
    skuIds = levelsInWarehouse.map((l) => l.skuId);
  }
  if (skuIds.length === 0) throw new Error("No hay SKUs con stock en ese depósito para el alcance elegido.");

  const count = {
    id: `INV-${String(++_seq.count).padStart(3, "0")}`,
    warehouseId, scope, scopeValue: scopeValue || null, status: "planificado", createdBy,
    createdAt: nowStamp(), startedAt: null, reviewedAt: null, closedAt: null, adjustmentId: null,
    lines: skuIds.map((skuId) => ({ skuId, qtySistema: findLevel(skuId, warehouseId).onHand, qtyContada: null })),
  };
  _counts = [count, ..._counts];
  return getPhysicalCount(count.id);
};

export const startPhysicalCount = (id) => {
  _counts = _counts.map((c) => (c.id === id && c.status === "planificado" ? { ...c, status: "en_conteo", startedAt: nowStamp() } : c));
  return getPhysicalCount(id);
};

export const updateCountLines = (id, lineUpdates) => {
  const map = new Map(lineUpdates.map((l) => [l.skuId, l.qtyContada]));
  _counts = _counts.map((c) =>
    c.id === id && c.status === "en_conteo"
      ? { ...c, lines: c.lines.map((l) => (map.has(l.skuId) ? { ...l, qtyContada: map.get(l.skuId) === "" || map.get(l.skuId) == null ? null : Number(map.get(l.skuId)) } : l)) }
      : c
  );
  return getPhysicalCount(id);
};

export const submitCountForReview = (id) => {
  const count = _counts.find((c) => c.id === id);
  if (!count || count.status !== "en_conteo") throw new Error("Sólo se puede enviar a revisión un conteo en curso.");
  if (count.lines.some((l) => l.qtyContada == null)) throw new Error("Todavía faltan líneas por contar.");
  _counts = _counts.map((c) => (c.id === id ? { ...c, status: "revision", reviewedAt: nowStamp() } : c));
  return getPhysicalCount(id);
};

export const closePhysicalCount = (id) => {
  const count = _counts.find((c) => c.id === id);
  if (!count || count.status !== "revision") throw new Error("Sólo se puede cerrar un conteo en revisión.");

  const diffLines = count.lines
    .filter((l) => l.qtyContada != null && l.qtyContada !== l.qtySistema)
    .map((l) => ({ skuId: l.skuId, delta: l.qtyContada - l.qtySistema, note: `Conteo físico ${count.id}` }));

  const adjustment = diffLines.length > 0
    ? createAdjustment({
      warehouseId: count.warehouseId,
      reason: "correccion_conteo",
      // El conteo escribe su propio motivo: es la operación que lo justifica.
      detail: `diferencias del conteo físico ${count.id}, cerrado el ${nowStamp().slice(0, 10)}`,
      lines: diffLines,
      createdBy: count.createdBy,
    })
    : null;

  _counts = _counts.map((c) => (c.id === id ? { ...c, status: "cerrado", closedAt: nowStamp(), adjustmentId: adjustment?.id || null } : c));
  return getPhysicalCount(id);
};

// ---------------------------------------------------------------------------
// Punto de integración con Abastecimiento (frontera del §1 del doc: la Recepción de
// mercadería). `supplyApi.js` llama esta función al registrar una recepción — es la
// única forma en que Abastecimiento puede mover stock; nunca toca `_stockLevels` directo.
// ---------------------------------------------------------------------------
export const receiveGoods = ({ warehouseId, lines, refId }) => {
  lines.forEach(({ skuId, qty }) => {
    if (qty <= 0) return;
    const level = findLevel(skuId, warehouseId);
    level.onHand += qty;
    pushMovement({ skuId, warehouseId, type: "ingreso", qty, refType: "receipt", refId });
    emit("stock.repuesto", { type: "sku", id: skuId }, { skuId, qty, warehouseId });
  });
};

// ---------------------------------------------------------------------------
// Integración con Pedidos (evento `Pedido_Pagado` → reserva; ver
// docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §3.2). `pedidosApi.js` llama estas funciones en cada
// transición de estado real de un pedido — mismo criterio que la frontera con Abastecimiento.
// ---------------------------------------------------------------------------
export const reserveForOrder = (orderId, lines, warehouseId) => {
  const backorders = [];
  lines.forEach(({ skuId, qty }) => {
    const level = findLevel(skuId, warehouseId);
    const grantable = Math.min(qty, available(level));
    if (grantable > 0) {
      level.reserved += grantable;
      pushMovement({ skuId, warehouseId, type: "reserva", qty: grantable, counter: "reserved", refType: "order", refId: orderId });
    }
    if (grantable < qty) backorders.push({ skuId, missing: qty - grantable });
  });
  return { backorders };
};

export const releaseReservation = (orderId, lines, warehouseId) => {
  lines.forEach(({ skuId, qty }) => {
    const level = findLevel(skuId, warehouseId);
    const release = Math.min(qty, level.reserved);
    if (release > 0) {
      level.reserved -= release;
      pushMovement({ skuId, warehouseId, type: "liberacion", qty: -release, counter: "reserved", refType: "order", refId: orderId });
    }
  });
};

export const fulfillOrder = (orderId, lines, warehouseId) => {
  lines.forEach(({ skuId, qty }) => {
    const level = findLevel(skuId, warehouseId);
    const consume = Math.min(qty, level.reserved, level.onHand);
    if (consume > 0) {
      level.reserved -= consume;
      level.onHand -= consume;
      pushMovement({ skuId, warehouseId, type: "venta", qty: -consume, refType: "order", refId: orderId });
    }
  });
};

/** Devolución de un pedido ya despachado/entregado — la 5ª causa de cambio de `onHand` (§4.5).
 * A diferencia de `releaseReservation` (libera algo que nunca salió del depósito), acá la
 * mercadería vuelve físicamente: suma a `onHand` directo, no toca `reserved`. */
export const returnGoods = (orderId, lines, warehouseId) => {
  lines.forEach(({ skuId, qty }) => {
    if (qty <= 0) return;
    const level = findLevel(skuId, warehouseId);
    level.onHand += qty;
    pushMovement({ skuId, warehouseId, type: "devolucion", qty, refType: "order", refId: orderId });
  });
};
