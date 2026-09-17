import { atDaysAgo } from "../lib/time";

export const adjustments = [
  {
    id: "AJU-001",
    warehouseId: "DEP-04",
    reason: "correccion_conteo",
    createdBy: "Lucía Fernández",
    at: atDaysAgo(10, "11", "15"),
    lines: [{ skuId: "SKU-4", delta: 2, note: "Se contaron 2 gorras de más al reordenar el estante." }],
  },
  {
    id: "AJU-002",
    warehouseId: "DEP-01",
    reason: "otro",
    createdBy: "Martín Sosa",
    at: atDaysAgo(4, "16", "40"),
    lines: [{ skuId: "SKU-1", delta: 9, note: "Regularización: partida de la recepción REC-1001 que no se había cargado." }],
  },
];
