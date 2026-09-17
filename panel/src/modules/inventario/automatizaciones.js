/**
 * Lo que Inventario le ofrece al motor de Automatizaciones.
 *
 * Los dos escáneres de stock son los que más se apoyan en que **el umbral lo
 * define el módulo dueño**: Automatizaciones no sabe qué es "bajo mínimo", lo
 * calcula `inventario/lib/stock.js` con el minStock/safetyStock de cada fila.
 * Ahora eso además está donde corresponde, en este módulo.
 */
import { getStockLevels, getStockGroupedBySku } from "./api/inventoryApi";
import { STOCK_STATUS } from "./lib/stock";
import { registrarSujeto, registrarEscaner } from "../automatizaciones/lib/registry";
import { registrarCondiciones, asOptions, NUMERIC_OPS, ENUM_OPS } from "../automatizaciones/lib/conditions";

/* -------------------------------------------------------------- sujeto */

registrarSujeto("sku", {
  label: "SKU",
  cargar: (id, { safe }) => {
    const row = safe(() => getStockGroupedBySku().find((g) => g.skuId === id), null);
    return row ? { sku: row } : null;
  },
  describir: (subject, c) => c.sku?.name || subject.id,
});

/* ------------------------------------------------------------ escáneres */

/**
 * ⭐ Se escanea por **fila SKU × depósito**, no por SKU consolidado.
 *
 * `getStockGroupedBySku()` suma las cantidades de todos los depósitos pero
 * propaga el **peor** estado (`worstStatusKey`). Escaneando el consolidado, un
 * SKU con 123 unidades en total salía marcado "bajo mínimo" porque uno de sus
 * cuatro depósitos estaba corto — y la tarea decía "quedan 123", que es
 * exactamente el número que no hay que mirar.
 *
 * Escaneando por fila, el aviso nombra **el depósito que está corto y su
 * cantidad**. El sujeto sigue siendo el SKU (para que las condiciones `sku.*`
 * funcionen), pero la marca de agua se lleva por SKU+depósito: dos depósitos
 * cayendo bajo mínimo son dos cosas distintas que resolver.
 */
registrarEscaner("stock.bajo_minimo", ({ statuses = ["bajo_minimo", "critico"] } = {}, { safe }) =>
  safe(getStockLevels)
    .filter((r) => statuses.includes(r.status))
    .map((r) => ({
      key: `${r.skuId}@${r.warehouseId}`,
      subject: { type: "sku", id: r.skuId },
      payload: {
        skuId: r.skuId, name: r.name, status: r.status,
        warehouseId: r.warehouseId, warehouseName: r.warehouseName,
        available: r.available, minStock: r.minStock, safetyStock: r.safetyStock,
      },
    })));

registrarEscaner("stock.agotado", (_params, { safe }) =>
  safe(getStockLevels)
    .filter((r) => r.status === "agotado")
    .map((r) => ({
      key: `${r.skuId}@${r.warehouseId}`,
      subject: { type: "sku", id: r.skuId },
      payload: { skuId: r.skuId, name: r.name, onHand: r.onHand, warehouseId: r.warehouseId, warehouseName: r.warehouseName },
    })));

/* --------------------------------------------------------- condiciones */

registrarCondiciones({
  "sku.status": {
    label: "Estado de stock", group: "Producto",
    subjectTypes: ["sku"], type: "enum", ops: ENUM_OPS,
    source: "inventario/lib/stock.js — stockStatusKey()",
    options: () => asOptions(STOCK_STATUS),
    get: (c) => c.sku?.status ?? null,
  },
  "sku.available": {
    label: "Disponible", group: "Producto",
    subjectTypes: ["sku"], type: "number", ops: NUMERIC_OPS,
    source: "inventoryApi — onHand − reserved",
    get: (c) => c.sku?.available ?? null,
  },
  "sku.onHand": {
    label: "En depósito", group: "Producto",
    subjectTypes: ["sku"], type: "number", ops: NUMERIC_OPS,
    source: "inventoryApi.getStockGroupedBySku().onHand",
    get: (c) => c.sku?.onHand ?? null,
  },
  "sku.minStock": {
    label: "Mínimo configurado", group: "Producto",
    subjectTypes: ["sku"], type: "number", ops: NUMERIC_OPS,
    source: "inventoryApi — umbral por SKU y depósito",
    get: (c) => c.sku?.minStock ?? null,
  },
  "sku.cost": {
    label: "Costo del SKU", group: "Producto",
    subjectTypes: ["sku"], type: "money", ops: NUMERIC_OPS,
    source: "inventoryApi — cost",
    get: (c) => c.sku?.cost ?? null,
  },
});
