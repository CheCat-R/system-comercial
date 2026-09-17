/**
 * Capa de acceso a datos del CRM.
 *
 * REGLA DURA: la UI del módulo Clientes habla SÓLO con este archivo, nunca con
 * los mocks de `../data`. El día que exista el backend Laravel, se reescribe
 * únicamente este módulo (fetch a /api/v1/accounts…) y la UI no cambia.
 *
 * Fase 1 + 2: API síncrona sobre mocks, con un store en memoria para las
 * escrituras (notas, direcciones, etiquetas, segmentos manuales, config RFM)
 * que se resetea al recargar. Las vistas guardadas van a localStorage.
 */
import { accounts as seedAccounts, owners } from "../data/accounts.mock";
import { orders as seedOrders } from "../data/orders.mock";
import { quotes as seedQuotes } from "../data/quotes.mock";
import { activities as seedActivities } from "../data/activities.mock";
import { manualSegments as seedManualSegments } from "../data/segments.mock";
import { tagRegistry as seedTagRegistry } from "../data/tags.mock";
import { deriveMetrics } from "../lib/deriveMetrics";
import { segmentOf, tierOf } from "../lib/segments";
import { DEFAULT_RFM_CONFIG } from "../lib/rfm";
import { TODAY, parseDay, toDayString } from "../lib/time";
import { emit as busEmit } from "../../automatizaciones/lib/bus";
// Hoja sin dependencias, como el bus: importarla no puede crear un ciclo.
import { currentActor } from "../../seguridad/lib/audit";

/**
 * ⭐ Quién dejó este rastro.
 *
 * Estaba escrito a mano en tres lugares: { kind: "user", id: "me", name: "CheCAT
 * Admin" }. O sea el mismo createdBy = "Vos" que la F2 de Seguridad eliminó de
 * todo src/, sobreviviendo con otro nombre. Ahora sale del actor en contexto,
 * que puede ser una persona, una automatización o una integración.
 */
const actorNow = () => currentActor() || { kind: "sistema", id: "sistema", name: "Sistema" };

// ---- store mutable en memoria -------------------------------------------
let _accounts = structuredClone(seedAccounts);
let _orders = structuredClone(seedOrders);
let _quotes = structuredClone(seedQuotes);
let _activities = structuredClone(seedActivities);
let _manualSegments = structuredClone(seedManualSegments);
let _tagMeta = new Map(seedTagRegistry.map((t) => [t.name, t.color]));
let _rfmConfig = structuredClone(DEFAULT_RFM_CONFIG);
let _eventLog = [];
let _idSeq = 1;
const newId = (prefix) => `${prefix}-${Date.now()}-${_idSeq++}`;

/**
 * Bus de eventos (stub). En producción publicaría en una cola; acá deja
 * traza para inspección y demuestra la arquitectura orientada a eventos.
 */
/**
 * Cómo se traduce cada evento histórico del CRM a una clave del catálogo de
 * Automatizaciones (docs/MODULO-AUTOMATIZACIONES.md §3.4). Los nombres viejos
 * se mantienen para no tocar los cinco puntos de llamada ni `getEventLog()`.
 *
 * `Audiencia_Enviada_A_Marketing` no está mapeado a propósito: es un handoff
 * interno entre CRM y Marketing, no un hecho sobre el que tenga sentido
 * automatizar. Queda sólo en la traza local.
 */
const BUS_KEYS = {
  Segmento_Cambiado: { key: "cliente.segmento_cambiado", subject: (p) => ({ type: "account", id: p.accountId }) },
  Tier_Cambiado: { key: "cliente.tier_cambiado", subject: (p) => ({ type: "account", id: p.accountId }) },
  Cotizacion_Convertida: { key: "cliente.cotizacion_convertida", subject: (p) => ({ type: "account", id: p.accountId }) },
  Pedido_Creado: { key: "pedido.creado", subject: (p) => ({ type: "order", id: p.orderId }) },
};

const emitEvent = (name, payload = {}) => {
  const ev = { name, payload, at: new Date().toISOString() };
  _eventLog = [ev, ..._eventLog].slice(0, 100);

  // Además de la traza local histórica, publica en el bus compartido.
  const mapped = BUS_KEYS[name];
  if (mapped) {
    const account = _accounts.find((a) => a.id === payload.accountId);
    busEmit(mapped.key, mapped.subject(payload), { ...payload, name: account?.name });
  }
  return ev;
};

