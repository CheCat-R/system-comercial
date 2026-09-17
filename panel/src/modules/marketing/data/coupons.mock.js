import { atDaysAgo } from "../lib/time";

/**
 * Cupones = descuento activado por un código que el cliente ingresa. Ver docs/MODULO-MARKETING.md §2.
 *
 * El pedido #10247 (Sofía Ruiz) ya trae `couponCode: "BIENVENIDA15"` en `pedidos/data/orders.mock.js`
 * — por eso ese cupón muestra 1 redención al cargar (`ensureRedemptions`). #10253 (María, pendiente)
 * lo tiene aplicado pero todavía sin pagar.
 */
export const coupons = [
  {
    id: "CUP-01",
    code: "BIENVENIDA15",
    description: "15% de bienvenida, primera compra.",
    discount: { type: "percent", value: 15, maxAmount: 6000 },
    conditions: {},
    limits: { maxRedemptions: 100, maxPerCustomer: 1 },
    restrictToCustomer: null,
    restrictToAudience: null,
    origin: "manual",
    campaignName: null,
    startsAt: atDaysAgo(60),
    endsAt: atDaysAgo(-120),
    status: "activo",
    createdAt: atDaysAgo(60),
  },
  {
    id: "CUP-02",
    code: "VOLVE20",
    description: "20% para reactivar clientes en riesgo o durmientes.",
    discount: { type: "percent", value: 20, maxAmount: 10000 },
    conditions: {},
    limits: { maxRedemptions: 50, maxPerCustomer: 1 },
    restrictToCustomer: null,
    restrictToAudience: { segments: ["en_riesgo", "durmiente", "perdido"] },
    origin: "campaign",
    campaignName: "Reactivación · cupón 15%",
    startsAt: atDaysAgo(20),
    endsAt: atDaysAgo(-10),
    status: "activo",
    createdAt: atDaysAgo(20),
  },
  {
    id: "CUP-03",
    code: "ENVIOGRATIS",
    description: "Envío sin cargo en compras de más de $50.000.",
    discount: { type: "free_shipping" },
    conditions: { minSubtotal: 50000 },
    limits: { maxRedemptions: 200, maxPerCustomer: 2 },
    restrictToCustomer: null,
    restrictToAudience: null,
    origin: "manual",
    campaignName: null,
    startsAt: atDaysAgo(15),
    endsAt: atDaysAgo(-45),
    status: "activo",
    createdAt: atDaysAgo(15),
  },
  {
    id: "CUP-04",
    code: "VERANO2026",
    description: "25% temporada de verano (finalizado).",
    discount: { type: "percent", value: 25, maxAmount: 15000 },
    conditions: {},
    limits: { maxRedemptions: 300, maxPerCustomer: 1 },
    restrictToCustomer: null,
    restrictToAudience: null,
    origin: "campaign",
    campaignName: "Verano 2026",
    startsAt: atDaysAgo(120),
    endsAt: atDaysAgo(30),
    status: "vencido",
    createdAt: atDaysAgo(120),
  },
];
