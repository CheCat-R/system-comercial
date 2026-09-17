/**
 * Única puerta de entrada de la UI de Marketing.
 *
 * F1 — Marketing es **dueño del motor de descuentos** (Promociones + Cupones). `priceCart` /
 * `validateCoupon` / `quoteDiscount` los llama la UI de alta de pedido; el resultado se le pasa a
 * `pedidosApi.applyDiscountToOrder` como dato — **Pedidos no importa `marketingApi`**.
 * F2 — Campañas, Audiencias y Comunicación (simulada). Los `MessageSend` se materializan solos
 * (`ensureSends`). El CRM lee la actividad de marketing vía `getAccountMarketingActivity` (que
 * `ClienteDetalle` inyecta en `getActivities`) — evita el ciclo `clientsApi ↔ marketingApi`.
 *
 * `marketingApi` lee `pedidosApi` (redenciones, atribución) + `clientsApi` (audiencias) +
 * `inventoryApi` (catálogo) — todo unidireccional. Estado en memoria, se resetea al recargar.
 */
import { promotions as seedPromotions } from "../data/promotions.mock";
import { coupons as seedCoupons } from "../data/coupons.mock";
import { audiences as seedAudiences } from "../data/audiences.mock";
import { campaigns as seedCampaigns } from "../data/campaigns.mock";
import { templates as seedTemplates } from "../data/templates.mock";
import { subscriptions as seedSubscriptions } from "../data/subscriptions.mock";
import { abandonedCarts as seedCarts } from "../data/abandonedCarts.mock";
import { loyaltyProgram as seedProgram, rewards as seedRewards, pointsLedgerSeed } from "../data/loyalty.mock";
import { listOrders } from "../../pedidos/api/pedidosApi";
import { getSku } from "../../inventario/api/inventoryApi";
import { listAccounts, getAccountSegments } from "../../clientes/api/clientsApi";
import { applyDiscount } from "../lib/discounts";
import { DELIVERED_PLUS, OPENED_PLUS, CHANNELS, hashPct } from "../lib/marketing";
import { earnedPoints, pointsToMoney } from "../lib/loyalty";
import { nowStamp, money, daysAgo, addMinutes, addMonths, monthKey, TODAY } from "../lib/time";
import { emit } from "../../automatizaciones/lib/bus";

const clone = (x) => JSON.parse(JSON.stringify(x));

let _promotions = clone(seedPromotions);
let _coupons = clone(seedCoupons);
let _redemptions = []; // se materializan desde los pedidos pagados con `couponCode`
let _audiences = clone(seedAudiences);
let _campaigns = clone(seedCampaigns);
let _templates = clone(seedTemplates);
let _subscriptions = clone(seedSubscriptions);
let _sends = []; // se materializan desde las campañas lanzadas
let _carts = clone(seedCarts);
let _program = clone(seedProgram);
let _rewards = clone(seedRewards);
let _ledger = clone(pointsLedgerSeed); // los `earn`/`redeem`/`expire` de pedidos se materializan en lectura
const _seq = { promo: seedPromotions.length, coupon: seedCoupons.length, audience: seedAudiences.length, campaign: seedCampaigns.length, template: seedTemplates.length, cart: seedCarts.length, reward: seedRewards.length };

const PAID = ["Pagado", "Reembolsado", "Reembolso pendiente"];

// ---------------------------------------------------------------------------
// Contexto del cliente (para evaluar condiciones)
// ---------------------------------------------------------------------------
const accountByName = (name) =>
  listAccounts().find((a) => a.name.trim().toLowerCase() === (name || "").trim().toLowerCase()) || null;

const resolveContext = (customerName) => {
  const account = accountByName(customerName);
  const paidOrders = listOrders().filter((o) => o.customerName === customerName && o.paymentStatus === "Pagado");
  return {
    account,
    orderCount: paidOrders.length,
    segmentKey: account?.metrics?.segmentKey || null,
    tier: account?.metrics?.tier || null,
    channel: account?.type === "company" ? "b2b" : "online",
  };
};

const buildCart = ({ items = [], customerName } = {}) => {
  const enriched = items.map((it) => {
    const sku = getSku(it.skuId);
    return { ...it, name: sku?.name || it.skuId, category: sku?.category || null };
  });
  return {
    items: enriched,
    subtotal: enriched.reduce((s, it) => s + it.qty * it.unitPrice, 0),
    customerName,
  };
};

// ---------------------------------------------------------------------------
// Motor de descuentos
// ---------------------------------------------------------------------------
const isPromoLive = (p) => {
  if (p.status !== "activa") return false;
  const now = nowStamp();
  if (p.startsAt && now < p.startsAt) return false;
  if (p.endsAt && now > p.endsAt) return false;
  return true;
};

const promoMatches = (p, cart, ctx) => {
  const c = p.conditions || {};
  if (c.minSubtotal && cart.subtotal < c.minSubtotal) return false;
  if (c.firstPurchase && ctx.orderCount > 0) return false;
  if (c.segments?.length && !c.segments.includes(ctx.segmentKey)) return false;
  if (c.tiers?.length && !c.tiers.includes(ctx.tier)) return false;
  if (p.channel && p.channel !== "all" && p.channel !== ctx.channel) return false;
  return true;
};

