import { atDaysAgo } from "../lib/time";

/**
 * Programa de puntos — config única. Ver docs/MODULO-MARKETING.md §2 / §5.3 / §8.7.
 *
 * - `earnRate`: puntos que acumula el cliente por cada $1 de total pagado (0.01 = 1 punto cada $100).
 * - `pointValue`: valor en $ de 1 punto al canjearlo ($1).
 * - `minRedeem`: mínimo de puntos para poder canjear en un checkout.
 * - `expiryMonths`: los puntos vencen a los N meses de acumulados (regla §7).
 * - `tierMultipliers`: un VIP acumula ×2 sobre la tasa base (tier viene del CRM).
 * - `tierBenefits`: capa declarativa sobre el `tier` — `priceCart` la aplica al cotizar.
 */
export const loyaltyProgram = {
  earnRate: 0.01,
  pointValue: 1,
  minRedeem: 500,
  expiryMonths: 12,
  tierMultipliers: { vip: 2, frecuente: 1.5, activo: 1, en_riesgo: 1, durmiente: 1, lead: 1 },
  tierBenefits: {
    vip: { freeShipping: true, extraPercent: 5, earlyAccess: true },
    frecuente: { freeShipping: false, extraPercent: 2, earlyAccess: true },
  },
};

/** Catálogo de canje — mismo `discount` que Promoción/Cupón, disparado gastando puntos. */
export const rewards = [
  {
    id: "RW-01",
    name: "$2.000 de descuento",
    pointsCost: 1800,
    discount: { type: "fixed", value: 2000, scope: "all" },
    status: "activa",
    createdAt: atDaysAgo(60),
  },
  {
    id: "RW-02",
    name: "Envío gratis",
    pointsCost: 700,
    discount: { type: "free_shipping" },
    status: "activa",
    createdAt: atDaysAgo(60),
  },
  {
    id: "RW-03",
    name: "10% en tu próxima compra",
    pointsCost: 3000,
    discount: { type: "percent", value: 10, maxAmount: 12000, scope: "all" },
    status: "activa",
    createdAt: atDaysAgo(40),
  },
  {
    id: "RW-04",
    name: "25% Semana VIP",
    pointsCost: 6000,
    discount: { type: "percent", value: 25, maxAmount: 30000, scope: "all" },
    status: "inactiva",
    createdAt: atDaysAgo(20),
  },
];

/**
 * Movimientos sembrados (los `earn` de pedidos pagados se materializan solos en
 * `ensurePointsLedger`). Estos cubren casos que el histórico corto de pedidos no genera: un canje
 * previo y un vencimiento. `balanceAfter` se recalcula al leer.
 */
export const pointsLedgerSeed = [
  {
    id: "PL-SEED-01",
    accountId: "CLI-001", // Juan Pérez
    type: "redeem",
    points: -1200,
    sourceType: "order",
    sourceId: "10231",
    at: atDaysAgo(48, "12", "10"),
    expiresAt: null,
  },
  {
    id: "PL-SEED-02",
    accountId: "CLI-005", // Empresa ABC
    type: "expire",
    points: -900,
    sourceType: "manual",
    sourceId: null,
    at: atDaysAgo(20, "00", "05"),
    expiresAt: null,
  },
  {
    id: "PL-SEED-03",
    accountId: "CLI-001",
    type: "adjust",
    points: 500,
    sourceType: "manual",
    sourceId: null,
    at: atDaysAgo(15, "18", "00"),
    expiresAt: null,
    note: "Compensación por demora de envío",
  },
];