export const getEventLog = () => _eventLog.slice();

// ---- helpers ------------------------------------------------------------
const ordersOf = (accountId) =>
  _orders
    .filter((o) => o.accountId === accountId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

const quotesOf = (accountId) =>
  _quotes
    .filter((q) => q.accountId === accountId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const withMetrics = (account) => ({
  ...account,
  ownerName: owners[account.ownerUserId] || "—",
  metrics: deriveMetrics(account, ordersOf(account.id), _rfmConfig),
});

// Estado del último segmento conocido de cada cuenta, para detectar cambios.
const _lastSegment = new Map(
  _accounts.map((a) => [a.id, deriveMetrics(a, ordersOf(a.id), _rfmConfig).segmentKey])
);

/** Timestamp "ahora" anclado a la fecha de referencia (TODAY) con la hora real, en formato local. */
const nowStamp = () => {
  const n = new Date();
  return `${toDayString(TODAY)}T${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`;
};

const pushActivity = (act) => {
  _activities = [{ id: newId("EV"), at: nowStamp(), ...act }, ..._activities];
};

/** Recalcula segmentos de toda la cartera y registra los cambios en el timeline. */
const recomputeSegments = () => {
  _accounts.forEach((a) => {
    const next = deriveMetrics(a, ordersOf(a.id), _rfmConfig).segmentKey;
    const prev = _lastSegment.get(a.id);
    if (prev && prev !== next) {
      pushActivity({
        accountId: a.id,
        type: "segment",
        title: `Cambió de segmento: ${segmentOf(prev).label} → ${segmentOf(next).label}`,
        actor: { kind: "system", name: "Sistema" },
      });
      emitEvent("Segmento_Cambiado", { accountId: a.id, from: prev, to: next });
    }
    _lastSegment.set(a.id, next);
  });
};

const quoteToActivities = (quote) => {
  const out = [{
    id: `QT-${quote.id}-created`,
    accountId: quote.accountId,
    type: "quote",
    title: `Cotización ${quote.id} · $${quote.amount.toLocaleString("es-AR")}`,
    description: `Vendedor: ${quote.sellerName}`,
    actor: { kind: "user", name: quote.sellerName },
    refType: "quote",
    refId: quote.id,
    at: `${quote.createdAt}T11:00:00`,
  }];
  if (quote.status === "converted") {
    out.push({
      id: `QT-${quote.id}-won`,
      accountId: quote.accountId,
      type: "quote",
      title: quote.orderId
        ? `Cotización ${quote.id} convertida a pedido #${quote.orderId}`
        : `Cotización ${quote.id} convertida a pedido`,
      actor: { kind: "user", name: quote.sellerName },
      refType: quote.orderId ? "order" : "quote",
      refId: quote.orderId || quote.id,
      at: quote.convertedAt || `${quote.createdAt}T11:30:00`,
    });
  }
  if (quote.status === "lost") {
    out.push({
      id: `QT-${quote.id}-lost`,
      accountId: quote.accountId,
      type: "quote",
      title: `Cotización ${quote.id} marcada como perdida`,
      actor: { kind: "user", name: quote.sellerName },
      refType: "quote",
      refId: quote.id,
      at: `${quote.createdAt}T11:30:00`,
    });
  }
  return out;
};

const orderToActivities = (account, order) => {
  const out = [{
    id: `EV-${order.id}-created`,
    accountId: account.id,
    type: "order",
    title: `Pedido #${order.id} creado`,
    description: `${order.items} ${order.items === 1 ? "artículo" : "artículos"} · $${order.total.toLocaleString("es-AR")}`,
    actor: { kind: "customer", id: account.id, name: account.name },
    refType: "order",
    refId: order.id,
    at: `${order.date}T12:00:00`,
  }];

  if (order.paymentStatus === "paid") {
    out.push({
      id: `EV-${order.id}-paid`, accountId: account.id, type: "payment",
      title: `Pago aprobado · $${order.total.toLocaleString("es-AR")}`,
      actor: { kind: "system", name: "Sistema" }, refType: "order", refId: order.id,
      at: `${order.date}T12:35:00`,
    });
  }
  if (order.paymentStatus === "refunded") {
    out.push({
      id: `EV-${order.id}-refund`, accountId: account.id, type: "refund",
      title: `Devolución procesada · $${order.total.toLocaleString("es-AR")}`,
      actor: { kind: "system", name: "Sistema" }, refType: "order", refId: order.id,
      at: `${order.date}T15:00:00`,
    });
  }
  if (order.fulfillmentStatus === "shipped" || order.fulfillmentStatus === "delivered") {
    const delivered = order.fulfillmentStatus === "delivered";
    const d = parseDay(order.date);
    d.setDate(d.getDate() + (delivered ? 3 : 1));
    out.push({
      id: `EV-${order.id}-ship`, accountId: account.id, type: "shipment",
      title: delivered ? `Pedido #${order.id} entregado` : `Pedido #${order.id} despachado`,
      actor: { kind: "system", name: "Sistema" }, refType: "order", refId: order.id,
      at: `${toDayString(d)}T10:00:00`,
    });
  }
  return out;
};

const mutate = (id, fn) => {
  _accounts = _accounts.map((a) => (a.id === id ? fn({ ...a }) : a));
};

// ============ LECTURA ====================================================
export const listAccounts = () => _accounts.map(withMetrics);

export const getAccount = (id) => {
  const a = _accounts.find((x) => x.id === id);
  return a ? withMetrics(a) : null;
};

export const getAccountOrders = (id) => ordersOf(id);

export const getOrderSummary = (id) => {
  const os = ordersOf(id);
  const paid = os.filter((o) => o.paymentStatus === "paid");
  const returns = os.filter((o) => o.fulfillmentStatus === "returned").length;
  const billed = paid.reduce((s, o) => s + o.total, 0);
  return {
    billed,
    ordersCount: paid.length,
    aov: paid.length ? Math.round(billed / paid.length) : 0,
    returns,
    returnRate: os.length ? Math.round((returns / os.length) * 100) : 0,
  };
};

/**
 * `marketingActivities` lo inyecta `ClienteDetalle.jsx` con
 * `marketingApi.getAccountMarketingActivity(id)` — así el CRM no importa `marketingApi` (que a su
 * vez importa `clientsApi`), evitando el ciclo. Ver docs/MODULO-MARKETING.md §4.1.
 */
export const getActivities = (id, marketingActivities = []) => {
  const account = _accounts.find((x) => x.id === id);
  if (!account) return [];
  const fromOrders = ordersOf(id).flatMap((o) => orderToActivities(account, o));
  const fromQuotes = quotesOf(id).flatMap(quoteToActivities);
  const manual = _activities.filter((x) => x.accountId === id);
  return [...manual, ...fromOrders, ...fromQuotes, ...marketingActivities]
    .sort((a, b) => new Date(b.at) - new Date(a.at));
};

export const getSegmentAverages = (segmentKey, excludeId) => {
  const peers = listAccounts().filter(
    (a) => a.metrics.segmentKey === segmentKey && a.id !== excludeId
  );
  if (!peers.length) return null;
  const avg = (sel) => Math.round(peers.reduce((s, a) => s + sel(a), 0) / peers.length);
  return {
    count: peers.length,
    ltv: avg((a) => a.metrics.ltv),
    aov: avg((a) => a.metrics.aov),
    frequencyYear: +(peers.reduce((s, a) => s + a.metrics.frequencyYear, 0) / peers.length).toFixed(1),
  };
};

export const getPortfolioSummary = () => {
  const all = listAccounts();
  const withOrders = all.filter((a) => a.metrics.ordersCount > 0);
  const totalLtv = withOrders.reduce((s, a) => s + a.metrics.ltv, 0);
  return {
    total: all.length,
    vip: all.filter((a) => a.metrics.tier === "vip").length,
    avgLtv: withOrders.length ? Math.round(totalLtv / withOrders.length) : 0,
    atRisk: all.filter((a) => ["en_riesgo", "durmiente", "perdido"].includes(a.metrics.segmentKey)).length,
  };
};

/** Distribución de la cartera por segmento smart. */
export const getSegmentDistribution = () => {
  const all = listAccounts();
  const counts = new Map();
  all.forEach((a) => counts.set(a.metrics.segmentKey, (counts.get(a.metrics.segmentKey) || 0) + 1));
  return counts;
};

// ============ RFM CONFIG ================================================
export const getRfmConfig = () => structuredClone(_rfmConfig);

export const setRfmConfig = (config) => {
  _rfmConfig = {
    recency: config.recency.map(Number),
    frequency: config.frequency.map(Number),
    monetary: config.monetary.map(Number),
  };
  recomputeSegments();
  return getRfmConfig();
};

export const resetRfmConfig = () => {
  _rfmConfig = structuredClone(DEFAULT_RFM_CONFIG);
  recomputeSegments();
  return getRfmConfig();
};

// ============ TIER OVERRIDE ============================================
export const setTierOverride = (accountId, tierOverride /* string | null */) => {
  const before = getAccount(accountId)?.metrics.tier;
  mutate(accountId, (a) => ({ ...a, tierOverride: tierOverride || null }));
  const after = getAccount(accountId)?.metrics.tier;
  if (before !== after) {
    pushActivity({
      accountId,
      type: "segment",
      title: tierOverride
        ? `Tier fijado manualmente en «${tierOf(tierOverride).label}»`
        : "Se quitó el tier manual (vuelve al calculado)",
      actor: actorNow(),
    });
    emitEvent("Tier_Cambiado", { accountId, from: before, to: after, manual: Boolean(tierOverride) });
  }
  return getAccount(accountId);
};

// ============ ESCRITURA DE CUENTA ======================================
export const addActivity = (accountId, { type = "note", title, description = "" }) => {
  const act = {
    id: newId("ACT"),
    accountId,
    type,
    title: title?.trim() || "Nota",
    description: description?.trim() || "",
    actor: actorNow(),
    at: nowStamp(),
  };
  _activities = [act, ..._activities];
  return act;
};

export const saveAddress = (accountId, address) => {
  mutate(accountId, (a) => {
    const list = a.addresses ? [...a.addresses] : [];
    if (address.id) {
      const i = list.findIndex((x) => x.id === address.id);
      if (i >= 0) list[i] = { ...list[i], ...address };
    } else {
      const created = { ...address, id: newId("AD") };
      if (created.isDefaultShipping) list.forEach((x) => (x.isDefaultShipping = false));
      if (created.isDefaultBilling) list.forEach((x) => (x.isDefaultBilling = false));
      if (list.length === 0) {
        created.isDefaultShipping = true;
        created.isDefaultBilling = true;
      }
      list.push(created);
    }
    a.addresses = list;
    return a;
  });
  return getAccount(accountId);
};

export const setDefaultAddress = (accountId, addressId, kind) => {
  const field = kind === "billing" ? "isDefaultBilling" : "isDefaultShipping";
  mutate(accountId, (a) => {
    a.addresses = (a.addresses || []).map((x) => ({ ...x, [field]: x.id === addressId }));
    return a;
  });
  return getAccount(accountId);
};

export const deleteAddress = (accountId, addressId) => {
  mutate(accountId, (a) => {
    a.addresses = (a.addresses || []).filter((x) => x.id !== addressId);
    return a;
  });
  return getAccount(accountId);
};

export const saveTags = (accountId, tags) => {
  const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const before = _accounts.find((a) => a.id === accountId)?.tags || [];
  mutate(accountId, (a) => ({ ...a, tags: clean }));
  const added = clean.filter((t) => !before.includes(t));
  const removed = before.filter((t) => !clean.includes(t));
  if (added.length || removed.length) {
    busEmit("cliente.etiquetado", { type: "account", id: accountId },
      { accountId, name: _accounts.find((a) => a.id === accountId)?.name, added, removed });
  }
  clean.forEach((t) => { if (!_tagMeta.has(t)) _tagMeta.set(t, "neutral"); });
  return getAccount(accountId);
};

// ============ TAGS (registro global) ==================================
const tagUsage = () => {
  const counts = new Map();
  _accounts.forEach((a) => (a.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return counts;
};

export const getAllTags = () => {
  const usage = tagUsage();
  const names = new Set([..._tagMeta.keys(), ...usage.keys()]);
  return [...names]
    .map((name) => ({ name, color: _tagMeta.get(name) || "neutral", usageCount: usage.get(name) || 0 }))
    .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
};

export const getTagColor = (name) => _tagMeta.get(name) || "neutral";

export const setTagColor = (name, color) => {
  _tagMeta.set(name, color);
  return getAllTags();
};

export const renameTag = (from, to) => {
  const dest = to.trim().toLowerCase();
  if (!dest || dest === from) return getAllTags();
  _accounts = _accounts.map((a) => ({
    ...a,
    tags: (a.tags || []).map((t) => (t === from ? dest : t)).filter((v, i, arr) => arr.indexOf(v) === i),
  }));
  if (_tagMeta.has(from)) {
    _tagMeta.set(dest, _tagMeta.get(from));
    _tagMeta.delete(from);
  }
  return getAllTags();
};

export const mergeTags = (from, into) => {
  if (from === into) return getAllTags();
  _accounts = _accounts.map((a) => ({
    ...a,
    tags: [...new Set((a.tags || []).map((t) => (t === from ? into : t)))],
  }));
  _tagMeta.delete(from);
  return getAllTags();
};

export const deleteTag = (name) => {
  _accounts = _accounts.map((a) => ({ ...a, tags: (a.tags || []).filter((t) => t !== name) }));
  _tagMeta.delete(name);
  return getAllTags();
};

// ============ SEGMENTOS MANUALES ======================================
export const getManualSegments = () =>
  _manualSegments.map((s) => ({ ...s, count: s.accountIds.length }));

export const getAccountSegments = (accountId) =>
  _manualSegments.filter((s) => s.accountIds.includes(accountId));

export const toggleAccountInSegment = (segmentId, accountId) => {
  _manualSegments = _manualSegments.map((s) => {
    if (s.id !== segmentId) return s;
    const has = s.accountIds.includes(accountId);
    return { ...s, accountIds: has ? s.accountIds.filter((x) => x !== accountId) : [...s.accountIds, accountId] };
  });
  return getAccountSegments(accountId);
};

export const createManualSegment = ({ name, description = "", color = "accent" }) => {
  const seg = { id: newId("SEG"), name: name.trim(), description: description.trim(), color, accountIds: [] };
  _manualSegments = [seg, ..._manualSegments];
  return getManualSegments();
};

export const updateManualSegment = (id, patch) => {
  _manualSegments = _manualSegments.map((s) => (s.id === id ? { ...s, ...patch } : s));
  return getManualSegments();
};

export const deleteManualSegment = (id) => {
  _manualSegments = _manualSegments.filter((s) => s.id !== id);
  return getManualSegments();
};

// ============ VENTAS / COTIZACIONES ===================================
const QUOTE_STAGES = [
  { key: "draft", label: "Borrador" },
  { key: "sent", label: "Enviada" },
  { key: "accepted", label: "Aceptada" },
  { key: "converted", label: "Convertida" },
  { key: "lost", label: "Perdida" },
];

export const getAccountQuotes = (id) => quotesOf(id);

export { QUOTE_STAGES };

/**
 * ⭐ Todas las cotizaciones, de todas las cuentas.
 *
 * El módulo ya las tenía, pero sólo las exponía **por cuenta** (`quotesOf`), y
 * por eso la pantalla de Ventas terminó inventándose un `mockCotizaciones` con
 * cuatro filas escritas a mano. No es una capacidad nueva: es la misma lectura,
 * mirada desde el otro lado.
 */
export const listQuotes = ({ status, search, sellerName } = {}) => {
  const q = (search || "").toLowerCase().trim();
  const byId = new Map(_accounts.map((a) => [a.id, a]));

  return _quotes
    .map((quote) => ({
      ...quote,
      id: quote.id,
      accountName: byId.get(quote.accountId)?.name || "—",
      stageMeta: QUOTE_STAGES.find((s) => s.key === quote.status) || { key: quote.status, label: quote.status },
    }))
    .filter((r) => !status || r.status === status)
    .filter((r) => !sellerName || r.sellerName === sellerName)
    .filter((r) => !q
      || r.accountName.toLowerCase().includes(q)
      || String(r.id).toLowerCase().includes(q)
      || String(r.sellerName || "").toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** El embudo completo, para la cabecera de Ventas. */
export const getQuotesSummary = () => {
  const all = listQuotes();
  const open = all.filter((q) => ["draft", "sent", "accepted"].includes(q.status));
  const won = all.filter((q) => q.status === "converted");
  const decided = won.length + all.filter((q) => q.status === "lost").length;

  return {
    total: all.length,
    open: open.length,
    openAmount: open.reduce((s, q) => s + q.amount, 0),
    won: won.length,
    wonAmount: won.reduce((s, q) => s + q.amount, 0),
    // ⭐ Sobre las decididas, no sobre el total: contar las que todavía están
    // abiertas como "perdidas" haría bajar la tasa cada vez que entra una nueva.
    winRate: decided ? won.length / decided : null,
    decided,
    byStage: QUOTE_STAGES.map((s) => {
      const rows = all.filter((q) => q.status === s.key);
      return { ...s, count: rows.length, amount: rows.reduce((sum, q) => sum + q.amount, 0) };
    }),
  };
};

export const getQuotePipeline = (id) => {
  const qs = quotesOf(id);
  return QUOTE_STAGES.map((s) => {
    const rows = qs.filter((q) => q.status === s.key);
    return { ...s, count: rows.length, amount: rows.reduce((sum, q) => sum + q.amount, 0) };
  });
};

/** Marca la cotización como convertida y crea el pedido correspondiente. */
export const convertQuoteToOrder = (accountId, quoteId) => {
  const quote = _quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status === "converted") return getAccount(accountId);

  const order = {
    id: newId("ORD"),
    accountId,
    date: toDayString(TODAY),
    total: quote.amount,
    paymentStatus: "paid",
    fulfillmentStatus: "unfulfilled",
    items: quote.items,
  };
  _orders = [order, ..._orders];

  _quotes = _quotes.map((q) =>
    q.id === quoteId ? { ...q, status: "converted", orderId: order.id, convertedAt: nowStamp() } : q
  );

  emitEvent("Cotizacion_Convertida", { accountId, quoteId, orderId: order.id, amount: quote.amount });
  emitEvent("Pedido_Creado", { accountId, orderId: order.id, source: "quote" });
  recomputeSegments();

  return getAccount(accountId);
};

// ============ HANDOFF A MARKETING =====================================
/**
 * Prepara una audiencia y la "envía" a Marketing (stub). Registra el toque
 * de campaña en cada cuenta y emite el evento de handoff.
 */
export const sendToCampaign = ({ audienceName, accountIds }) => {
  const ids = accountIds.filter((id) => _accounts.some((a) => a.id === id));
  ids.forEach((id) => {
    pushActivity({
      accountId: id,
      type: "campaign",
      title: `Incluido en la audiencia «${audienceName}»`,
      actor: actorNow(),
    });
  });
  const ev = emitEvent("Audiencia_Enviada_A_Marketing", { audienceName, count: ids.length, accountIds: ids });
  return { audienceName, count: ids.length, handoffId: ev.at };
};

// ============ RESUMEN PARA ANALYTICS ==================================
/**
 * Agregados que el módulo Analytics consumiría (LTV por segmento, RFM,
 * cartera). Contrato de datos entre CRM y Analytics.
 */
export const getCustomerAnalytics = () => {
  const all = listAccounts();
  const bySegment = {};
  all.forEach((a) => {
    const k = a.metrics.segmentKey;
    (bySegment[k] ||= { count: 0, ltv: 0, aovSum: 0 });
    bySegment[k].count += 1;
    bySegment[k].ltv += a.metrics.ltv;
    bySegment[k].aovSum += a.metrics.aov;
  });
  Object.values(bySegment).forEach((s) => {
    s.ltvAvg = Math.round(s.ltv / s.count);
    s.aovAvg = Math.round(s.aovSum / s.count);
    delete s.aovSum;
  });

  const rfm = { r: [0, 0, 0, 0, 0], f: [0, 0, 0, 0, 0], m: [0, 0, 0, 0, 0] };
  all.forEach((a) => {
    ["r", "f", "m"].forEach((d) => {
      const s = a.metrics[d];
      if (s >= 1 && s <= 5) rfm[d][s - 1] += 1;
    });
  });

  return {
    portfolio: getPortfolioSummary(),
    bySegment,
    rfmDistribution: rfm,
    generatedAt: new Date().toISOString(),
  };
};

// ============ VISTAS GUARDADAS (localStorage) =========================
const VIEWS_KEY = "checat_crm_views";

export const getSavedViews = () => {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeViews = (views) => {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* ignora */ }
  return views;
};

export const saveView = ({ name, filters }) => {
  const views = getSavedViews().filter((v) => v.name !== name.trim());
  return writeViews([...views, { id: newId("VW"), name: name.trim(), filters }]);
};

export const deleteView = (id) => writeViews(getSavedViews().filter((v) => v.id !== id));

// util de presentación reexportado
export { segmentOf, tierOf };
