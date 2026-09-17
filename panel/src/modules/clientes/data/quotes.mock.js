/**
 * Cotizaciones / oportunidades por cuenta (módulo Ventas). El CRM las lee y
 * puede convertirlas a pedido. En producción vendría de
 * `GET /api/v1/accounts/:id/quotes`.
 *
 * status: "draft" | "sent" | "accepted" | "lost" | "converted"
 */
import { TODAY, toDayString } from "../lib/time";

const iso = (daysAgo) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return toDayString(d);
};

let seq = 4100;
const q = (accountId, daysAgo, amount, status, sellerName, items = 1) => ({
  id: `COT-${seq++}`,
  accountId,
  sellerName,
  amount,
  status,
  items,
  createdAt: iso(daysAgo),
  expiresAt: iso(daysAgo - 21),
});

export const quotes = [
  // Empresa ABC — cuenta grande con pipeline activo
  q("CLI-005", 4, 1_200_000, "sent", "María López", 55),
  q("CLI-005", 18, 780_000, "accepted", "María López", 40),
  q("CLI-005", 60, 640_000, "converted", "María López", 32),
  q("CLI-005", 95, 300_000, "lost", "María López", 15),

  // Distribuidora Norte — en riesgo, hay una oportunidad para reactivar
  q("CLI-007", 6, 420_000, "sent", "Roberto Díaz", 28),
  q("CLI-007", 40, 180_000, "draft", "Roberto Díaz", 12),

  // Juan Pérez — mayorista
  q("CLI-001", 9, 260_000, "accepted", "María López", 6),
  q("CLI-001", 70, 150_000, "converted", "María López", 3),

  // María López (cuenta) — cotización perdida
  q("CLI-002", 30, 90_000, "lost", "Carlos Pérez", 2),

  // Sofía Ruiz — lead con primera cotización enviada
  q("CLI-006", 3, 55_000, "sent", "Carlos Pérez", 1),
];
