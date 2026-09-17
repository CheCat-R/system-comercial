import { atDaysAgo } from "../lib/time";

export const physicalCounts = [
  {
    id: "INV-001",
    warehouseId: "DEP-04",
    scope: "categoria",
    scopeValue: "Accesorios",
    status: "cerrado",
    createdBy: "Lucía Fernández",
    createdAt: atDaysAgo(11, "09", "00"),
    startedAt: atDaysAgo(10, "10", "00"),
    reviewedAt: atDaysAgo(10, "11", "00"),
    closedAt: atDaysAgo(10, "11", "10"),
    adjustmentId: "AJU-001",
    // Snapshot al momento del conteo — el AJU-001 ya sembrado es justamente lo que este conteo generó.
    lines: [
      { skuId: "SKU-4", qtySistema: 18, qtyContada: 20 },
      { skuId: "SKU-5", qtySistema: 12, qtyContada: 12 },
    ],
  },
  {
    id: "INV-002",
    warehouseId: "DEP-01",
    scope: "total",
    scopeValue: null,
    status: "en_conteo",
    createdBy: "Martín Sosa",
    createdAt: atDaysAgo(0, "08", "30"),
    startedAt: atDaysAgo(0, "08", "35"),
    reviewedAt: null,
    closedAt: null,
    adjustmentId: null,
    lines: [
      { skuId: "SKU-1", qtySistema: 50, qtyContada: null },
      { skuId: "SKU-2", qtySistema: 20, qtyContada: null },
      { skuId: "SKU-3", qtySistema: 0, qtyContada: null },
      { skuId: "SKU-4", qtySistema: 25, qtyContada: null },
      { skuId: "SKU-5", qtySistema: 5, qtyContada: null },
    ],
  },
  {
    id: "INV-003",
    warehouseId: "DEP-03",
    scope: "muestra",
    scopeValue: 2,
    status: "planificado",
    createdBy: "Martín Sosa",
    createdAt: atDaysAgo(0, "09", "05"),
    startedAt: null,
    reviewedAt: null,
    closedAt: null,
    adjustmentId: null,
    lines: [
      { skuId: "SKU-1", qtySistema: 40, qtyContada: null },
      { skuId: "SKU-2", qtySistema: 15, qtyContada: null },
    ],
  },
];