/** Evalúa las promociones automáticas activas contra el carrito. No incluye cupones. */
export const priceCart = ({ items = [], customerName } = {}) => {
  const cart = buildCart({ items, customerName });
  const ctx = resolveContext(customerName);

  const applicable = _promotions
    .filter(isPromoLive)
    .filter((p) => promoMatches(p, cart, ctx))
    .map((p) => ({
      id: p.id, name: p.name, stackable: p.stackable, priority: p.priority,
      type: p.discount.type, ...applyDiscount(p.discount, cart),
    }));

  const freeShipPromo = applicable.find((p) => p.type === "free_shipping") || null;
  const valuePromos = applicable.filter((p) => p.type !== "free_shipping");
  const stackables = valuePromos.filter((p) => p.stackable);
  const nonStackables = valuePromos
    .filter((p) => !p.stackable)
    .sort((a, b) => b.priority - a.priority || b.amount - a.amount);
  const chosen = [...(nonStackables[0] ? [nonStackables[0]] : []), ...stackables];

  // Beneficio por tier de Fidelización (§8.7): se apila sobre las promos y aplica sobre el neto ya
  // descontado. `tierBenefits` es una capa declarativa encima del `tier` que calcula el CRM.
  const benefit = ctx.tier ? _program.tierBenefits?.[ctx.tier] : null;
  let tierBenefit = null;
  if (benefit?.extraPercent) {
    const netSoFar = cart.subtotal - chosen.reduce((s, p) => s + p.amount, 0);
    const amount = Math.round((netSoFar * benefit.extraPercent) / 100);
    if (amount > 0) tierBenefit = { id: `TIER-${ctx.tier}`, name: `Beneficio ${ctx.tier.toUpperCase()} · ${benefit.extraPercent}%`, amount };
  }
  const allValue = [...chosen, ...(tierBenefit ? [tierBenefit] : [])];

  return {
    subtotal: cart.subtotal,
    appliedPromotions: allValue.map((p) => ({ id: p.id, name: p.name, amount: p.amount })),
    promoDiscount: allValue.reduce((s, p) => s + p.amount, 0),
    freeShipping: Boolean(freeShipPromo) || Boolean(benefit?.freeShipping),
    freeShippingPromo: freeShipPromo
      ? { id: freeShipPromo.id, name: freeShipPromo.name }
      : benefit?.freeShipping ? { id: `TIER-${ctx.tier}`, name: `Envío gratis ${ctx.tier.toUpperCase()}` } : null,
  };
};

export const validateCoupon = (code, { items = [], customerName } = {}) => {
  const cart = buildCart({ items, customerName });
  const ctx = resolveContext(customerName);
  const coupon = _coupons.find((c) => c.code.toUpperCase() === (code || "").trim().toUpperCase());

  if (!coupon) return { valid: false, reason: "El código no existe." };
  if (coupon.status === "vencido") return { valid: false, reason: "El cupón está vencido." };
  if (coupon.status === "pausado") return { valid: false, reason: "El cupón está pausado." };

  const now = nowStamp();
  if (coupon.startsAt && now < coupon.startsAt) return { valid: false, reason: "El cupón todavía no está vigente." };
  if (coupon.endsAt && now > coupon.endsAt) return { valid: false, reason: "El cupón venció." };

  ensureRedemptions();
  const used = _redemptions.filter((r) => r.couponId === coupon.id);
  if (coupon.limits?.maxRedemptions && used.length >= coupon.limits.maxRedemptions) {
    return { valid: false, reason: "El cupón agotó sus usos." };
  }
  if (coupon.limits?.maxPerCustomer && used.filter((r) => r.customerName === customerName).length >= coupon.limits.maxPerCustomer) {
    return { valid: false, reason: "Este cliente ya usó el cupón." };
  }
  if (coupon.conditions?.minSubtotal && cart.subtotal < coupon.conditions.minSubtotal) {
    return { valid: false, reason: `Requiere una compra de al menos ${money(coupon.conditions.minSubtotal)}.` };
  }
  if (coupon.conditions?.firstPurchase && ctx.orderCount > 0) {
    return { valid: false, reason: "El cupón es sólo para la primera compra." };
  }
  if (coupon.restrictToCustomer && ctx.account?.id !== coupon.restrictToCustomer) {
    return { valid: false, reason: "El cupón es nominal y no corresponde a este cliente." };
  }
  if (coupon.restrictToAudience?.segments?.length && !coupon.restrictToAudience.segments.includes(ctx.segmentKey)) {
    return { valid: false, reason: "El cliente no pertenece a la audiencia del cupón." };
  }

  const { amount, freeShipping } = applyDiscount(coupon.discount, cart);
  return { valid: true, code: coupon.code, couponId: coupon.id, discount: amount, freeShipping, coupon };
};

/**
 * Resultado combinado para el flujo "Aplicar cupón / promoción" del alta de pedido.
 * Regla (§6.3): un cupón **de valor** reemplaza a las promociones automáticas de valor; el envío
 * gratis (de cupón o de promo) se mantiene en paralelo.
 */
export const quoteDiscount = ({ items = [], customerName, couponCode } = {}) => {
  const promo = priceCart({ items, customerName });
  let coupon = null;
  if (couponCode) {
    const res = validateCoupon(couponCode, { items, customerName });
    if (res.valid) coupon = res;
    else return { error: res.reason, ...emptyQuote(promo) };
  }

  if (coupon) {
    const couponIsValue = coupon.coupon.discount.type !== "free_shipping";
    return {
      discount: couponIsValue ? coupon.discount : promo.promoDiscount,
      couponCode: coupon.code,
      appliedPromotions: couponIsValue
        ? (promo.freeShippingPromo ? [promo.freeShippingPromo] : [])
        : promo.appliedPromotions,
      freeShipping: coupon.freeShipping || promo.freeShipping,
    };
  }
  return emptyQuote(promo);
};

const emptyQuote = (promo) => ({
  discount: promo.promoDiscount,
  couponCode: null,
  appliedPromotions: promo.appliedPromotions,
  freeShipping: promo.freeShipping,
});

// ---------------------------------------------------------------------------
// Redenciones y usos (materializados desde los pedidos pagados)
// ---------------------------------------------------------------------------
function ensureRedemptions() {
  for (const o of listOrders()) {
    if (!o.couponCode || o.paymentStatus !== "Pagado") continue;
    if (_redemptions.some((r) => r.orderId === o.id)) continue;
    const coupon = _coupons.find((c) => c.code === o.couponCode);
    if (!coupon) continue;
    _redemptions = [
      { id: `RED-${o.id}`, couponId: coupon.id, code: coupon.code, orderId: o.id, customerName: o.customerName, amount: o.discount || 0, at: o.paidAt },
      ..._redemptions,
    ];
  }
}

export const getCouponRedemptions = (couponId) => {
  ensureRedemptions();
  return _redemptions.filter((r) => r.couponId === couponId).sort((a, b) => new Date(b.at) - new Date(a.at));
};

