/** Fila = SKU × Depósito. `onHand`/`reserved` son la fuente de verdad; `available` se deriva siempre. */
export const stockLevels = [
  { skuId: "SKU-1", warehouseId: "DEP-01", onHand: 50, reserved: 1, minStock: 20, safetyStock: 8 },
  { skuId: "SKU-1", warehouseId: "DEP-02", onHand: 10, reserved: 0, minStock: 5, safetyStock: 2 },
  { skuId: "SKU-1", warehouseId: "DEP-03", onHand: 40, reserved: 0, minStock: 15, safetyStock: 6 },
  { skuId: "SKU-1", warehouseId: "DEP-04", onHand: 24, reserved: 0, minStock: 30, safetyStock: 10 },

  { skuId: "SKU-2", warehouseId: "DEP-01", onHand: 20, reserved: 2, minStock: 10, safetyStock: 4 },
  { skuId: "SKU-2", warehouseId: "DEP-03", onHand: 15, reserved: 0, minStock: 10, safetyStock: 4 },

  { skuId: "SKU-3", warehouseId: "DEP-01", onHand: 0, reserved: 0, minStock: 10, safetyStock: 4 },
  { skuId: "SKU-3", warehouseId: "DEP-03", onHand: 0, reserved: 0, minStock: 8, safetyStock: 3 },

  { skuId: "SKU-4", warehouseId: "DEP-01", onHand: 25, reserved: 0, minStock: 15, safetyStock: 5 },
  { skuId: "SKU-4", warehouseId: "DEP-04", onHand: 20, reserved: 0, minStock: 10, safetyStock: 5 },

  { skuId: "SKU-5", warehouseId: "DEP-01", onHand: 5, reserved: 0, minStock: 8, safetyStock: 3 },
  { skuId: "SKU-5", warehouseId: "DEP-04", onHand: 7, reserved: 0, minStock: 10, safetyStock: 4 },
];
