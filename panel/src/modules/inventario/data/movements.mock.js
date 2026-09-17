import { atDaysAgo } from "../lib/time";

let seq = 0;
const nextId = () => `MOV-${String(++seq).padStart(4, "0")}`;

const mv = ({ skuId, warehouseId, type, qty, counter = "onHand", balanceAfter, daysAgo, hh = "09", mm = "00", refType, refId }) => ({
  id: nextId(),
  skuId,
  warehouseId,
  type,
  qty,
  counter, // "onHand" | "reserved" — qué contador afecta este movimiento
  balanceAfter,
  refType: refType || null,
  refId: refId || null,
  at: atDaysAgo(daysAgo, hh, mm),
});

export const movements = [
  // SKU-1 Zapatillas Running X @ Depósito Palermo (onHand actual: 50, reservado: 1)
  mv({ skuId: "SKU-1", warehouseId: "DEP-01", type: "ingreso", qty: 63, balanceAfter: 63, daysAgo: 45, refType: "receipt", refId: "REC-1001" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-01", type: "venta", qty: -10, balanceAfter: 53, daysAgo: 20, refType: "order", refId: "10231" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-01", type: "transfer_out", qty: -10, balanceAfter: 43, daysAgo: 6, hh: "09", mm: "30", refType: "transfer", refId: "TRA-001" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-01", type: "ajuste_pos", qty: 9, balanceAfter: 52, daysAgo: 4, hh: "16", mm: "40", refType: "adjustment", refId: "AJU-002" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-01", type: "venta", qty: -2, balanceAfter: 50, daysAgo: 2, refType: "order", refId: "10252" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-01", type: "reserva", qty: 1, counter: "reserved", balanceAfter: 1, daysAgo: 0, hh: "08", mm: "32", refType: "order", refId: "10254" }),

  // SKU-1 @ Depósito Belgrano
  mv({ skuId: "SKU-1", warehouseId: "DEP-03", type: "ingreso", qty: 30, balanceAfter: 30, daysAgo: 30, refType: "receipt", refId: "REC-1002" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-03", type: "transfer_in", qty: 10, balanceAfter: 40, daysAgo: 5, hh: "14", mm: "00", refType: "transfer", refId: "TRA-001" }),

  // SKU-1 @ Depósito Central (bajo mínimo)
  mv({ skuId: "SKU-1", warehouseId: "DEP-04", type: "ingreso", qty: 30, balanceAfter: 30, daysAgo: 35, refType: "receipt", refId: "REC-1003" }),
  mv({ skuId: "SKU-1", warehouseId: "DEP-04", type: "venta", qty: -6, balanceAfter: 24, daysAgo: 8, refType: "order", refId: "10240" }),

  // SKU-2 Remera Básica Blanca @ Depósito Palermo (onHand actual: 20, reservado: 2)
  mv({ skuId: "SKU-2", warehouseId: "DEP-01", type: "ingreso", qty: 25, balanceAfter: 25, daysAgo: 38, refType: "receipt", refId: "REC-1004" }),
  mv({ skuId: "SKU-2", warehouseId: "DEP-01", type: "venta", qty: -5, balanceAfter: 20, daysAgo: 15, refType: "order", refId: "10201" }),
  mv({ skuId: "SKU-2", warehouseId: "DEP-01", type: "reserva", qty: 2, counter: "reserved", balanceAfter: 2, daysAgo: 0, hh: "08", mm: "32", refType: "order", refId: "10254" }),

  // SKU-2 @ Depósito Belgrano
  mv({ skuId: "SKU-2", warehouseId: "DEP-03", type: "ingreso", qty: 16, balanceAfter: 16, daysAgo: 28, refType: "receipt", refId: "REC-1005" }),
  mv({ skuId: "SKU-2", warehouseId: "DEP-03", type: "devolucion", qty: 1, balanceAfter: 17, daysAgo: 9, refType: "order", refId: "10188" }),
  mv({ skuId: "SKU-2", warehouseId: "DEP-03", type: "venta", qty: -2, balanceAfter: 15, daysAgo: 3, refType: "order", refId: "10247" }),

  // SKU-3 Short Deportivo Elite (agotado en ambos depósitos)
  mv({ skuId: "SKU-3", warehouseId: "DEP-01", type: "ingreso", qty: 15, balanceAfter: 15, daysAgo: 50, refType: "receipt", refId: "REC-1006" }),
  mv({ skuId: "SKU-3", warehouseId: "DEP-01", type: "venta", qty: -15, balanceAfter: 0, daysAgo: 9, refType: "order", refId: "10188" }),
  mv({ skuId: "SKU-3", warehouseId: "DEP-03", type: "ingreso", qty: 8, balanceAfter: 8, daysAgo: 48, refType: "receipt", refId: "REC-1006" }),
  mv({ skuId: "SKU-3", warehouseId: "DEP-03", type: "venta", qty: -8, balanceAfter: 0, daysAgo: 11, refType: "order", refId: "10190" }),

  // SKU-4 Gorra Snapback Urban @ Depósito Palermo — reserva liberada (pedido cancelado)
  mv({ skuId: "SKU-4", warehouseId: "DEP-01", type: "ingreso", qty: 25, balanceAfter: 25, daysAgo: 33, refType: "receipt", refId: "REC-1007" }),
  mv({ skuId: "SKU-4", warehouseId: "DEP-01", type: "reserva", qty: 3, counter: "reserved", balanceAfter: 3, daysAgo: 7, refType: "order", refId: "10245" }),
  mv({ skuId: "SKU-4", warehouseId: "DEP-01", type: "liberacion", qty: -3, counter: "reserved", balanceAfter: 0, daysAgo: 6, refType: "order", refId: "10245" }),

  // SKU-4 @ Depósito Central
  mv({ skuId: "SKU-4", warehouseId: "DEP-04", type: "ingreso", qty: 18, balanceAfter: 18, daysAgo: 25, refType: "receipt", refId: "REC-1008" }),
  mv({ skuId: "SKU-4", warehouseId: "DEP-04", type: "ajuste_pos", qty: 2, balanceAfter: 20, daysAgo: 10, hh: "11", mm: "15", refType: "adjustment", refId: "AJU-001" }),

  // SKU-5 Mochila Trekking 40L (bajo mínimo en ambos depósitos)
  mv({ skuId: "SKU-5", warehouseId: "DEP-01", type: "ingreso", qty: 12, balanceAfter: 12, daysAgo: 42, refType: "receipt", refId: "REC-1009" }),
  mv({ skuId: "SKU-5", warehouseId: "DEP-01", type: "venta", qty: -7, balanceAfter: 5, daysAgo: 4, refType: "order", refId: "10240" }),
  mv({ skuId: "SKU-5", warehouseId: "DEP-04", type: "ingreso", qty: 12, balanceAfter: 12, daysAgo: 40, refType: "receipt", refId: "REC-1010" }),
  mv({ skuId: "SKU-5", warehouseId: "DEP-04", type: "transfer_out", qty: -5, balanceAfter: 7, daysAgo: 1, hh: "09", mm: "00", refType: "transfer", refId: "TRA-002" }),
];