export const getPromotionUsage = (promoId) =>
  listOrders()
    .filter((o) => o.paymentStatus === "Pagado" && (o.appliedPromotions || []).some((p) => (typeof p === "string" ? p : p.id) === promoId))
    .map((o) => ({ orderId: o.id, customerName: o.customerName, amount: o.discount || 0, at: o.paidAt }));

// ---------------------------------------------------------------------------
// Promociones — CRUD
// ---------------------------------------------------------------------------
const enrichPromotion = (p) => ({ ...p, usage: getPromotionUsage(p.id) });

export const listPromotions = ({ status } = {}) =>
  _promotions
    .filter((p) => !status || p.status === status)
    .map(enrichPromotion)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getPromotion = (id) => {
  const p = _promotions.find((x) => x.id === id);
  return p ? enrichPromotion(p) : null;
};

export const createPromotion = (data) => {
  const promo = {
    id: `PRM-${String(++_seq.promo).padStart(2, "0")}`,
    name: data.name?.trim() || "Promoción sin nombre",
    description: data.description?.trim() || "",
    discount: data.discount || { type: "percent", value: 10 },
    conditions: data.conditions || {},
    stackable: Boolean(data.stackable),
    priority: Number(data.priority) || 10,
    channel: data.channel || "all",
    status: data.status || "borrador",
    startsAt: data.startsAt || nowStamp(),
    endsAt: data.endsAt || null,
    createdAt: nowStamp(),
  };
  _promotions = [promo, ..._promotions];
  return enrichPromotion(promo);
};

export const updatePromotion = (id, data) => {
  _promotions = _promotions.map((p) => (p.id === id ? { ...p, ...data } : p));
  return getPromotion(id);
};

export const setPromotionStatus = (id, status) => updatePromotion(id, { status });
export const deletePromotion = (id) => { _promotions = _promotions.filter((p) => p.id !== id); };

// ---------------------------------------------------------------------------
// Cupones — CRUD
// ---------------------------------------------------------------------------
const enrichCoupon = (c) => {
  const redemptions = getCouponRedemptions(c.id);
  return {
    ...c,
    redemptionCount: redemptions.length,
    redemptionAmount: redemptions.reduce((s, r) => s + r.amount, 0),
    redemptions,
  };
};

export const listCoupons = ({ status, origin } = {}) =>
  _coupons
    .filter((c) => !status || c.status === status)
    .filter((c) => !origin || c.origin === origin)
    .map(enrichCoupon)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getCoupon = (id) => {
  const c = _coupons.find((x) => x.id === id);
  return c ? enrichCoupon(c) : null;
};

