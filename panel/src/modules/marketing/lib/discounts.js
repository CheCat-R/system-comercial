/**
 * Cálculo puro de descuentos — ver docs/MODULO-MARKETING.md §2.3 / §6.
 * Un `Discount` nunca vive solo: lo entrega una Promoción, un Cupón o una Recompensa.
 */

export const DISCOUNT_TYPES = {
  percent: { label: "Porcentaje" },
  fixed: { label: "Monto fijo" },
  free_shipping: { label: "Envío gratis" },
};

export const PROMO_STATUS = {
  borrador: { label: "Borrador", tone: "neutral" },
  programada: { label: "Programada", tone: "info" },
  activa: { label: "Activa", tone: "success" },
  pausada: { label: "Pausada", tone: "warning" },
  finalizada: { label: "Finalizada", tone: "neutral" },
};

export const COUPON_STATUS = {
  activo: { label: "Activo", tone: "success" },
  pausado: { label: "Pausado", tone: "warning" },
  agotado: { label: "Agotado", tone: "neutral" },
  vencido: { label: "Vencido", tone: "danger" },
};

export const COUPON_ORIGIN = {
  manual: "Manual",
  campaign: "Campaña",
  abandoned_cart: "Carrito abandonado",
  loyalty: "Fidelización",
  birthday: "Cumpleaños",
};

/** Subtotal alcanzado por el `scope` del descuento (categorías / SKUs concretos, o todo el carrito). */
const scopedSubtotal = (discount, cart) => {
  const sc = discount.scope || {};
  if (sc.categories?.length) {
    return cart.items
      .filter((it) => sc.categories.includes(it.category))
      .reduce((s, it) => s + it.qty * it.unitPrice, 0);
  }
  if (sc.skuIds?.length) {
    return cart.items
      .filter((it) => sc.skuIds.includes(it.skuId))
      .reduce((s, it) => s + it.qty * it.unitPrice, 0);
  }
  return cart.subtotal;
};

/**
 * Aplica un `Discount` a un carrito. Devuelve `{ amount, freeShipping }`.
 * `amount` es el monto en $ que se descuenta del neto; `free_shipping` no toca el neto, pone el
 * envío en 0 (lo maneja quien crea el pedido).
 */
export const applyDiscount = (discount, cart) => {
  if (!discount) return { amount: 0, freeShipping: false };
  if (discount.type === "free_shipping") return { amount: 0, freeShipping: true };

  const base = scopedSubtotal(discount, cart);
  let amount = discount.type === "percent"
    ? Math.round((base * discount.value) / 100)
    : Math.min(discount.value, base);

  if (discount.maxAmount) amount = Math.min(amount, discount.maxAmount);
  return { amount: Math.max(0, amount), freeShipping: false };
};

/** Texto corto de un descuento para listados: "20 % · Calzado · tope $10.000". */
export const describeDiscount = (discount, money) => {
  if (!discount) return "—";
  const parts = [];
  if (discount.type === "percent") parts.push(`${discount.value} %`);
  else if (discount.type === "fixed") parts.push(money(discount.value));
  else parts.push("Envío gratis");

  const sc = discount.scope || {};
  if (sc.categories?.length) parts.push(sc.categories.join(", "));
  else if (sc.skuIds?.length) parts.push(`${sc.skuIds.length} producto(s)`);

  if (discount.maxAmount) parts.push(`tope ${money(discount.maxAmount)}`);
  return parts.join(" · ");
};

/** Resumen legible de las condiciones de una promo/cupón. */
export const describeConditions = (conditions = {}, money) => {
  const c = [];
  if (conditions.minSubtotal) c.push(`compra ≥ ${money(conditions.minSubtotal)}`);
  if (conditions.firstPurchase) c.push("primera compra");
  if (conditions.segments?.length) c.push(`segmento: ${conditions.segments.join("/")}`);
  if (conditions.tiers?.length) c.push(`tier: ${conditions.tiers.join("/")}`);
  if (conditions.channel && conditions.channel !== "all") c.push(`canal: ${conditions.channel}`);
  return c.length ? c.join(" · ") : "Sin condiciones";
};
