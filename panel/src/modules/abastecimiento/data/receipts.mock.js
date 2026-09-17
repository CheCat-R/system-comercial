import { atDaysAgo } from "../lib/time";

/** Cada Recepción es, a la vez, el registro de Compra (ver §2.2 del doc — Compra ≈ Ventas). */
export const receipts = [
  {
    id: "REC-3001",
    orderId: "OC-2001",
    warehouseId: "DEP-01",
    receivedBy: "Martín Sosa",
    at: atDaysAgo(45, "14", "00"),
    lines: [{ skuId: "SKU-1", qty: 60, unitCost: 26000 }],
  },
  {
    id: "REC-3002",
    orderId: "OC-2005",
    warehouseId: "DEP-01",
    receivedBy: "Martín Sosa",
    at: atDaysAgo(32, "11", "30"),
    lines: [{ skuId: "SKU-2", qty: 25, unitCost: 5700 }],
  },
  {
    id: "REC-3003",
    orderId: "OC-2006",
    warehouseId: "DEP-01",
    receivedBy: "Lucía Fernández",
    at: atDaysAgo(16, "10", "00"),
    lines: [{ skuId: "SKU-4", qty: 20, unitCost: 3100 }],
  },
  {
    id: "REC-3004",
    orderId: "OC-2003",
    warehouseId: "DEP-04",
    receivedBy: "Lucía Fernández",
    at: atDaysAgo(10, "09", "45"),
    lines: [{ skuId: "SKU-4", qty: 25, unitCost: 3200 }],
  },
];
