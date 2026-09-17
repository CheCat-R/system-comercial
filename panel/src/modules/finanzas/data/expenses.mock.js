import { atDaysAgo } from "../lib/time";

/**
 * Gastos operativos — el único dato de Finanzas que se carga a mano (§2.2). El resto del P&L es
 * derivado. `costCenter` es un `warehouseId` o "global"; `date` es lo que cuenta para el P&L del
 * período (base devengado), `paidAt`/`status` para el flujo de fondos (base caja).
 */
export const expenses = [
  {
    id: "GTO-001", category: "alquiler", description: "Alquiler depósito Palermo",
    amount: 45000, date: atDaysAgo(33), recurrence: "mensual", costCenter: "DEP-01",
    account: "banco", status: "pagado", paidAt: atDaysAgo(33), createdAt: atDaysAgo(33),
  },
  {
    id: "GTO-002", category: "sueldos", description: "Sueldos administración y depósito",
    amount: 68000, date: atDaysAgo(29), recurrence: "mensual", costCenter: "global",
    account: "banco", status: "pagado", paidAt: atDaysAgo(29), createdAt: atDaysAgo(29),
  },
  {
    id: "GTO-003", category: "software", description: "Plan de software y hosting (Vercel, mail, panel)",
    amount: 16000, date: atDaysAgo(31), recurrence: "mensual", costCenter: "global",
    account: "banco", status: "pagado", paidAt: atDaysAgo(31), createdAt: atDaysAgo(31),
  },
  {
    id: "GTO-004", category: "servicios", description: "Luz e internet depósitos",
    amount: 14500, date: atDaysAgo(26), recurrence: "mensual", costCenter: "DEP-04",
    account: "banco", status: "pagado", paidAt: atDaysAgo(26), createdAt: atDaysAgo(26),
  },
  {
    id: "GTO-005", category: "marketing", description: "Campaña de marketing en redes (agosto)",
    amount: 38000, date: atDaysAgo(16), recurrence: "unico", costCenter: "global",
    account: "banco", status: "pagado", paidAt: atDaysAgo(16), createdAt: atDaysAgo(16),
  },
  {
    id: "GTO-006", category: "otros", description: "Mantenimiento vehículo de reparto",
    amount: 26000, date: atDaysAgo(12), recurrence: "unico", costCenter: "DEP-04",
    account: "caja", status: "pagado", paidAt: atDaysAgo(12), createdAt: atDaysAgo(12),
  },
  {
    id: "GTO-007", category: "honorarios", description: "Honorarios estudio contable",
    amount: 22000, date: atDaysAgo(1), recurrence: "mensual", costCenter: "global",
    account: "banco", status: "pendiente", paidAt: null, createdAt: atDaysAgo(1),
  },
  {
    id: "GTO-008", category: "alquiler", description: "Alquiler depósito Palermo",
    amount: 45000, date: atDaysAgo(3), recurrence: "mensual", costCenter: "DEP-01",
    account: "banco", status: "pendiente", paidAt: null, createdAt: atDaysAgo(3),
  },
];
