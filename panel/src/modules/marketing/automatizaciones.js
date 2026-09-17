/**
 * Lo que Marketing le ofrece al motor de Automatizaciones.
 *
 * La acción de recuperación es el mejor ejemplo de la regla §1.1: no arma un
 * cupón ni manda un mail — llama a `sendCartRecovery`, la misma función que
 * usaría una persona desde la pantalla de carritos. Y si la cuenta se dio de
 * baja de email, Marketing tira error y la ejecución queda fallida: **no se
 * atropella la baja**.
 */
import { getAbandonedCart, listAbandonedCarts, sendCartRecovery } from "./api/marketingApi";
import { registrarSujeto, registrarEscaner, registrarAcciones } from "../automatizaciones/lib/registry";
import { registrarCondiciones, NUMERIC_OPS, BOOL_OPS } from "../automatizaciones/lib/conditions";

/* -------------------------------------------------------------- sujeto */

registrarSujeto("cart", {
  label: "Carrito abandonado",
  cargar: (id, { safe }) => {
    const cart = safe(() => getAbandonedCart(id));
    return cart ? { cart } : null;
  },
  derivar: ({ cart }, { hoursSince }) => ({
    cartHoursIdle: cart ? hoursSince(cart.lastActivityAt) : null,
  }),
  describir: (subject, c) => `${subject.id} · ${c.cart?.customerName || ""}`.trim(),
});

/* ------------------------------------------------------------- escáner */

registrarEscaner("carrito.abandonado", ({ hours = 2 } = {}, { safe, hoursSince }) =>
  safe(() => listAbandonedCarts({ status: "abierto" }))
    .map((c) => ({ c, idle: hoursSince(c.lastActivityAt) ?? 0 }))
    .filter(({ idle }) => idle >= Number(hours))
    .map(({ c, idle }) => ({
      subject: { type: "cart", id: c.id },
      payload: { cartId: c.id, accountId: c.accountId, subtotal: c.subtotal, hoursIdle: Math.round(idle) },
    })));

/* ------------------------------------------------------------- acción */

registrarAcciones({
  "cart.recovery": {
    label: "Enviar recuperación de carrito", group: "Marketing", tier: "contact",
    subjectTypes: ["cart"],
    calls: "marketingApi.sendCartRecovery",
    hint: "Marketing crea el cupón nominal y la campaña one-shot. Si la cuenta se dio de baja de email, tira error y la ejecución queda fallida — no se atropella la baja.",
    params: [],
    preview: (ctx) => ctx.cart
      ? `Enviar recuperación del carrito ${ctx.cart.id} a ${ctx.cart.customerName}`
      : "El carrito ya no existe.",
    run: (ctx) => {
      const result = sendCartRecovery(ctx.subject.id);
      return { ok: true, detail: `Recuperación enviada · cupón ${result?.coupon?.code || "—"}`, ref: result?.campaign?.id };
    },
  },
});

/* --------------------------------------------------------- condiciones */

registrarCondiciones({
  "cart.subtotal": {
    label: "Subtotal del carrito", group: "Carrito",
    subjectTypes: ["cart"], type: "money", ops: NUMERIC_OPS,
    source: "marketingApi.getAbandonedCart().subtotal",
    get: (c) => c.cart?.subtotal ?? null,
  },
  "cart.itemCount": {
    label: "Ítems del carrito", group: "Carrito",
    subjectTypes: ["cart"], type: "number", ops: NUMERIC_OPS,
    source: "marketingApi.getAbandonedCart().itemCount",
    get: (c) => c.cart?.itemCount ?? null,
  },
  "cart.hoursIdle": {
    label: "Horas inactivo", group: "Carrito",
    subjectTypes: ["cart"], type: "number", ops: NUMERIC_OPS,
    source: "derivado de cart.lastActivityAt contra el reloj",
    get: (c) => c.derived?.cartHoursIdle ?? null,
  },
  "cart.hasRecovery": {
    label: "Ya recibió recuperación", group: "Carrito",
    subjectTypes: ["cart"], type: "boolean", ops: BOOL_OPS,
    source: "marketingApi — recoveryCampaignId",
    get: (c) => Boolean(c.cart?.recoveryCampaignId || c.cart?.recoveryCampaignName),
  },
});
