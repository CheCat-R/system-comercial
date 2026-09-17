/**
 * Capa de lectura del Catálogo.
 *
 * Es la puerta que a Productos le faltaba (ver ARCHITECTURE.md §2.1): la UI y los
 * demás módulos leen el catálogo por acá en vez de importar mocks sueltos o el
 * espejo de Inventario. Era **de sólo lectura** hasta la F3 de Seguridad, que le
 * agregó su primera escritura: **el cambio de precio** (§4.1). El resto del ABM
 * del catálogo sigue viviendo en las pantallas de Productos.
 *
 * El stock **no** es del catálogo: para los SKU que Inventario administra, se pisa
 * el valor de referencia con el disponible real (`getStockGroupedBySku`).
 *
 * Ver docs/MODULO-TIENDA-CMS.md §6.
 */
import { products as seedProducts, categories, brands, tags, reviews } from "../data/catalog.mock";
import { getStockGroupedBySku } from "../../inventario/api/inventoryApi";
import { sensitive } from "../../seguridad/lib/gate";
import { escalate, THRESHOLDS } from "../../seguridad/lib/permissions";
import { change } from "../../seguridad/lib/diff";

/**
 * ⭐ El catálogo deja de ser inmutable acá.
 *
 * Hasta F3 este archivo exportaba **cero** mutaciones, y por eso «cambio de
 * precio» —la primera superficie que se pidió controlar (§4.1)— no se podía
 * controlar: no existía la operación. Se crea ahora, y se crea **con el control
 * puesto desde el primer día**, que es la única vez que sale barato.
 */
let _products = seedProducts.map((p) => ({ ...p }));

const clone = (v) => JSON.parse(JSON.stringify(v));

const byId = (list) => new Map(list.map((x) => [x.id, x]));

/** Disponible real por SKU, para los que Inventario conoce. */
const liveStock = () => {
  const map = new Map();
  try {
    getStockGroupedBySku().forEach((g) => map.set(g.skuId, g.available));
  } catch {
    /* Inventario no disponible: se usa el stock de referencia del catálogo. */
  }
  return map;
};

const enrich = (p, ctx) => {
  const stock = ctx.stock.has(p.sku) ? ctx.stock.get(p.sku) : p.stock;
  return {
    ...p,
    stock,
    inStock: stock > 0,
    categoryName: ctx.categories.get(p.categoryId)?.name || "—",
    brandName: ctx.brands.get(p.brandId)?.name || "—",
    tags: (p.tagIds || []).map((id) => ctx.tags.get(id)).filter(Boolean),
    onSale: Boolean(p.compareAtPrice && p.compareAtPrice > p.price),
    discountPercent: p.compareAtPrice && p.compareAtPrice > p.price
      ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100)
      : 0,
  };
};

const context = () => ({
  stock: liveStock(),
  categories: byId(categories),
  brands: byId(brands),
  tags: byId(tags),
});

/* ------------------------------------------------------------------ productos */

/**
 * @param {object} f
 * @param {string[]} f.categoryIds  @param {string[]} f.brandIds  @param {string[]} f.tagIds
 * @param {string} f.search  @param {string} f.status  @param {boolean} f.onlyPublished
 */
export const listProducts = (f = {}) => {
  const ctx = context();
  const q = (f.search || "").toLowerCase().trim();
  return _products
    .map((p) => enrich(p, ctx))
    .filter((p) => {
      if (f.onlyPublished && p.status !== "Activo" && p.status !== "Agotado") return false;
      if (f.status && p.status !== f.status) return false;
      if (f.categoryIds?.length && !f.categoryIds.includes(p.categoryId)) return false;
      if (f.brandIds?.length && !f.brandIds.includes(p.brandId)) return false;
      if (f.tagIds?.length && !f.tagIds.some((t) => (p.tagIds || []).includes(t))) return false;
      if (f.minPrice != null && p.price < f.minPrice) return false;
      if (f.maxPrice != null && p.price > f.maxPrice) return false;
      if (f.inStock === true && !p.inStock) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))) return false;
      return true;
    });
};

export const getProduct = (id) => {
  const p = _products.find((x) => String(x.id) === String(id));
  return p ? enrich(p, context()) : null;
};

export const getProducts = (ids = []) => {
  const ctx = context();
  return ids
    .map((id) => _products.find((p) => String(p.id) === String(id)))
    .filter(Boolean)
    .map((p) => enrich(p, ctx));
};

/* ------------------------------------------- taxonomías y contenido derivado */

export const listCategories = () => {
  const counts = new Map();
  _products.forEach((p) => counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1));
  return clone(categories).map((c) => ({ ...c, productCount: counts.get(c.id) || 0 }));
};

export const listBrands = () => {
  const counts = new Map();
  _products.forEach((p) => counts.set(p.brandId, (counts.get(p.brandId) || 0) + 1));
  return clone(brands).map((b) => ({ ...b, productCount: counts.get(b.id) || 0 }));
};

export const listTags = () => clone(tags);

