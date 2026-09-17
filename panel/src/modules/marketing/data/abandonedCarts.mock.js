import { atDaysAgo } from "../lib/time";

/**
 * Carritos abandonados — snapshot de un carrito que no llegó a pedido. **Entidad simulada** (la
 * Tienda real los alimentaría por evento). Ver docs/MODULO-MARKETING.md §2 / §5.2 / §8.6.
 *
 * `status`: abierto → recuperado (el cliente compró tras la recuperación) | perdido (venció la
 * ventana). `recoveryCampaignId` lo setea `sendCartRecovery`; los sembrados como ejemplo traen
 * `recoveryCampaignName` como texto suelto.
 */
export const abandonedCarts = [
  {
    id: "CART-01",
    accountId: "CLI-004", // Ana Torres
    items: [
      { skuId: "SKU-1", qty: 1, unitPrice: 45000 },
      { skuId: "SKU-4", qty: 2, unitPrice: 8000 },
    ],
    lastActivityAt: atDaysAgo(2, "20", "15"),
    status: "abierto",
    recoveryCampaignId: null,
    recoveryCampaignName: null,
    recoveredOrderId: null,
    couponCode: null,
  },
  {
    id: "CART-02",
    accountId: "CLI-008", // Roberto Díaz
    items: [{ skuId: "SKU-5", qty: 1, unitPrice: 52000 }],
    lastActivityAt: atDaysAgo(4, "11", "40"),
    status: "abierto",
    recoveryCampaignId: null,
    recoveryCampaignName: null,
    recoveredOrderId: null,
    couponCode: null,
  },
  {
    id: "CART-03",
    accountId: "CLI-003", // Carlos Gómez — recuperado
    items: [{ skuId: "SKU-3", qty: 2, unitPrice: 18500 }],
    lastActivityAt: atDaysAgo(8, "16", "05"),
    status: "recuperado",
    recoveryCampaignId: null,
    recoveryCampaignName: "Recuperación · Carlos Gómez",
    recoveredOrderId: "10252",
    couponCode: "RESCATE-C3",
  },
  {
    id: "CART-04",
    accountId: "CLI-006", // Sofía Ruiz — perdido
    items: [{ skuId: "SKU-2", qty: 3, unitPrice: 12000 }],
    lastActivityAt: atDaysAgo(29, "10", "00"),
    status: "perdido",
    recoveryCampaignId: null,
    recoveryCampaignName: "Recuperación · Sofía Ruiz",
    recoveredOrderId: null,
    couponCode: "RESCATE-S6",
  },
];
