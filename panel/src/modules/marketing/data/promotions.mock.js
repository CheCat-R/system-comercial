import { atDaysAgo } from "../lib/time";

/**
 * Promociones = descuento automático, sin código. Se aplica en `priceCart` si el carrito cumple las
 * condiciones. Ver docs/MODULO-MARKETING.md §2.
 *
 * El pedido #10248 (Distribuidora Norte, mayorista) ya trae `appliedPromotions: ["PRM-04"]` en
 * `pedidos/data/orders.mock.js` — por eso PRM-04 muestra 1 uso al cargar.
 */
export const promotions = [
  {
    id: "PRM-01",
    name: "Envío gratis en compras grandes",
    description: "Sin cargo de envío para pedidos de más de $80.000.",
    discount: { type: "free_shipping" },
    conditions: { minSubtotal: 80000 },
    stackable: true,
    priority: 10,
    channel: "all",
    status: "activa",
    startsAt: atDaysAgo(40),
    endsAt: atDaysAgo(-60),
    createdAt: atDaysAgo(40),
  },
  {
    id: "PRM-02",
    name: "15% OFF Indumentaria",
    description: "Descuento en toda la categoría Indumentaria.",
    discount: { type: "percent", value: 15, maxAmount: 8000, scope: { categories: ["Indumentaria"] } },
    conditions: {},
    stackable: false,
    priority: 20,
    channel: "all",
    status: "activa",
    startsAt: atDaysAgo(14),
    endsAt: atDaysAgo(-16),
    createdAt: atDaysAgo(14),
  },
  {
    id: "PRM-03",
    name: "10% en tu primera compra",
    description: "Bienvenida para clientes sin pedidos previos.",
    discount: { type: "percent", value: 10, maxAmount: 5000 },
    conditions: { firstPurchase: true },
    stackable: false,
    priority: 30,
    channel: "online",
    status: "activa",
    startsAt: atDaysAgo(90),
    endsAt: null,
    createdAt: atDaysAgo(90),
  },
  {
    id: "PRM-04",
    name: "Mayorista −5% en compras +$250.000",
    description: "Bonificación para pedidos B2B de volumen.",
    discount: { type: "percent", value: 5, maxAmount: 30000 },
    conditions: { minSubtotal: 250000, channel: "b2b" },
    stackable: false,
    priority: 15,
    channel: "b2b",
    status: "activa",
    startsAt: atDaysAgo(30),
    endsAt: atDaysAgo(-30),
    createdAt: atDaysAgo(30),
  },
  {
    id: "PRM-05",
    name: "Semana del Calzado −20%",
    description: "Programada para el próximo lanzamiento.",
    discount: { type: "percent", value: 20, maxAmount: 12000, scope: { categories: ["Calzado"] } },
    conditions: {},
    stackable: false,
    priority: 25,
    channel: "all",
    status: "programada",
    startsAt: atDaysAgo(-7),
    endsAt: atDaysAgo(-14),
    createdAt: atDaysAgo(2),
  },
];