export const listReviews = ({ productId, minRating, status = "Aprobado" } = {}) =>
  clone(reviews)
    .filter((r) => {
      if (productId != null && String(r.productId) !== String(productId)) return false;
      if (minRating != null && r.rating < minRating) return false;
      if (status && r.status !== status) return false;
      return true;
    })
    .map((r) => ({ ...r, productName: _products.find((p) => p.id === r.productId)?.name || "—" }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

export const getCatalogSummary = () => {
  const all = listProducts();
  return {
    total: all.length,
    published: all.filter((p) => p.status === "Activo").length,
    outOfStock: all.filter((p) => !p.inStock).length,
    onSale: all.filter((p) => p.onSale).length,
  };
};

/* ============================================================== precios */

let _priceHistory = [];
let _priceSeq = 0;

/**
 * El margen que deja un precio, contra el costo vigente. Es lo que convierte
 * «bajé un poco el precio» en «lo estoy vendiendo abajo del costo».
 */
export const marginOf = (price, cost) => {
  if (!price) return null;
  return (price - (cost || 0)) / price;
};

/** La variación relativa contra el precio de hoy. */
export const variationOf = (before, after) => (before ? (after - before) / before : 0);

/**
 * ⭐ ¿Este cambio de precio se pasa de la raya?
 *
 * La regla de negocio es de Productos —cuánto es «mucho» lo sabe quien vende—,
 * pero **el umbral y el grado que le corresponde a cada lado los declara
 * Seguridad** (`THRESHOLDS.precio`). Si el umbral viviera acá adentro, moverlo
 * sería bajarle el control a la operación sin que nadie se entere.
 */
export const describePriceChange = (id, nextPrice) => {
  const product = _products.find((p) => String(p.id) === String(id));
  if (!product) return { ok: false, error: "Ese producto no existe." };

  const price = Number(nextPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "El precio tiene que ser un número mayor a cero." };
  }
  if (price === product.price) {
    return { ok: false, error: "Ese ya es el precio vigente." };
  }

  const variation = variationOf(product.price, price);
  const margin = marginOf(price, product.cost);
  const overThreshold = Math.abs(variation) > THRESHOLDS.precio.pct;
  const negativeMargin = margin != null && margin < 0;
  const exceeded = overThreshold || negativeMargin;

  return {
    ok: true,
    product,
    price,
    variation,
    margin,
    marginBefore: marginOf(product.price, product.cost),
    overThreshold,
    negativeMargin,
    exceeded,
    permission: escalate("precio", exceeded),
    why: negativeMargin
      ? "Deja el margen en negativo: se vendería abajo del costo."
      : (overThreshold ? `La variación supera el ${Math.round(THRESHOLDS.precio.pct * 100)} %.` : null),
  };
};

/**
 * ⭐ Cambiar el precio de lista.
 *
 * No es «guardar el formulario del producto»: es **una operación con nombre**,
 * con su motivo y su grado. Por eso no vive dentro de un `updateProduct` que
 * pisa quince campos a la vez — un cambio de precio escondido entre otros
 * catorce campos es exactamente lo que no se puede auditar.
 *
 * Ojo (§4.1): un descuento de Marketing **no es** esto. Ahí el precio de lista
 * no se toca y se audita por otro camino.
 */
export const setPrice = (id, { price, reason } = {}) => {
  const plan = describePriceChange(id, price);
  if (!plan.ok) throw new Error(plan.error);

  const { product, permission } = plan;
  const pct = `${plan.variation > 0 ? "+" : ""}${(plan.variation * 100).toFixed(1)} %`;

  return sensitive({
    action: permission,
    subject: { type: "sku", id: product.sku, label: product.name },
    reason,
    preview: `${product.name}: $${product.price.toLocaleString("es-AR")} → $${plan.price.toLocaleString("es-AR")} (${pct})`,
    meta: {
      producto: product.name,
      variacion: pct,
      margen: plan.margin == null ? "—" : `${(plan.margin * 100).toFixed(1)} %`,
      motivoDelGrado: plan.why || "dentro del umbral",
    },
    // ⭐ Entre que se pide y se firma, alguien más pudo tocar el precio. La cola
    // no reproduce una decisión vieja: si el punto de partida cambió, la
    // propuesta queda obsoleta con el motivo.
    revalidate: () => {
      const now = _products.find((p) => String(p.id) === String(id));
      if (!now) return "El producto ya no existe.";
      if (now.price !== product.price) {
        return `El precio ya no es $${product.price.toLocaleString("es-AR")} sino $${now.price.toLocaleString("es-AR")}: hay que volver a pedirlo.`;
      }
      return null;
    },
    run: () => {
      const before = { price: product.price, margin: plan.marginBefore };
      _products = _products.map((p) => (String(p.id) === String(id) ? { ...p, price: plan.price } : p));
      _priceHistory = [{
        id: `PRC-${String(++_priceSeq).padStart(4, "0")}`,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        before: before.price,
        after: plan.price,
        variation: plan.variation,
        margin: plan.margin,
        reason: String(reason || "").trim(),
        at: new Date().toISOString(),
      }, ..._priceHistory];

      return {
        value: getProduct(id),
        changes: [
          change("Precio de lista", before.price, plan.price, "money"),
          change("Margen", before.margin, plan.margin, "percent"),
        ],
      };
    },
  });
};

/** El historial de precios, que ahora existe porque la operación existe. */
export const listPriceHistory = ({ productId, limit = 50 } = {}) =>
  _priceHistory
    .filter((h) => !productId || String(h.productId) === String(productId))
    .slice(0, limit);

/** La vista de precios y márgenes: lo que hay que mirar antes de tocar uno. */
export const listPricing = (filters = {}) =>
  listProducts(filters).map((p) => ({
    ...p,
    margin: marginOf(p.price, p.cost),
    lastChange: _priceHistory.find((h) => String(h.productId) === String(p.id)) || null,
  }));
