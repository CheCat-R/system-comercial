import { atDaysAgo } from "../lib/time";

export const transfers = [
  {
    id: "TRA-001",
    originId: "DEP-01",
    destId: "DEP-03",
    status: "recibida",
    createdBy: "Martín Sosa",
    createdAt: atDaysAgo(7, "10", "00"),
    sentAt: atDaysAgo(6, "09", "30"),
    receivedAt: atDaysAgo(5, "14", "00"),
    lines: [{ skuId: "SKU-1", qtySent: 10, qtyReceived: 10 }],
  },
  {
    id: "TRA-002",
    originId: "DEP-04",
    destId: "DEP-01",
    status: "en_transito",
    createdBy: "Lucía Fernández",
    createdAt: atDaysAgo(1, "08", "45"),
    sentAt: atDaysAgo(1, "09", "00"),
    receivedAt: null,
    lines: [{ skuId: "SKU-5", qtySent: 5, qtyReceived: null }],
  },
  {
    id: "TRA-003",
    originId: "DEP-01",
    destId: "DEP-02",
    status: "borrador",
    createdBy: "Martín Sosa",
    createdAt: atDaysAgo(0, "09", "10"),
    sentAt: null,
    receivedAt: null,
    lines: [{ skuId: "SKU-2", qtySent: 5, qtyReceived: null }],
  },
];