export const generateCode = (prefix = "CHECAT") => {
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}${rnd}`;
};

export const createCoupon = (data) => {
  const code = (data.code || generateCode()).trim().toUpperCase();
  if (_coupons.some((c) => c.code === code)) throw new Error("Ya existe un cupón con ese código.");
  const coupon = {
    id: `CUP-${String(++_seq.coupon).padStart(2, "0")}`,
    code,
    description: data.description?.trim() || "",
    discount: data.discount || { type: "percent", value: 10 },
    conditions: data.conditions || {},
    limits: data.limits || { maxRedemptions: null, maxPerCustomer: 1 },
    restrictToCustomer: data.restrictToCustomer || null,
    restrictToAudience: data.restrictToAudience || null,
    origin: data.origin || "manual",
    campaignName: data.campaignName || null,
    startsAt: data.startsAt || nowStamp(),
    endsAt: data.endsAt || null,
    status: data.status || "activo",
    createdAt: nowStamp(),
  };
  _coupons = [coupon, ..._coupons];
  return enrichCoupon(coupon);
};

export const updateCoupon = (id, data) => {
  _coupons = _coupons.map((c) => (c.id === id ? { ...c, ...data } : c));
  return getCoupon(id);
};

export const setCouponStatus = (id, status) => updateCoupon(id, { status });
export const deleteCoupon = (id) => { _coupons = _coupons.filter((c) => c.id !== id); };

// ---------------------------------------------------------------------------
// Resúmenes
// ---------------------------------------------------------------------------
export const getPromotionsSummary = () => {
  const list = listPromotions();
  return {
    activas: list.filter((p) => p.status === "activa").length,
    programadas: list.filter((p) => p.status === "programada").length,
    usos: list.reduce((s, p) => s + p.usage.length, 0),
    montoDescontado: list.reduce((s, p) => s + p.usage.reduce((a, u) => a + u.amount, 0), 0),
  };
};

export const getCouponsSummary = () => {
  const list = listCoupons();
  const soon = daysAgo(-30);
  return {
    activos: list.filter((c) => c.status === "activo").length,
    porVencer: list.filter((c) => c.status === "activo" && c.endsAt && new Date(c.endsAt) <= soon).length,
    redenciones: list.reduce((s, c) => s + c.redemptionCount, 0),
    montoDescontado: list.reduce((s, c) => s + c.redemptionAmount, 0),
  };
};

// ===========================================================================
// FASE 2 — Audiencias, Campañas, Comunicación
// ===========================================================================

// --- Suscripciones por canal (§6.5 — bloquean el envío) --------------------
export const getSubscription = (accountId, channel) =>
  _subscriptions.find((s) => s.accountId === accountId && s.channel === channel) || null;

const isBlocked = (accountId, channel) => getSubscription(accountId, channel)?.status === "baja";

export const listSubscriptions = () =>
  _subscriptions
    .map((s) => {
      const acc = listAccounts().find((a) => a.id === s.accountId);
      return { ...s, customerName: acc?.name || s.accountId };
    })
    .sort((a, b) => new Date(b.unsubscribedAt || 0) - new Date(a.unsubscribedAt || 0));

export const setSubscription = (accountId, channel, status) => {
  const existing = _subscriptions.find((s) => s.accountId === accountId && s.channel === channel);
  if (existing) {
    _subscriptions = _subscriptions.map((s) => (s === existing
      ? { ...s, status, unsubscribedAt: status === "baja" ? nowStamp() : null }
      : s));
  } else {
    _subscriptions = [{ accountId, channel, status, unsubscribedAt: status === "baja" ? nowStamp() : null, source: "manual" }, ..._subscriptions];
  }
  return getSubscription(accountId, channel);
};

// --- Audiencias — base del CRM + filtros de marketing + exclusiones --------
const openedAtLeastOnce = (accountId) => _sends.some((s) => s.accountId === accountId && OPENED_PLUS.includes(s.status));

export const resolveAudience = (audience) => {
  if (!audience) return [];
  ensureAllSends();
  let accounts = listAccounts();

  const b = audience.base || { type: "all" };
  if (b.type === "tag") accounts = accounts.filter((a) => (a.tags || []).includes(b.value));
  else if (b.type === "segment") accounts = accounts.filter((a) => a.metrics?.segmentKey === b.value);
  else if (b.type === "manualSegment") accounts = accounts.filter((a) => getAccountSegments(a.id).some((s) => s.id === b.value));

  for (const f of audience.filters || []) {
    if (f.field === "days_since_last_order_gt") accounts = accounts.filter((a) => (a.metrics?.recencyDays ?? 99999) > Number(f.value));
    else if (f.field === "min_ltv") accounts = accounts.filter((a) => (a.metrics?.ltv ?? 0) >= Number(f.value));
    else if (f.field === "subscribed_email") accounts = accounts.filter((a) => !getSubscription(a.id, "email") || getSubscription(a.id, "email").status === "suscripto");
    else if (f.field === "opened_any_campaign") accounts = accounts.filter((a) => openedAtLeastOnce(a.id));
    else if (f.field === "never_opened") accounts = accounts.filter((a) => !openedAtLeastOnce(a.id));
    else if (f.field === "has_unused_coupon") accounts = accounts.filter((a) => _coupons.some((c) => c.restrictToCustomer === a.id && c.status === "activo" && !getCouponRedemptions(c.id).length));
  }

  const ex = audience.exclusions || {};
  if (ex.segments?.length) accounts = accounts.filter((a) => !ex.segments.includes(a.metrics?.segmentKey));
  if (ex.tags?.length) accounts = accounts.filter((a) => !(a.tags || []).some((t) => ex.tags.includes(t)));
  if (ex.unsubscribed) accounts = accounts.filter((a) => !isBlocked(a.id, "email"));
  if (ex.boughtWithinDays) accounts = accounts.filter((a) => (a.metrics?.recencyDays ?? 99999) > ex.boughtWithinDays);

  return accounts.map((a) => a.id);
};

const enrichAudience = (a) => {
  const ids = resolveAudience(a);
  return { ...a, memberCount: ids.length, usedBy: _campaigns.filter((c) => c.audienceId === a.id).map((c) => ({ id: c.id, name: c.name })) };
};

export const listAudiences = () => _audiences.map(enrichAudience).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
export const getAudience = (id) => {
  const a = _audiences.find((x) => x.id === id);
  return a ? enrichAudience(a) : null;
};

export const previewAudience = (audienceOrId) => {
  const audience = typeof audienceOrId === "string" ? _audiences.find((a) => a.id === audienceOrId) : audienceOrId;
  const ids = resolveAudience(audience);
  const byId = new Map(listAccounts().map((a) => [a.id, a]));
  return ids.map((id) => {
    const a = byId.get(id);
    return { id, name: a?.name || id, segmentKey: a?.metrics?.segmentKey, ltv: a?.metrics?.ltv || 0, recencyDays: a?.metrics?.recencyDays };
  });
};

export const createAudience = (data) => {
  const audience = {
    id: `AUD-${String(++_seq.audience).padStart(2, "0")}`,
    name: data.name?.trim() || "Audiencia sin nombre",
    base: data.base || { type: "all" },
    filters: data.filters || [],
    exclusions: data.exclusions || {},
    createdAt: nowStamp(),
  };
  _audiences = [audience, ..._audiences];
  return enrichAudience(audience);
};
export const updateAudience = (id, data) => {
  _audiences = _audiences.map((a) => (a.id === id ? { ...a, ...data } : a));
  return getAudience(id);
};
export const deleteAudience = (id) => { _audiences = _audiences.filter((a) => a.id !== id); };

// --- Plantillas de mensaje (§8.8) ----------------------------------------
export const listTemplates = ({ channel } = {}) =>
  _templates.filter((t) => !channel || t.channel === channel).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
export const getTemplate = (id) => _templates.find((t) => t.id === id) || null;
export const createTemplate = (data) => {
  const tpl = {
    id: `TPL-${String(++_seq.template).padStart(2, "0")}`,
    name: data.name?.trim() || "Plantilla sin nombre",
    channel: data.channel || "email",
    category: data.category || "promocional",
    subject: data.subject ?? "",
    body: data.body ?? "",
    previewProductIds: data.previewProductIds || [],
    createdAt: nowStamp(),
  };
  _templates = [tpl, ..._templates];
  return tpl;
};
export const updateTemplate = (id, data) => {
  _templates = _templates.map((t) => (t.id === id ? { ...t, ...data } : t));
  return getTemplate(id);
};
export const deleteTemplate = (id) => { _templates = _templates.filter((t) => t.id !== id); };

// --- Campañas — envíos simulados + métricas + atribución (§5.4 / §6) -----
function ensureSends(campaign) {
  if (!campaign || !["en_curso", "finalizada", "pausada"].includes(campaign.status)) return;
  if (_sends.some((s) => s.campaignId === campaign.id)) return;
  const chan = campaign.channel;
  const couponCode = campaign.offer?.type === "coupon" ? campaign.offer.couponCode : null;
  const base = campaign.launchedAt || nowStamp();
  const created = [];

  for (const accId of campaign.audienceSnapshot || []) {
    if (isBlocked(accId, chan)) continue;
    const seed = `${campaign.id}|${accId}`;
    const p = hashPct(seed);
    const events = [{ status: "enviado", at: addMinutes(base, 1) }];
    let status;
    if (p < 0.045) {
      status = "rebotado";
      events.push({ status: "rebotado", at: addMinutes(base, 3) });
    } else {
      events.push({ status: "entregado", at: addMinutes(base, 4) });
      status = "entregado";
      const openP = hashPct(`${seed}|open`);
      if (openP < 0.48) {
        status = "abierto";
        events.push({ status: "abierto", at: addMinutes(base, 120 + Math.round(openP * 4000)) });
        if (hashPct(`${seed}|click`) < 0.34) {
          status = "click";
          events.push({ status: "click", at: addMinutes(base, 130 + Math.round(openP * 4000)) });
        }
      }
    }
    created.push({
      id: `SND-${campaign.id}-${accId}`,
      campaignId: campaign.id, accountId: accId, channel: chan, templateId: campaign.templateId,
      status, events, couponCode, sentAt: events[0].at,
    });
  }
  _sends = [...created, ..._sends];
}

const ensureAllSends = () => { _campaigns.forEach(ensureSends); };

export const getCampaignConversions = (campaignId, { windowDays = 14 } = {}) => {
  const campaign = _campaigns.find((c) => c.id === campaignId);
  if (!campaign || !campaign.launchedAt) return [];
  ensureSends(campaign);
  const couponCode = campaign.offer?.type === "coupon" ? campaign.offer.couponCode : null;
  const touched = new Set(_sends.filter((s) => s.campaignId === campaignId && DELIVERED_PLUS.includes(s.status)).map((s) => s.accountId));
  const start = new Date(campaign.launchedAt);
  const end = new Date(campaign.launchedAt);
  end.setDate(end.getDate() + windowDays);

  const out = [];
  for (const o of listOrders()) {
    if (o.paymentStatus !== "Pagado") continue;
    const acc = accountByName(o.customerName);
    const byCoupon = couponCode && o.couponCode === couponCode;
    const bySend = acc && touched.has(acc.id) && new Date(o.paidAt) >= start && new Date(o.paidAt) <= end;
    if (byCoupon || bySend) out.push({ orderId: o.id, customerName: o.customerName, revenue: o.total, via: byCoupon ? "cupón" : "email", at: o.paidAt });
  }
  return out;
};

export const getCampaignMetrics = (campaignId) => {
  const campaign = _campaigns.find((c) => c.id === campaignId);
  ensureSends(campaign);
  const sends = _sends.filter((s) => s.campaignId === campaignId);
  const sent = sends.length;
  const delivered = sends.filter((s) => DELIVERED_PLUS.includes(s.status)).length;
  const opened = sends.filter((s) => OPENED_PLUS.includes(s.status)).length;
  const clicked = sends.filter((s) => s.status === "click").length;
  const bounced = sends.filter((s) => s.status === "rebotado").length;
  const conversions = getCampaignConversions(campaignId);
  const revenue = conversions.reduce((s, c) => s + c.revenue, 0);
  const cost = delivered * (CHANNELS[campaign?.channel]?.cost || 0);
  return {
    sent, delivered, opened, clicked, bounced,
    openRate: delivered ? opened / delivered : 0,
    clickRate: opened ? clicked / opened : 0,
    conversions: conversions.length, revenue, cost,
    roas: cost ? revenue / cost : null, // retorno sobre el costo del canal
  };
};

const enrichCampaign = (c) => ({
  ...c,
  audience: _audiences.find((a) => a.id === c.audienceId) || null,
  template: _templates.find((t) => t.id === c.templateId) || null,
  metrics: getCampaignMetrics(c.id),
});

export const listCampaigns = ({ status, triggered } = {}) => {
  ensureAllSends();
  return _campaigns
    .filter((c) => !status || c.status === status)
    .filter((c) => triggered == null || (c.schedule?.type === "triggered") === triggered)
    .map(enrichCampaign)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const getCampaign = (id) => {
  const c = _campaigns.find((x) => x.id === id);
  return c ? enrichCampaign(c) : null;
};

export const getCampaignSends = (campaignId) => {
  ensureSends(_campaigns.find((c) => c.id === campaignId));
  const byId = new Map(listAccounts().map((a) => [a.id, a]));
  return _sends
    .filter((s) => s.campaignId === campaignId)
    .map((s) => ({ ...s, customerName: byId.get(s.accountId)?.name || s.accountId }))
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
};

export const createCampaign = (data) => {
  const c = {
    id: `CMP-${String(++_seq.campaign).padStart(2, "0")}`,
    name: data.name?.trim() || "Campaña sin nombre",
    objective: data.objective || "conversion",
    audienceId: data.audienceId || null,
    channel: data.channel || "email",
    templateId: data.templateId || null,
    offer: data.offer || { type: "none" },
    schedule: data.schedule || { type: "once", sendAt: nowStamp() },
    status: "borrador",
    audienceSnapshot: [],
    createdAt: nowStamp(),
    launchedAt: null,
    finishedAt: null,
  };
  _campaigns = [c, ..._campaigns];
  return getCampaign(c.id);
};

export const updateCampaign = (id, data) => {
  _campaigns = _campaigns.map((c) => (c.id === id ? { ...c, ...data } : c));
  return getCampaign(id);
};

export const launchCampaign = (id) => {
  const c = _campaigns.find((x) => x.id === id);
  if (!c) throw new Error("Campaña no encontrada.");
  if (!["borrador", "programada"].includes(c.status)) throw new Error("La campaña ya está en curso o finalizada.");
  if (!c.audienceId || !c.templateId) throw new Error("Elegí una audiencia y una plantilla antes de lanzar.");
  const snapshot = resolveAudience(_audiences.find((a) => a.id === c.audienceId));
  _campaigns = _campaigns.map((x) => (x.id === id ? { ...x, status: "en_curso", launchedAt: nowStamp(), audienceSnapshot: snapshot } : x));
  ensureSends(_campaigns.find((x) => x.id === id));
  const launched = getCampaign(id);
  emit("campania.lanzada", { type: "account", id: null }, {
    campaignId: id, name: launched.name, audienceSize: snapshot.length,
  });
  return launched;
};

export const pauseCampaign = (id) => updateCampaign(id, { status: "pausada" });
export const resumeCampaign = (id) => updateCampaign(id, { status: "en_curso" });
export const finishCampaign = (id) => updateCampaign(id, { status: "finalizada", finishedAt: nowStamp() });

/** "Simular disparo" de una campaña triggered: agrega un envío a la próxima cuenta elegible. */
export const simulateTrigger = (id) => {
  const c = _campaigns.find((x) => x.id === id);
  if (!c || c.schedule?.type !== "triggered") throw new Error("Sólo las campañas automáticas se pueden disparar manualmente.");
  const candidates = resolveAudience(_audiences.find((a) => a.id === c.audienceId))
    .filter((accId) => !_sends.some((s) => s.campaignId === id && s.accountId === accId) && !isBlocked(accId, c.channel));
  if (!candidates.length) throw new Error("Todas las cuentas de la audiencia ya recibieron esta campaña.");
  const accId = candidates[0];
  const now = nowStamp();
  _sends = [{
    id: `SND-${id}-${accId}-${_sends.length}`,
    campaignId: id, accountId: accId, channel: c.channel, templateId: c.templateId,
    status: "entregado",
    events: [{ status: "enviado", at: now }, { status: "entregado", at: addMinutes(now, 2) }],
    couponCode: c.offer?.type === "coupon" ? c.offer.couponCode : null,
    sentAt: now,
  }, ..._sends];
  return { accountId: accId };
};

// --- Comunicación — log de envíos --------------------------------------
export const listSends = ({ campaignId, channel } = {}) => {
  ensureAllSends();
  const byId = new Map(listAccounts().map((a) => [a.id, a]));
  const campById = new Map(_campaigns.map((c) => [c.id, c]));
  return _sends
    .filter((s) => !campaignId || s.campaignId === campaignId)
    .filter((s) => !channel || s.channel === channel)
    .map((s) => ({ ...s, customerName: byId.get(s.accountId)?.name || s.accountId, campaignName: campById.get(s.campaignId)?.name || s.campaignId }))
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
};

// --- Actividad de marketing para el timeline del CRM ------------------
const ACT_LABEL = { enviado: "enviado", abierto: "abierto", click: "con clic" };

export const getAccountMarketingActivity = (accountId) => {
  ensureAllSends();
  const campById = new Map(_campaigns.map((c) => [c.id, c]));
  return _sends
    .filter((s) => s.accountId === accountId)
    .flatMap((s) =>
      s.events
        .filter((e) => ["enviado", "abierto", "click"].includes(e.status))
        .map((e) => ({
          id: `MKT-${s.id}-${e.status}`,
          accountId,
          type: "campaign",
          title: `Email ${ACT_LABEL[e.status]} · ${campById.get(s.campaignId)?.name || s.campaignId}`,
          actor: { kind: "system", name: "Marketing" },
          at: e.at,
        }))
    );
};

// --- Resumen (§8.1) ---------------------------------------------------
export const getMarketingSummary = ({ month } = {}) => {
  ensureAllSends();
  const campaigns = _campaigns.map(enrichCampaign);
  const inMonth = (c) => !month || (c.launchedAt && monthKey(c.launchedAt) === month);
  const scoped = campaigns.filter(inMonth);

  const allConversions = scoped.flatMap((c) => getCampaignConversions(c.id));
  const delivered = _sends.filter((s) => DELIVERED_PLUS.includes(s.status)).length;
  const opened = _sends.filter((s) => OPENED_PLUS.includes(s.status)).length;

  return {
    activeCampaigns: campaigns.filter((c) => c.status === "en_curso").length,
    scheduledCampaigns: campaigns.filter((c) => c.status === "programada").length,
    attributedRevenue: allConversions.reduce((s, c) => s + c.revenue, 0),
    conversions: allConversions.length,
    avgOpenRate: delivered ? opened / delivered : 0,
    totalSends: _sends.length,
    upcoming: campaigns
      .filter((c) => c.status === "programada" && c.schedule?.sendAt)
      .sort((a, b) => new Date(a.schedule.sendAt) - new Date(b.schedule.sendAt)),
    topCampaigns: [...scoped]
      .filter((c) => c.metrics.sent > 0)
      .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
      .slice(0, 4),
  };
};

// ===========================================================================
// FASE 3 — Carritos abandonados + Fidelización
// ===========================================================================

const accountById = (id) => listAccounts().find((a) => a.id === id) || null;

// --- Carritos abandonados (§5.2 / §8.6) ---------------------------------
const enrichCart = (c) => {
  const acc = accountById(c.accountId);
  const items = c.items.map((it) => ({ ...it, name: getSku(it.skuId)?.name || it.skuId, lineTotal: it.qty * it.unitPrice }));
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const campaignName = c.recoveryCampaignId
    ? _campaigns.find((x) => x.id === c.recoveryCampaignId)?.name || c.recoveryCampaignId
    : c.recoveryCampaignName || null;
  return { ...c, customerName: acc?.name || c.accountId, items, subtotal, itemCount: items.reduce((s, it) => s + it.qty, 0), campaignName };
};

/** Marca `recuperado` los carritos con recuperación enviada cuya cuenta compró después. */
function ensureCartRecovery() {
  const paid = listOrders().filter((o) => o.paymentStatus === "Pagado");
  _carts = _carts.map((c) => {
    if (c.status !== "abierto" || !c.recoveryCampaignId) return c;
    const acc = accountById(c.accountId);
    const order = paid.find((o) => o.customerName === acc?.name && new Date(o.paidAt) > new Date(c.lastActivityAt));
    return order ? { ...c, status: "recuperado", recoveredOrderId: order.id } : c;
  });
}

export const listAbandonedCarts = ({ status } = {}) => {
  ensureCartRecovery();
  return _carts
    .filter((c) => !status || c.status === status)
    .map(enrichCart)
    .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
};

export const getAbandonedCart = (id) => {
  const c = _carts.find((x) => x.id === id);
  return c ? enrichCart(c) : null;
};

export const getAbandonedCartsSummary = () => {
  const list = listAbandonedCarts();
  const withRecovery = list.filter((c) => c.status !== "abierto");
  const recovered = list.filter((c) => c.status === "recuperado");
  return {
    openCount: list.filter((c) => c.status === "abierto").length,
    openValue: list.filter((c) => c.status === "abierto").reduce((s, c) => s + c.subtotal, 0),
    recoveryRate: withRecovery.length ? recovered.length / withRecovery.length : 0,
    recoveredRevenue: recovered.reduce((s, c) => s + c.subtotal, 0),
  };
};

/**
 * "Enviar recuperación" (§5.2): crea un cupón nominal + una campaña one-shot en curso para esa
 * cuenta. `ensureSends` materializa el envío; si la cuenta compra dentro de la ventana el carrito
 * pasa a `recuperado` y la campaña suma la conversión.
 */
export const sendCartRecovery = (cartId) => {
  const cart = _carts.find((c) => c.id === cartId);
  if (!cart) throw new Error("Carrito no encontrado.");
  if (cart.status !== "abierto") throw new Error("El carrito ya está cerrado.");
  if (cart.recoveryCampaignId) throw new Error("Ya se envió una recuperación para este carrito.");
  const acc = accountById(cart.accountId);
  if (!acc) throw new Error("La cuenta del carrito no existe en el CRM.");
  if (isBlocked(acc.id, "email")) throw new Error(`${acc.name} se dio de baja del canal email.`);

  const code = `RESCATE-${cart.id.replace("CART-", "")}`;
  const coupon = createCoupon({
    code,
    description: `Recuperá tu carrito · ${acc.name}`,
    discount: { type: "percent", value: 10, maxAmount: 8000, scope: "all" },
    conditions: {},
    limits: { maxRedemptions: 1, maxPerCustomer: 1 },
    restrictToCustomer: acc.id,
    origin: "campaign",
    campaignName: `Recuperación · ${acc.name}`,
    endsAt: nowStamp(),
  });
  updateCoupon(coupon.id, { endsAt: `${daysAgo(-14).toISOString().slice(0, 10)}T23:59:59` });

  const draft = createCampaign({
    name: `Recuperación · ${acc.name}`,
    objective: "conversion",
    channel: "email",
    templateId: _templates.find((t) => t.category === "transaccional")?.id || _templates[0]?.id || null,
    offer: { type: "coupon", couponCode: code },
    schedule: { type: "triggered", trigger: "abandoned_cart" },
  });
  _campaigns = _campaigns.map((x) => (x.id === draft.id
    ? { ...x, status: "en_curso", launchedAt: nowStamp(), audienceSnapshot: [acc.id] }
    : x));
  ensureSends(_campaigns.find((x) => x.id === draft.id));

  _carts = _carts.map((c) => (c.id === cartId
    ? { ...c, recoveryCampaignId: draft.id, recoveryCampaignName: null, couponCode: code }
    : c));
  return { campaignId: draft.id, couponCode: code };
};

/** "Generar carrito de ejemplo" (demo): arma un carrito abierto para una cuenta al azar sin uno. */
export const generateSampleCart = () => {
  const used = new Set(_carts.map((c) => c.accountId));
  const candidates = listAccounts().filter((a) => !used.has(a.id) && !isBlocked(a.id, "email"));
  const pool = candidates.length ? candidates : listAccounts();
  const acc = pool[Math.floor(hashPct(`cart|${_carts.length}|${nowStamp()}`) * pool.length)] || pool[0];
  const skus = ["SKU-1", "SKU-2", "SKU-3", "SKU-4", "SKU-5"];
  const n = 1 + Math.floor(hashPct(`n|${acc.id}|${_carts.length}`) * 2);
  const prices = { "SKU-1": 45000, "SKU-2": 12000, "SKU-3": 18500, "SKU-4": 8000, "SKU-5": 52000 };
  const items = [];
  for (let i = 0; i < n; i++) {
    const sku = skus[Math.floor(hashPct(`s|${acc.id}|${_carts.length}|${i}`) * skus.length)];
    if (items.some((it) => it.skuId === sku)) continue;
    items.push({ skuId: sku, qty: 1 + Math.floor(hashPct(`q|${sku}|${i}`) * 2), unitPrice: prices[sku] });
  }
  const cart = {
    id: `CART-${String(++_seq.cart).padStart(2, "0")}`,
    accountId: acc.id,
    items: items.length ? items : [{ skuId: "SKU-2", qty: 1, unitPrice: 12000 }],
    lastActivityAt: nowStamp(),
    status: "abierto",
    recoveryCampaignId: null,
    recoveryCampaignName: null,
    recoveredOrderId: null,
    couponCode: null,
  };
  _carts = [cart, ..._carts];
  return enrichCart(cart);
};

// --- Fidelización: programa + recompensas (§8.7) ------------------------
export const getLoyaltyProgram = () => clone(_program);

export const updateLoyaltyProgram = (data) => {
  _program = { ..._program, ...data, tierMultipliers: { ..._program.tierMultipliers, ...(data.tierMultipliers || {}) }, tierBenefits: { ..._program.tierBenefits, ...(data.tierBenefits || {}) } };
  return getLoyaltyProgram();
};

export const listRewards = ({ status } = {}) =>
  _rewards.filter((r) => !status || r.status === status).sort((a, b) => a.pointsCost - b.pointsCost);

export const getReward = (id) => _rewards.find((r) => r.id === id) || null;

export const createReward = (data) => {
  const reward = {
    id: `RW-${String(++_seq.reward).padStart(2, "0")}`,
    name: data.name?.trim() || "Recompensa sin nombre",
    pointsCost: Math.max(1, Math.round(data.pointsCost) || 1000),
    discount: data.discount || { type: "fixed", value: 1000, scope: "all" },
    status: data.status || "activa",
    createdAt: nowStamp(),
  };
  _rewards = [reward, ..._rewards];
  return reward;
};

export const updateReward = (id, data) => {
  _rewards = _rewards.map((r) => (r.id === id ? { ...r, ...data } : r));
  return getReward(id);
};

export const deleteReward = (id) => { _rewards = _rewards.filter((r) => r.id !== id); };

// --- Bitácora de puntos — materializada desde los pedidos (§5.3 / §6.6 / §12) ----
function ensurePointsLedger() {
  for (const o of listOrders()) {
    if (!o.paidAt || !PAID.includes(o.paymentStatus)) continue;
    const acc = accountByName(o.customerName);
    if (!acc) continue;
    const earnId = `PL-EARN-${o.id}`;
    if (!_ledger.some((e) => e.id === earnId)) {
      const pts = earnedPoints(o.total, _program, acc.metrics?.tier);
      if (pts > 0) _ledger.push({ id: earnId, accountId: acc.id, type: "earn", points: pts, sourceType: "order", sourceId: o.id, at: o.paidAt, expiresAt: addMonths(o.paidAt, _program.expiryMonths) });
    }
    if (o.pointsRedeemed > 0) {
      const redId = `PL-REDEEM-${o.id}`;
      if (!_ledger.some((e) => e.id === redId)) _ledger.push({ id: redId, accountId: acc.id, type: "redeem", points: -o.pointsRedeemed, sourceType: "order", sourceId: o.id, at: o.paidAt, expiresAt: null });
    }
    // Reversa por devolución (§6.6): se debita lo acumulado y se restituye lo canjeado.
    if (["Reembolsado", "Reembolso pendiente"].includes(o.paymentStatus)) {
      const earn = _ledger.find((e) => e.id === earnId);
      const when = o.returnedAt || o.refundedAt || o.paidAt;
      if (earn && !_ledger.some((e) => e.id === `PL-REV-${o.id}`)) _ledger.push({ id: `PL-REV-${o.id}`, accountId: acc.id, type: "reverse", points: -earn.points, sourceType: "order", sourceId: o.id, at: when, expiresAt: null });
      const red = _ledger.find((e) => e.id === `PL-REDEEM-${o.id}`);
      if (red && !_ledger.some((e) => e.id === `PL-REVRED-${o.id}`)) _ledger.push({ id: `PL-REVRED-${o.id}`, accountId: acc.id, type: "adjust", points: -red.points, sourceType: "order", sourceId: o.id, at: when, expiresAt: null, note: "Puntos restituidos por devolución" });
    }
  }
  // Vencimiento (§7): un `earn` cuyo `expiresAt` ya pasó y no fue revertido.
  for (const earn of _ledger.filter((e) => e.type === "earn" && e.expiresAt && new Date(e.expiresAt) < TODAY)) {
    const expId = `PL-EXP-${earn.id}`;
    if (_ledger.some((e) => e.id === `PL-REV-${earn.sourceId}`)) continue;
    if (!_ledger.some((e) => e.id === expId)) _ledger.push({ id: expId, accountId: earn.accountId, type: "expire", points: -earn.points, sourceType: "manual", sourceId: earn.id, at: earn.expiresAt, expiresAt: null });
  }
}

const ledgerSorted = () => {
  ensurePointsLedger();
  const asc = [..._ledger].sort((a, b) => new Date(a.at) - new Date(b.at));
  const bal = new Map();
  return asc.map((e) => {
    const next = (bal.get(e.accountId) || 0) + e.points;
    bal.set(e.accountId, next);
    return { ...e, balanceAfter: next };
  });
};

export const getPointsLedger = (accountId) => {
  const rows = ledgerSorted();
  const byId = new Map(listAccounts().map((a) => [a.id, a]));
  return rows
    .filter((e) => !accountId || e.accountId === accountId)
    .map((e) => ({ ...e, customerName: byId.get(e.accountId)?.name || e.accountId }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
};

export const getPointsBalance = (accountId) => {
  const rows = ledgerSorted().filter((e) => e.accountId === accountId);
  return rows.length ? rows[rows.length - 1].balanceAfter : 0;
};

export const getLoyaltySummary = () => {
  const rows = ledgerSorted();
  const balByAcc = new Map();
  rows.forEach((e) => balByAcc.set(e.accountId, e.balanceAfter));
  const balances = [...balByAcc.values()];
  const since = daysAgo(30);
  const redeemedPeriod = rows
    .filter((e) => e.type === "redeem" && new Date(e.at) >= since)
    .reduce((s, e) => s + Math.abs(e.points), 0);
  const soon = daysAgo(-30);
  const expiringSoon = _ledger
    .filter((e) => e.type === "earn" && e.expiresAt && new Date(e.expiresAt) > TODAY && new Date(e.expiresAt) <= soon)
    .filter((e) => !_ledger.some((x) => x.id === `PL-REV-${e.sourceId}`))
    .reduce((s, e) => s + e.points, 0);
  return {
    inCirculation: balances.filter((b) => b > 0).reduce((s, b) => s + b, 0),
    redeemedPeriod,
    customersWithPoints: balances.filter((b) => b > 0).length,
    expiringSoon,
  };
};

/**
 * Cotiza un canje de puntos para el checkout (§5.3). Devuelve el máximo canjeable de esa cuenta
 * (todo su saldo, respetando `minRedeem`) y su valor en $ — la UI de alta de pedido lo pasa a
 * `pedidosApi.applyDiscountToOrder` como `discount` + `pointsRedeemed`.
 */
export const quoteRedemption = (customerName) => {
  const acc = accountByName(customerName);
  if (!acc) return { available: 0, points: 0, value: 0, minRedeem: _program.minRedeem };
  const balance = getPointsBalance(acc.id);
  if (balance < _program.minRedeem) {
    return { available: balance, points: 0, value: 0, minRedeem: _program.minRedeem };
  }
  return { available: balance, points: balance, value: pointsToMoney(balance, _program), minRedeem: _program.minRedeem };
};

// --- Actividad de fidelización para el timeline del CRM ----------------
export const getAccountLoyaltyActivity = (accountId) => {
  const LABEL = { earn: "Puntos acumulados", redeem: "Puntos canjeados", expire: "Puntos vencidos", reverse: "Puntos revertidos (devolución)", adjust: "Ajuste de puntos" };
  return getPointsLedger(accountId).map((e) => ({
    id: `LOY-${e.id}`,
    accountId,
    type: "loyalty",
    title: `${LABEL[e.type] || "Movimiento de puntos"} · ${e.points > 0 ? "+" : ""}${e.points} (saldo ${e.balanceAfter})`,
    actor: { kind: "system", name: "Fidelización" },
    at: e.at,
  }));
};
