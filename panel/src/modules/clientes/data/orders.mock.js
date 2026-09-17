/**
 * Mock de Pedidos por cuenta. En producción vendría de
 * `GET /api/v1/accounts/:id/orders` (módulo Pedidos). El CRM sólo lee.
 *
 * paymentStatus: "paid" | "pending" | "refunded"
 * fulfillmentStatus: "unfulfilled" | "shipped" | "delivered" | "returned"
 */
import { TODAY, toDayString } from "../lib/time";

const iso = (daysAgo) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return toDayString(d);
};

let seq = 10200;
const make = (accountId, daysAgo, total, payment = "paid", fulfillment = "delivered", items = 1) => ({
  id: String(seq++),
  accountId,
  date: iso(daysAgo),
  total,
  paymentStatus: payment,
  fulfillmentStatus: fulfillment,
  items,
});

export const orders = [
  // CLI-001 · Juan Pérez — Campeón
  make("CLI-001", 2, 320000, "paid", "unfulfilled", 3),
  make("CLI-001", 1, 48000, "pending", "unfulfilled", 1),
  make("CLI-001", 20, 180000, "paid", "delivered", 2),
  make("CLI-001", 44, 95000, "paid", "delivered", 1),
  make("CLI-001", 70, 240000, "paid", "delivered", 4),
  make("CLI-001", 110, 60000, "paid", "delivered", 1),
  make("CLI-001", 155, 150000, "paid", "delivered", 2),
  make("CLI-001", 210, 90000, "paid", "delivered", 1),
  make("CLI-001", 300, 115000, "paid", "delivered", 2),

  // CLI-002 · María López — Leal / Frecuente
  make("CLI-002", 9, 65000, "paid", "shipped", 2),
  make("CLI-002", 30, 48000, "paid", "delivered", 1),
  make("CLI-002", 55, 70000, "paid", "delivered", 2),
  make("CLI-002", 80, 52000, "paid", "delivered", 1),
  make("CLI-002", 120, 40000, "paid", "delivered", 1),
  make("CLI-002", 170, 55000, "paid", "delivered", 2),
  make("CLI-002", 230, 45000, "paid", "delivered", 1),
  make("CLI-002", 300, 45000, "paid", "delivered", 1),

  // CLI-003 · Carlos Gómez — Prometedor
  make("CLI-003", 22, 55000, "paid", "delivered", 2),
  make("CLI-003", 48, 40000, "paid", "delivered", 1),

  // CLI-004 · Ana Torres — Durmiente
  make("CLI-004", 95, 25000, "refunded", "returned", 1),
  make("CLI-004", 130, 60000, "paid", "delivered", 1),
  make("CLI-004", 180, 45000, "paid", "delivered", 1),
  make("CLI-004", 230, 70000, "paid", "delivered", 2),
  make("CLI-004", 290, 50000, "paid", "delivered", 1),
  make("CLI-004", 340, 42000, "paid", "delivered", 1),
  make("CLI-004", 360, 43000, "paid", "delivered", 1),

  // CLI-005 · Empresa ABC S.A. — Campeón (B2B)
  make("CLI-005", 1, 850000, "paid", "shipped", 40),
  make("CLI-005", 25, 620000, "paid", "delivered", 32),
  make("CLI-005", 60, 900000, "paid", "delivered", 48),
  make("CLI-005", 130, 480000, "paid", "delivered", 25),
  make("CLI-005", 210, 550000, "paid", "delivered", 30),
  make("CLI-005", 310, 400000, "paid", "delivered", 20),

  // CLI-006 · Sofía Ruiz — Lead (sin pedidos)

  // CLI-007 · Distribuidora Norte — En riesgo (B2B)
  make("CLI-007", 75, 210000, "paid", "delivered", 15),
  make("CLI-007", 140, 180000, "paid", "delivered", 12),
  make("CLI-007", 210, 160000, "paid", "delivered", 10),
  make("CLI-007", 280, 190000, "paid", "delivered", 14),
  make("CLI-007", 350, 150000, "paid", "delivered", 9),

  // CLI-008 · Roberto Díaz — Perdido
  make("CLI-008", 300, 90000, "paid", "delivered", 2),
  make("CLI-008", 340, 70000, "paid", "delivered", 1),
  make("CLI-008", 360, 60000, "paid", "delivered", 1),
];
