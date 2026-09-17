/**
 * Única puerta de la Tienda / CMS.
 *
 * La UI habla sólo con este archivo — nunca con los mocks. El estado vive en
 * memoria y se resetea al recargar la página, igual que en el resto del panel.
 *
 * Imports cruzados, unidireccionales (nadie vuelve hacia acá):
 *   tiendaApi → catalogApi (Productos) · marketingApi
 *
 * Ver docs/MODULO-TIENDA-CMS.md §6 y §7.
 */
import { pages as seedPages, pageVersions as seedVersions } from "../data/pages.mock";
import { posts as seedPosts, authors as seedAuthors, postCategories as seedPostCategories } from "../data/posts.mock";
import { collections as seedCollections } from "../data/collections.mock";
import { banners as seedBanners } from "../data/banners.mock";
import { mediaAssets as seedMedia } from "../data/media.mock";
import { menus as seedMenus } from "../data/menus.mock";
import { savedSections as seedSavedSections } from "../data/savedSections.mock";
import { theme as seedTheme } from "../data/theme.mock";

import {
  listProducts, getProduct, getProducts, listCategories, listBrands, listReviews,
} from "../../productos/api/catalogApi";
import { listPromotions, getPromotion, listAudiences, setSubscription, getSubscription } from "../../marketing/api/marketingApi";
import { listAccounts } from "../../clientes/api/clientsApi";
import { listBranches } from "../../inventario/api/inventoryApi";

import { clone, createSection, createBlock, validateTree } from "../lib/blocks";
import { evaluateVisibility, defaultViewAs } from "../lib/visibility";
import { nowStamp, TODAY } from "../lib/time";
import { emit } from "../../automatizaciones/lib/bus";
import { currentActor } from "../../seguridad/lib/audit";

/* ---------------------------------------------------------------- estado */

// Las notas del blog **son páginas**: mismo editor, mismas versiones, mismo
// motor de publicación. Sólo cambian el `type` y el objeto `post`.
let _pages = clone([...seedPages, ...seedPosts]);
let _collections = clone(seedCollections);
let _banners = clone(seedBanners);
let _media = clone(seedMedia);
let _versions = clone(seedVersions);
let _authors = clone(seedAuthors);
let _postCategories = clone(seedPostCategories);
let _menus = clone(seedMenus);
let _savedSections = clone(seedSavedSections);
let _theme = clone(seedTheme);

const _seq = {
  page: _pages.length,
  collection: _collections.length,
  banner: _banners.length,
  media: _media.length,
  version: _versions.length,
  author: _authors.length,
  postCategory: _postCategories.length,
  savedSection: _savedSections.length,
  menuItem: 100,
};

const emptyTree = () => ({ sections: [] });

/* ------------------------------------------------------------- catálogo */

export const getCatalogFacets = () => ({
  categories: listCategories(),
  brands: listBrands(),
});

/* ----------------------------------------------------------- colecciones */

const SORTERS = {
  manual: null,
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  bestsellers: (a, b) => b.soldUnits - a.soldUnits,
  discount: (a, b) => b.discountPercent - a.discountPercent,
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating,
};

export const COLLECTION_SORTS = [
  { value: "manual", label: "Orden manual" },
  { value: "bestsellers", label: "Más vendidos" },
  { value: "newest", label: "Más nuevos" },
  { value: "discount", label: "Mayor descuento" },
  { value: "price-asc", label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
  { value: "rating", label: "Mejor valorados" },
];

/** Categorías alcanzadas por alguna promoción activa (para la regla "en oferta"). */
const promotedCategoryNames = () => {
  const names = new Set();
  try {
    listPromotions({ status: "activa" }).forEach((p) => {
      (p.discount?.scope?.categories || []).forEach((c) => names.add(c));
    });
  } catch {
    /* Marketing no disponible: la regla cae al precio tachado. */
  }
  return names;
};

/**
 * Resuelve una colección a productos. Es lo que consumen todos los bloques
 * `product-*`. Manual = orden explícito; reglas = filtro sobre el catálogo.
 */
export const resolveCollection = (collectionId, { limit, hideOutOfStock } = {}) => {
  const col = _collections.find((c) => c.id === collectionId);
  if (!col) return { collection: null, products: [], hiddenByStock: 0 };

  let items;
  if (col.mode === "manual") {
    items = getProducts(col.productIds);
  } else {
    const r = col.rules || {};
    items = listProducts({
      onlyPublished: true,
      categoryIds: r.categoryIds,
      brandIds: r.brandIds,
      tagIds: r.tagIds,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
    });
    if (r.newerThanDays) {
      const cut = new Date(TODAY);
      cut.setDate(cut.getDate() - r.newerThanDays);
      items = items.filter((p) => new Date(`${p.createdAt}T12:00:00`) >= cut);
    }
    if (r.onSale) {
      const promoted = promotedCategoryNames();
      items = items.filter((p) => p.onSale || promoted.has(p.categoryName));
    }
    if (r.inStock) items = items.filter((p) => p.inStock);
  }

  const before = items.length;
  if (hideOutOfStock) items = items.filter((p) => p.inStock);
  const hiddenByStock = before - items.length;

  const sorter = SORTERS[col.sort];
  if (sorter) items = [...items].sort(sorter);

  const cap = Math.min(limit || col.limit || 24, col.limit || 24);
  return { collection: col, products: items.slice(0, cap), hiddenByStock, totalMatched: items.length };
};

const enrichCollection = (c) => {
  const { products, totalMatched } = resolveCollection(c.id);
  return {
    ...c,
    productCount: totalMatched ?? products.length,
    previewProducts: products.slice(0, 4),
    usedInPages: _pages.filter((p) => treeUsesRef(activeTree(p), "collection", c.id)).map((p) => ({ id: p.id, title: p.title })),
  };
};

export const listCollections = ({ status, mode } = {}) =>
  _collections
    .filter((c) => !status || c.status === status)
    .filter((c) => !mode || c.mode === mode)
    .map(enrichCollection)
    .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name));

export const getCollection = (id) => {
  const c = _collections.find((x) => x.id === id);
  return c ? enrichCollection(c) : null;
};

export const createCollection = (data = {}) => {
  const col = {
    id: `CO-${String(++_seq.collection).padStart(2, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    name: data.name?.trim() || "Colección sin nombre",
    slug: slugify(data.slug || data.name || "coleccion"),
    system: false,
    description: data.description || "",
    mode: data.mode || "manual",
    productIds: data.productIds || [],
    rules: data.rules || { categoryIds: [], brandIds: [], tagIds: [], inStock: false },
    sort: data.sort || "manual",
    limit: Number(data.limit) || 12,
    heroBannerId: data.heroBannerId || null,
    status: data.status || "borrador",
    createdAt: nowStamp(),
  };
  _collections = [..._collections, col];
  return enrichCollection(col);
};

export const updateCollection = (id, data) => {
  _collections = _collections.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...data };
    if (data.slug !== undefined) next.slug = slugify(data.slug);
    if (data.limit !== undefined) next.limit = Number(data.limit) || 12;
    return next;
  });
  return getCollection(id);
};

/** Regla §10.10: no se borra si una página publicada la usa, ni si es de sistema. */
export const deleteCollection = (id) => {
  const col = _collections.find((c) => c.id === id);
  if (!col) return { ok: false, error: "La colección no existe." };
  if (col.system) return { ok: false, error: "Las colecciones de sistema no se pueden eliminar." };
  const used = _pages.filter((p) => p.published && treeUsesRef(p.published, "collection", id));
  if (used.length) {
    return { ok: false, error: `La usan ${used.length} página(s) publicada(s): ${used.map((p) => p.title).join(", ")}.` };
  }
  _collections = _collections.filter((c) => c.id !== id);
  return { ok: true };
};

/* --------------------------------------------------------------- banners */

/** El estado se deriva de la vigencia; `status: "borrador"` lo pisa. */
export const bannerState = (b, at = TODAY) => {
  if (b.status === "borrador") return "borrador";
  const t = new Date(at).getTime();
  if (b.startsAt && t < new Date(b.startsAt).getTime()) return "programado";
  if (b.endsAt && t > new Date(b.endsAt).getTime()) return "vencido";
  return "activo";
};

const enrichBanner = (b) => {
  const audience = b.audienceId ? safeAudiences().find((a) => a.id === b.audienceId) : null;
  return {
    ...b,
    state: bannerState(b),
    media: _media.find((m) => m.id === b.mediaId) || null,
    mediaMobile: _media.find((m) => m.id === b.mediaMobileId) || null,
    audienceName: audience?.name || null,
    ctr: b.stats?.impressions ? b.stats.clicks / b.stats.impressions : 0,
    usedInPages: _pages.filter((p) => treeUsesRef(activeTree(p), "banner", b.id)).map((p) => ({ id: p.id, title: p.title })),
  };
};

export const listBanners = ({ state } = {}) =>
  _banners
    .map(enrichBanner)
    .filter((b) => !state || b.state === state)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const getBanner = (id) => {
  const b = _banners.find((x) => x.id === id);
  return b ? enrichBanner(b) : null;
};

export const createBanner = (data = {}) => {
  const banner = {
    id: `BN-${String(++_seq.banner).padStart(2, "0")}`,
    name: data.name?.trim() || "Banner sin nombre",
    mediaId: data.mediaId || null,
    mediaMobileId: data.mediaMobileId || null,
    headline: data.headline || "",
    subheadline: data.subheadline || "",
    cta: data.cta || { label: "", href: "" },
    position: data.position || "center",
    theme: data.theme || "light",
    startsAt: data.startsAt || null,
    endsAt: data.endsAt || null,
    audienceId: data.audienceId || null,
    promotionId: data.promotionId || null,
    weight: Number(data.weight) || 1,
    status: data.status || "borrador",
    stats: { impressions: 0, clicks: 0 },
    createdAt: nowStamp(),
  };
  _banners = [banner, ..._banners];
  return enrichBanner(banner);
};

export const updateBanner = (id, data) => {
  _banners = _banners.map((b) => (b.id === id ? { ...b, ...data } : b));
  return getBanner(id);
};

export const deleteBanner = (id) => {
  const used = _pages.filter((p) => p.published && treeUsesRef(p.published, "banner", id));
  if (used.length) {
    return { ok: false, error: `Lo usan ${used.length} página(s) publicada(s): ${used.map((p) => p.title).join(", ")}.` };
  }
  _banners = _banners.filter((b) => b.id !== id);
  return { ok: true };
};

/* ----------------------------------------------------------------- medios */

export const listMedia = ({ folder, search } = {}) => {
  const q = (search || "").toLowerCase().trim();
  return _media
    .filter((m) => !folder || m.folder === folder)
    .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.tags || []).some((t) => t.includes(q)))
    .map((m) => ({ ...m, usedIn: mediaUsage(m.id) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const getMedia = (id) => _media.find((m) => m.id === id) || null;

export const listMediaFolders = () => Array.from(new Set(_media.map((m) => m.folder))).sort();

export const createMedia = (data = {}) => {
  const asset = {
    id: `MD-${++_seq.media}`,
    name: data.name?.trim() || "Imagen sin nombre",
    kind: "image",
    url: data.url || null,
    color: data.color || "#4f46e5",
    label: data.label || data.name || "Imagen",
    alt: data.alt || "",
    width: Number(data.width) || 1600,
    height: Number(data.height) || 900,
    sizeKb: Number(data.sizeKb) || 200,
    folder: data.folder || "Sin carpeta",
    tags: data.tags || [],
    createdAt: nowStamp(),
  };
  _media = [asset, ..._media];
  return asset;
};

function mediaUsage(mediaId) {
  const out = [];
  _banners.forEach((b) => {
    if (b.mediaId === mediaId || b.mediaMobileId === mediaId) out.push({ kind: "banner", id: b.id, label: b.name });
  });
  _pages.forEach((p) => {
    if (p.seo?.ogMediaId === mediaId || p.post?.coverMediaId === mediaId || treeUsesRef(activeTree(p), "media", mediaId)) {
      out.push({ kind: "page", id: p.id, label: p.title });
    }
  });
  return out;
}

/* ---------------------------------------------------------------- páginas */

export const PAGE_TYPES = [
  { value: "home", label: "Home" },
  { value: "landing", label: "Landing" },
  { value: "institucional", label: "Institucional" },
  { value: "post", label: "Nota" },
  { value: "sistema", label: "Sistema" },
];

/** Quita tildes y diacríticos sin depender de un rango de caracteres literal. */
const stripAccents = (s) =>
  String(s).normalize("NFD").split("")
    .filter((ch) => { const c = ch.charCodeAt(0); return c < 0x0300 || c > 0x036f; })
    .join("");

const slugify = (s) =>
  stripAccents(String(s || "")).toLowerCase().trim()
    .replace(/[^a-z0-9\s/-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "pagina";

/** El árbol que se muestra por defecto: el borrador si existe, si no el publicado. */
const activeTree = (page) => page.draft || page.published || emptyTree();

/** ¿El árbol referencia esta entidad? Recorre todos los tipos de bloque. */
function treeUsesRef(tree, kind, id) {
  if (!tree?.sections) return false;
  return tree.sections.some((s) =>
    s.blocks.some((b) => {
      const p = b.props || {};
      if (kind === "collection") {
        if (p.collectionId === id) return true;
        return (p.items || []).some((it) => it.collectionId === id);
      }
      if (kind === "banner") {
        if (p.bannerId === id) return true;
        return (p.bannerIds || []).includes(id);
      }
      if (kind === "media") {
        if (p.mediaId === id || p.mediaMobileId === id || p.posterMediaId === id) return true;
        if ((p.mediaIds || []).includes(id)) return true;
        return (p.items || []).some((it) => it.mediaId === id);
      }
      return false;
    })
  );
}

/** Estado mostrado en la UI, derivado del par draft/published. */
export const pageState = (page) => {
  if (page.status === "archivada") return "archivada";
  if (!page.published) return page.publishAt ? "programada" : "borrador";
  const dirty = JSON.stringify(page.draft) !== JSON.stringify(page.published);
  if (dirty) return "cambios_pendientes";
  return "publicada";
};

export const PAGE_STATE_META = {
  borrador: { label: "Borrador", tone: "neutral" },
  publicada: { label: "Publicada", tone: "success" },
  cambios_pendientes: { label: "Cambios sin publicar", tone: "warning" },
  programada: { label: "Programada", tone: "info" },
  archivada: { label: "Archivada", tone: "neutral" },
};

/** Datos de una nota ya resueltos (autor, categorías, portada). */
const enrichPost = (p) => {
  if (p.type !== "post" || !p.post) return null;
  const author = _authors.find((a) => a.id === p.post.authorId) || null;
  return {
    ...p.post,
    title: p.title,
    slug: p.slug,
    author,
    authorName: author?.name || "Sin autor",
    authorColor: author?.avatarColor || "var(--text-tertiary)",
    cover: _media.find((m) => m.id === p.post.coverMediaId) || null,
    categoryNames: (p.post.categoryIds || [])
      .map((id) => _postCategories.find((c) => c.id === id)?.name)
      .filter(Boolean),
  };
};

const enrichPage = (p) => ({
  ...p,
  state: pageState(p),
  sectionCount: activeTree(p).sections.length,
  blockCount: activeTree(p).sections.reduce((n, s) => n + s.blocks.length, 0),
  issues: validateTree(activeTree(p).sections, { checkBlock }),
  versionCount: _versions.filter((v) => v.pageId === p.id).length,
  postData: enrichPost(p),
});

export const listPages = ({ type, state, search } = {}) => {
  ensureScheduledPublish();
  const q = (search || "").toLowerCase().trim();
  return _pages
    .map(enrichPage)
    .filter((p) => !type || p.type === type)
    .filter((p) => !state || p.state === state)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    .sort((a, b) => {
      const rank = { home: 0, landing: 1, institucional: 2, post: 3, sistema: 4 };
      return (rank[a.type] ?? 9) - (rank[b.type] ?? 9) || new Date(b.updatedAt) - new Date(a.updatedAt);
    });
};

export const getPage = (id) => {
  ensureScheduledPublish();
  const p = _pages.find((x) => x.id === id);
  return p ? enrichPage(p) : null;
};

export const createPage = (data = {}) => {
  const type = data.type || "landing";
  const page = {
    id: `PG-${String(++_seq.page).padStart(2, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    type,
    slug: type === "home" ? "/" : slugify(data.slug || data.title),
    title: data.title?.trim() || "Página sin título",
    status: "borrador",
    publishAt: null,
    seo: { title: data.title || "", description: "", ogMediaId: null, noindex: type === "sistema" },
    // Una nota arranca con su encabezado y un párrafo: el 90 % de las veces es
    // todo lo que necesita, y siempre se le puede agregar un bloque después.
    post: type === "post"
      ? {
        excerpt: "", authorId: _authors[0]?.id || null, categoryIds: [],
        coverMediaId: null, publishedAt: null, readingMinutes: 2,
      }
      : undefined,
    draft: { sections: type === "post" ? startingSections("post") : startingSections(data.template) },
    published: null,
    campaignId: null,
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
    updatedBy: currentActor()?.name || "Sistema",
    publishedAt: null,
    publishedBy: null,
  };
  _pages = [..._pages, page];
  return enrichPage(page);
};

/** Plantillas de inicio del modal "Nueva página". */
export const PAGE_TEMPLATES = [
  { value: "blank", label: "En blanco", hint: "Una sección vacía" },
  { value: "campaign", label: "Landing de campaña", hint: "Portada + ofertas + cierre" },
  { value: "institutional", label: "Página institucional", hint: "Texto angosto y legible" },
  { value: "collection", label: "Landing de colección", hint: "Portada + grilla de productos" },
];

function startingSections(template) {
  if (template === "post") {
    return [
      createSection({ name: "Encabezado", layout: { width: "narrow" }, blocks: [createBlock("post-content")] }),
      createSection({ name: "Cuerpo", layout: { width: "narrow", spacing: "md" }, blocks: [createBlock("rich-text")] }),
    ];
  }
  if (template === "campaign") {
    return [
      createSection({ name: "Portada", layout: { width: "full", spacing: "none" }, blocks: [createBlock("hero")] }),
      createSection({ name: "Ofertas", blocks: [createBlock("product-grid", { props: { collectionId: "CO-OFERTAS", heading: "Todas las ofertas" } })] }),
      createSection({ name: "Cierre", layout: { background: "sunken" }, blocks: [createBlock("cta")] }),
    ];
  }
  if (template === "institutional") {
    return [createSection({ name: "Contenido", layout: { width: "narrow" }, blocks: [createBlock("rich-text")] })];
  }
  if (template === "collection") {
    return [
      createSection({ name: "Portada", layout: { width: "full", spacing: "none" }, blocks: [createBlock("hero")] }),
      createSection({ name: "Productos", blocks: [createBlock("product-grid")] }),
    ];
  }
  return [createSection({ name: "Sección 1" })];
}

export const updatePage = (id, data) => {
  _pages = _pages.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p, ...data, updatedAt: nowStamp(), updatedBy: "Vos" };
    if (data.slug !== undefined && p.type !== "home") next.slug = slugify(data.slug);
    if (data.seo) next.seo = { ...p.seo, ...data.seo };
    if (data.post) next.post = { ...p.post, ...data.post };
    return next;
  });
  return getPage(id);
};

/** Guarda el árbol en el borrador. Nunca toca `published` (regla §10.7). */
export const savePageDraft = (id, sections) => {
  _pages = _pages.map((p) =>
    p.id === id ? { ...p, draft: { sections: clone(sections) }, updatedAt: nowStamp(), updatedBy: "Vos" } : p
  );
  return getPage(id);
};

export const publishPage = (id, { label, note } = {}) => {
  const page = _pages.find((p) => p.id === id);
  if (!page) return { ok: false, error: "La página no existe." };

  const issues = validateTree(page.draft?.sections || [], { checkBlock }).filter((i) => i.level === "error");
  if (issues.length) {
    return { ok: false, error: `No se puede publicar: ${issues[0].message}`, issues };
  }

  const at = nowStamp();
  _versions = [
    {
      id: `PV-${++_seq.version}`, pageId: id,
      label: label || `Publicación del ${at.slice(8, 10)}/${at.slice(5, 7)}`,
      note: note || "", publishedAt: at, publishedBy: currentActor()?.name || "Sistema",
      tree: clone(page.draft),
    },
    ..._versions,
  ];

  _pages = _pages.map((p) =>
    p.id === id
      ? { ...p, published: clone(p.draft), status: "publicada", publishAt: null, publishedAt: at, publishedBy: currentActor()?.name || "Sistema", updatedAt: at }
      : p
  );
  const published = getPage(id);
  emit("pagina.publicada", { type: "page", id }, {
    pageId: id, title: published.title, type: published.type, slug: published.slug,
  });
  return { ok: true, page: published };
};

export const schedulePage = (id, publishAt) => {
  _pages = _pages.map((p) => (p.id === id ? { ...p, publishAt, status: "programada", updatedAt: nowStamp() } : p));
  return getPage(id);
};

export const discardDraft = (id) => {
  _pages = _pages.map((p) =>
    p.id === id && p.published ? { ...p, draft: clone(p.published), updatedAt: nowStamp(), updatedBy: "Vos" } : p
  );
  return getPage(id);
};

export const archivePage = (id) => {
  const page = _pages.find((p) => p.id === id);
  if (!page) return { ok: false, error: "La página no existe." };
  if (page.type === "home" || page.type === "sistema") {
    return { ok: false, error: "Las páginas de sistema y la home no se pueden archivar." };
  }
  _pages = _pages.map((p) => (p.id === id ? { ...p, status: "archivada", updatedAt: nowStamp() } : p));
  return { ok: true };
};

export const deletePage = (id) => {
  const page = _pages.find((p) => p.id === id);
  if (!page) return { ok: false, error: "La página no existe." };
  if (page.type === "home" || page.type === "sistema") {
    return { ok: false, error: "Las páginas de sistema y la home no se pueden eliminar." };
  }
  _pages = _pages.filter((p) => p.id !== id);
  _versions = _versions.filter((v) => v.pageId !== id);
  return { ok: true };
};

export const duplicatePage = (id) => {
  const page = _pages.find((p) => p.id === id);
  if (!page) return null;
  const copy = clone(page);
  copy.id = `PG-${String(++_seq.page).padStart(2, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  copy.type = page.type === "home" ? "landing" : page.type;
  copy.title = `${page.title} (copia)`;
  copy.slug = slugify(`${page.slug}-copia`);
  copy.status = "borrador";
  copy.published = null;
  copy.publishedAt = null;
  copy.publishAt = null;
  copy.createdAt = nowStamp();
  copy.updatedAt = nowStamp();
  _pages = [..._pages, copy];
  return enrichPage(copy);
};

/* ------------------------------------------------------------- versiones */

export const listPageVersions = (pageId) =>
  _versions.filter((v) => v.pageId === pageId).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

/** Restaurar copia la versión al **borrador**; no publica sola (regla §8.2). */
export const restoreVersion = (versionId) => {
  const version = _versions.find((v) => v.id === versionId);
  if (!version) return { ok: false, error: "La versión no existe." };
  if (!version.tree) return { ok: false, error: "Esta versión es anterior al historial con contenido." };
  _pages = _pages.map((p) =>
    p.id === version.pageId ? { ...p, draft: clone(version.tree), updatedAt: nowStamp(), updatedBy: "Vos" } : p
  );
  return { ok: true, page: getPage(version.pageId) };
};

/**
 * Materialización perezosa de la publicación programada (regla §10.8), igual que
 * `ensureShipment` en Logística: se resuelve en la primera lectura posterior.
 */
export function ensureScheduledPublish() {
  const now = Date.now();
  _pages.forEach((p) => {
    if (p.status === "programada" && p.publishAt && new Date(p.publishAt).getTime() <= now) {
      p.published = clone(p.draft);
      p.status = "publicada";
      p.publishedAt = p.publishAt;
      p.publishedBy = p.updatedBy || "Sistema";
      p.publishAt = null;
    }
  });
}

/* ------------------------------------------------------------------- blog */

/** Notas del blog. Son páginas: reusan `listPages` y suman los datos del post. */
export const listPosts = ({ categoryId, authorId, state, search } = {}) =>
  listPages({ type: "post", search })
    .filter((p) => !state || p.state === state)
    .filter((p) => !categoryId || (p.post?.categoryIds || []).includes(categoryId))
    .filter((p) => !authorId || p.post?.authorId === authorId)
    .sort((a, b) => new Date(b.post?.publishedAt || b.updatedAt) - new Date(a.post?.publishedAt || a.updatedAt));

/** Las que un bloque `post-list` puede mostrar: publicadas y con fecha. */
const publishedPosts = ({ categoryIds, limit } = {}) =>
  _pages
    .filter((p) => p.type === "post" && p.published && p.post?.publishedAt)
    .filter((p) => !categoryIds?.length || (p.post.categoryIds || []).some((c) => categoryIds.includes(c)))
    .map((p) => ({ id: p.id, ...enrichPost(p) }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, limit || 3);

export const listAuthors = () =>
  _authors.map((a) => ({
    ...a,
    postCount: _pages.filter((p) => p.type === "post" && p.post?.authorId === a.id).length,
  }));

export const createAuthor = (data = {}) => {
  const author = {
    id: `AU-${++_seq.author}`,
    name: data.name?.trim() || "Autor sin nombre",
    role: data.role || "Redacción",
    bio: data.bio || "",
    avatarColor: data.avatarColor || "#4f46e5",
  };
  _authors = [..._authors, author];
  return author;
};

export const updateAuthor = (id, data) => {
  _authors = _authors.map((a) => (a.id === id ? { ...a, ...data } : a));
  return _authors.find((a) => a.id === id) || null;
};

export const deleteAuthor = (id) => {
  const used = _pages.filter((p) => p.type === "post" && p.post?.authorId === id);
  if (used.length) return { ok: false, error: `Firma ${used.length} nota(s). Reasignalas antes de borrarlo.` };
  _authors = _authors.filter((a) => a.id !== id);
  return { ok: true };
};

export const listPostCategories = () =>
  _postCategories.map((c) => ({
    ...c,
    postCount: _pages.filter((p) => p.type === "post" && (p.post?.categoryIds || []).includes(c.id)).length,
  }));

export const createPostCategory = (data = {}) => {
  const cat = {
    id: `PC-${++_seq.postCategory}`,
    name: data.name?.trim() || "Categoría sin nombre",
    slug: slugify(data.slug || data.name),
    description: data.description || "",
  };
  _postCategories = [..._postCategories, cat];
  return cat;
};

export const updatePostCategory = (id, data) => {
  _postCategories = _postCategories.map((c) =>
    c.id === id ? { ...c, ...data, slug: data.slug !== undefined ? slugify(data.slug) : c.slug } : c
  );
  return _postCategories.find((c) => c.id === id) || null;
};

export const deletePostCategory = (id) => {
  const used = _pages.filter((p) => p.type === "post" && (p.post?.categoryIds || []).includes(id));
  if (used.length) return { ok: false, error: `La usan ${used.length} nota(s).` };
  _postCategories = _postCategories.filter((c) => c.id !== id);
  return { ok: true };
};

/* ------------------------------------------------------------------ menús */

export const MENU_LINK_TYPES = [
  { value: "page", label: "Página" },
  { value: "collection", label: "Colección" },
  { value: "url", label: "URL" },
  { value: "none", label: "Sin enlace (sólo título)" },
];

/** Etiqueta del destino de un ítem, para mostrarlo en el árbol. */
export const describeMenuTarget = (item) => {
  if (item.linkType === "page") return _pages.find((p) => p.id === item.ref)?.slug || "⚠ página borrada";
  if (item.linkType === "collection") {
    const col = _collections.find((c) => c.id === item.ref);
    return col ? `/coleccion/${col.slug}` : "⚠ colección borrada";
  }
  if (item.linkType === "url") return item.ref || "⚠ sin URL";
  return "—";
};

const countMenuItems = (items = []) =>
  items.reduce((n, it) => n + 1 + countMenuItems(it.children), 0);

export const listMenus = () =>
  _menus.map((m) => ({ ...m, itemCount: countMenuItems(m.items) }));

export const getMenu = (id) => {
  const m = _menus.find((x) => x.id === id);
  return m ? { ...clone(m), itemCount: countMenuItems(m.items) } : null;
};

export const saveMenuItems = (id, items) => {
  _menus = _menus.map((m) => (m.id === id ? { ...m, items: clone(items) } : m));
  return getMenu(id);
};

export const newMenuItem = (label = "Nuevo ítem") => ({
  id: `MI-${++_seq.menuItem}`, label, linkType: "url", ref: "", badge: null, children: [],
});

/* ------------------------------------------------- secciones guardadas */

export const listSavedSections = () => clone(_savedSections);

/** Congela una sección del árbol como plantilla reutilizable. */
export const saveSectionAsTemplate = (section, { name, description } = {}) => {
  const template = {
    id: `SS-${++_seq.savedSection}`,
    name: name?.trim() || section.name || "Sección guardada",
    description: description || "",
    createdAt: nowStamp(),
    // Sin `id`: al insertarla se generan ids nuevos, así cada página es dueña
    // de su copia y editar una no toca las demás.
    section: {
      name: section.name,
      layout: clone(section.layout),
      visibility: clone(section.visibility),
      blocks: section.blocks.map((b) => ({ type: b.type, props: clone(b.props), visibility: clone(b.visibility), column: b.column || 0 })),
    },
  };
  _savedSections = [..._savedSections, template];
  return template;
};

export const deleteSavedSection = (id) => {
  _savedSections = _savedSections.filter((s) => s.id !== id);
  return { ok: true };
};

/** Instancia una plantilla con ids nuevos, lista para insertar en el árbol. */
export const instantiateSavedSection = (id) => {
  const template = _savedSections.find((s) => s.id === id);
  if (!template) return null;
  const section = createSection({
    name: template.section.name,
    layout: template.section.layout,
    blocks: template.section.blocks.map((b) => createBlock(b.type, { props: b.props })),
  });
  section.visibility = clone(template.section.visibility);
  return section;
};

/* ---------------------------------------------------- alta y baja de medios */

export const deleteMedia = (id) => {
  const usage = mediaUsage(id);
  if (usage.length) {
    return { ok: false, error: `Está en uso en: ${usage.map((u) => u.label).join(", ")}.` };
  }
  _media = _media.filter((m) => m.id !== id);
  return { ok: true };
};

export const updateMedia = (id, data) => {
  _media = _media.map((m) => (m.id === id ? { ...m, ...data } : m));
  return _media.find((m) => m.id === id) || null;
};

/* ------------------------------------------------- suscripción (→ Marketing) */

/**
 * Alta desde el bloque `newsletter`. Resuelve la cuenta por email en el CRM y
 * marca la `ChannelSubscription` en Marketing. Es el **único** punto donde la
 * Tienda escribe hacia otro módulo (§7).
 */
export const subscribeFromStore = (value, { channel = "email" } = {}) => {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return { ok: false, message: "Escribí un dato de contacto." };
  if (channel === "email" && !input.includes("@")) {
    return { ok: false, message: "Ese email no parece válido." };
  }

  let account = null;
  try {
    account = listAccounts().find((a) => (a.email || "").toLowerCase() === input) || null;
  } catch {
    return { ok: false, message: "El CRM no está disponible." };
  }

  if (!account) {
    // En un storefront real esto crearía un lead. Acá se dice claro qué pasó.
    return { ok: false, message: "No hay ninguna cuenta del CRM con ese contacto." };
  }

  const current = getSubscription(account.id, channel);
  if (current?.status === "suscripto") {
    return { ok: true, message: `${account.name} ya tenía el alta en ${channel}.` };
  }

  setSubscription(account.id, channel, "suscripto");
  emit("newsletter.suscripcion", { type: "account", id: account.id }, {
    email: input, channel, accountId: account.id, name: account.name,
  });
  return { ok: true, message: `Listo: se dio de alta a ${account.name} en ${channel}.` };
};

/* ------------------------------------------------------------- apariencia */

export const getTheme = () => clone(_theme);

export const updateTheme = (patch) => {
  _theme = {
    ..._theme, ...patch,
    palette: { ..._theme.palette, ...(patch.palette || {}) },
    typography: { ..._theme.typography, ...(patch.typography || {}) },
    shape: { ..._theme.shape, ...(patch.shape || {}) },
    header: { ..._theme.header, ...(patch.header || {}) },
    footer: { ..._theme.footer, ...(patch.footer || {}) },
    announcement: { ..._theme.announcement, ...(patch.announcement || {}) },
  };
  return getTheme();
};

export const resetTheme = () => {
  _theme = clone(seedTheme);
  return getTheme();
};

/**
 * Todo lo que rodea al contenido, resuelto: el anuncio (si está vigente en esta
 * fecha), el header con su menú y el footer con los suyos.
 */
export const getStoreChrome = ({ at, theme } = {}) => {
  const t = theme || _theme;
  const a = t.announcement || {};
  const when = at ? new Date(at).getTime() : TODAY.getTime();
  const live =
    a.enabled &&
    (!a.startsAt || when >= new Date(a.startsAt).getTime()) &&
    (!a.endsAt || when <= new Date(a.endsAt).getTime());

  return {
    announcement: live ? a : null,
    header: t.header,
    headerMenu: t.header?.menuId ? getMenu(t.header.menuId) : null,
    footer: t.footer,
    footerMenus: (t.footer?.menuIds || []).map((id) => getMenu(id)).filter(Boolean),
  };
};

/* --------------------------------------------------- banners: calendario */

/**
 * Qué banner está al aire cada día del mes. Detectar huecos y solapamientos es
 * lo que hace útil la pantalla de Banners (§9.6).
 */
export const getBannerSchedule = ({ year, month } = {}) => {
  const base = new Date(TODAY);
  const y = year ?? base.getFullYear();
  const m = month ?? base.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const scheduled = _banners.filter((b) => b.status !== "borrador");

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = new Date(y, m, i + 1, 12);
    const t = day.getTime();
    const live = scheduled.filter(
      (b) =>
        (!b.startsAt || t >= new Date(b.startsAt).getTime()) &&
        (!b.endsAt || t <= new Date(b.endsAt).getTime())
    );
    return {
      day: i + 1,
      date: day,
      isToday: day.toDateString() === base.toDateString(),
      bannerIds: live.map((b) => b.id),
      count: live.length,
    };
  });

  return {
    year: y,
    month: m,
    label: new Date(y, m, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
    days,
    banners: scheduled.map(enrichBanner),
    gaps: days.filter((d) => d.count === 0).map((d) => d.day),
  };
};

/**
 * Tráfico simulado, determinista por banner y por tanda. Es el equivalente a
 * "generar carrito de ejemplo" de Marketing: sirve para ver la pantalla con
 * números, y queda claro que no son reales.
 */
export const simulateBannerTraffic = () => {
  let touched = 0;
  _banners = _banners.map((b) => {
    if (bannerState(b) !== "activo") return b;
    touched += 1;
    const seed = b.id.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
    const impressions = 400 + (seed % 900);
    const clicks = Math.round(impressions * (0.02 + ((seed % 7) / 100)));
    return { ...b, stats: { impressions: b.stats.impressions + impressions, clicks: b.stats.clicks + clicks } };
  });
  return { touched };
};

/* ------------------------------------------- datos para el renderer y el editor */

const safeAudiences = () => {
  try { return listAudiences(); } catch { return []; }
};

export const listAudiencesForContent = () => safeAudiences().map((a) => ({ id: a.id, name: a.name }));

export const listPromotionsForContent = () => {
  try {
    return listPromotions({ status: "activa" }).map((p) => ({ id: p.id, name: p.name }));
  } catch {
    return [];
  }
};

/** Opciones de los controles del inspector que referencian otras entidades. */
export const getReferenceOptions = () => ({
  collections: _collections.map((c) => ({ id: c.id, name: c.name, system: c.system })),
  banners: _banners.map((b) => ({ id: b.id, name: b.name, state: bannerState(b) })),
  media: _media.map((m) => ({ id: m.id, name: m.name, color: m.color, label: m.label })),
  promotions: listPromotionsForContent(),
  audiences: listAudiencesForContent(),
  pages: _pages.filter((p) => p.type !== "sistema").map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
  products: listProducts({ onlyPublished: true }).map((p) => ({ id: p.id, name: p.name, price: p.price })),
  categories: listCategories().map((c) => ({ id: c.id, name: c.name, productCount: c.productCount })),
  brands: listBrands().map((b) => ({ id: b.id, name: b.name, productCount: b.productCount })),
  postCategories: listPostCategories().map((c) => ({ id: c.id, name: c.name, postCount: c.postCount })),
  authors: _authors.map((a) => ({ id: a.id, name: a.name, role: a.role })),
  branches: safeBranches().map((b) => ({ id: b.id, name: b.name })),
  menus: _menus.map((m) => ({ id: m.id, name: m.name, location: m.location })),
});

const safeBranches = () => {
  try { return listBranches().filter((b) => b.isActive); } catch { return []; }
};

/**
 * ¿Este bloque tiene una referencia rota? (regla §10.9 — no rompe la página,
 * avisa). Lo usan `validateTree` y el panel "Necesita atención".
 */
function checkBlock(block) {
  const p = block.props || {};

  if (p.collectionId) {
    const col = _collections.find((c) => c.id === p.collectionId);
    if (!col) return { level: "error", message: "La colección referenciada ya no existe." };
    const { products } = resolveCollection(p.collectionId, { limit: p.limit, hideOutOfStock: p.hideOutOfStock });
    if (products.length === 0) return { level: "warning", message: `La colección "${col.name}" no devuelve productos.` };
  }

  if (p.bannerId) {
    const banner = _banners.find((b) => b.id === p.bannerId);
    if (!banner) return { level: "error", message: "El banner referenciado ya no existe." };
    const state = bannerState(banner);
    if (state === "vencido") return { level: "warning", message: `El banner "${banner.name}" está vencido.` };
    if (state === "borrador") return { level: "warning", message: `El banner "${banner.name}" está en borrador.` };
  }

  if (Array.isArray(p.bannerIds) && p.bannerIds.length) {
    const live = p.bannerIds.filter((id) => {
      const b = _banners.find((x) => x.id === id);
      return b && bannerState(b) === "activo";
    });
    if (live.length === 0) return { level: "warning", message: "Ningún banner del hero está al aire hoy." };
  }

  if (p.mediaId && !_media.find((m) => m.id === p.mediaId)) {
    return { level: "error", message: "La imagen referenciada ya no existe." };
  }

  if (p.productId && !getProduct(p.productId)) {
    return { level: "error", message: "El producto referenciado ya no está publicado." };
  }

  if (p.authorId && !_authors.find((a) => a.id === p.authorId)) {
    return { level: "error", message: "El autor referenciado ya no existe." };
  }

  if (Array.isArray(p.mediaIds) && p.mediaIds.some((id) => !_media.find((m) => m.id === id))) {
    return { level: "warning", message: "La galería referencia imágenes que ya no existen." };
  }

  if (block.type === "countdown" && p.promotionId) {
    const promo = getPromotion(p.promotionId);
    if (!promo) return { level: "error", message: "La promoción referenciada ya no existe." };
    if (!promo.endsAt) return { level: "warning", message: `«${promo.name}» no tiene fecha de fin: no hay qué contar.` };
    if (new Date(promo.endsAt).getTime() <= Date.now()) {
      return { level: "warning", message: `«${promo.name}» ya terminó.` };
    }
  }

  return null;
}

/** Valida un árbol en edición (el editor lo llama en cada cambio). */
export const validateSections = (sections) => validateTree(sections, { checkBlock });

/**
 * Todo lo que el renderer necesita para dibujar un bloque, ya resuelto.
 * El renderer no hace ninguna consulta por su cuenta.
 */
export const resolveBlockData = (block, page = null) => {
  const p = block.props || {};
  switch (block.type) {
    case "product-spotlight":
      return { product: p.productId ? getProduct(p.productId) : null };

    case "category-nav": {
      const all = listCategories();
      return { categories: p.categoryIds?.length ? all.filter((c) => p.categoryIds.includes(c.id)) : all };
    }

    case "brand-strip": {
      const all = listBrands();
      return { brands: p.brandIds?.length ? all.filter((b) => p.brandIds.includes(b.id)) : all };
    }

    case "video":
      return { poster: getMedia(p.posterMediaId) };

    case "gallery":
      return { media: (p.mediaIds || []).map((id) => getMedia(id)).filter(Boolean) };

    case "testimonials":
      return {
        items: p.source === "manual"
          ? (p.items || []).filter((it) => it.customer || it.comment)
          : listReviews({ minRating: p.minRating }).slice(0, p.limit || 3),
      };

    case "newsletter":
      // El bloque recibe la acción, no la implementa: así el renderer sigue
      // sin conocer a Marketing ni al CRM.
      return { subscribe: subscribeFromStore };

    case "post-list":
      return { posts: publishedPosts({ categoryIds: p.categoryIds, limit: p.limit }) };

    case "post-content":
      return { post: page?.type === "post" ? enrichPost(page) : null };

    case "author-card":
      return { author: _authors.find((a) => a.id === p.authorId) || null };

    case "product-grid":
    case "product-carousel": {
      const { collection, products, hiddenByStock } = resolveCollection(p.collectionId, {
        limit: p.limit, hideOutOfStock: p.hideOutOfStock,
      });
      return { collection, products, hiddenByStock };
    }
    case "collection-grid":
      return {
        items: (p.items || []).map((it) => {
          const col = _collections.find((c) => c.id === it.collectionId);
          const { totalMatched } = col ? resolveCollection(it.collectionId) : { totalMatched: 0 };
          return {
            ...it,
            collection: col || null,
            label: it.label || col?.name || "Colección",
            media: _media.find((m) => m.id === it.mediaId) || null,
            productCount: totalMatched || 0,
          };
        }),
      };
    case "hero": {
      // `weight` es literal: un banner con peso 3 ocupa tres lugares en la
      // rotación, así que aparece el triple que uno de peso 1.
      const chosen = (p.bannerIds || []).map((id) => getBanner(id)).filter(Boolean);
      const rotation = [];
      const maxWeight = Math.max(1, ...chosen.map((b) => b.weight || 1));
      for (let pass = 0; pass < maxWeight; pass += 1) {
        chosen.forEach((b) => { if ((b.weight || 1) > pass) rotation.push(b); });
      }
      return { banners: rotation.length ? rotation : chosen };
    }

    case "countdown": {
      const promo = p.promotionId ? getPromotion(p.promotionId) : null;
      if (!promo?.endsAt) return { promotion: promo, endsAt: null, expired: false, parts: [] };
      const ms = new Date(promo.endsAt).getTime() - Date.now();
      const abs = Math.max(0, ms);
      return {
        promotion: promo,
        endsAt: promo.endsAt,
        expired: ms <= 0,
        parts: [
          { label: "días", value: Math.floor(abs / 86400000) },
          { label: "horas", value: Math.floor(abs / 3600000) % 24 },
          { label: "min", value: Math.floor(abs / 60000) % 60 },
        ],
      };
    }

    case "store-locator": {
      let branches = [];
      try {
        branches = listBranches().filter((b) => b.isActive);
      } catch {
        /* Inventario no disponible: el bloque avisa que no hay sucursales. */
      }
      return { branches: p.branchIds?.length ? branches.filter((b) => p.branchIds.includes(b.id)) : branches };
    }
    case "promo-banner": {
      const banner = p.bannerId ? getBanner(p.bannerId) : null;
      const promotion = p.promotionId ? listPromotionsForContent().find((x) => x.id === p.promotionId) : null;
      return { banner, promotion };
    }
    case "image":
      return { media: getMedia(p.mediaId), mediaMobile: getMedia(p.mediaMobileId) };
    case "image-text":
      return { media: getMedia(p.mediaId) };
    default:
      return {};
  }
};

/** Etiqueta del bloque en el outline (usa el `summary` del schema). */
export const blockSummaryContext = (block) => {
  const p = block.props || {};
  return {
    collectionName: p.collectionId ? _collections.find((c) => c.id === p.collectionId)?.name : null,
    bannerName: p.bannerId ? _banners.find((b) => b.id === p.bannerId)?.name : null,
    mediaName: p.mediaId ? _media.find((m) => m.id === p.mediaId)?.name : null,
    productName: p.productId ? getProduct(p.productId)?.name : null,
    authorName: p.authorId ? _authors.find((a) => a.id === p.authorId)?.name : null,
    promotionName: p.promotionId ? listPromotionsForContent().find((x) => x.id === p.promotionId)?.name : null,
    collectionNames: Object.fromEntries(_collections.map((c) => [c.id, c.name])),
  };
};

/* ---------------------------------------------------------------- resumen */

export const getStoreSummary = () => {
  ensureScheduledPublish();
  const pages = _pages.map(enrichPage);
  const banners = _banners.map(enrichBanner);
  return {
    publishedPages: pages.filter((p) => p.state === "publicada" || p.state === "cambios_pendientes").length,
    pendingChanges: pages.filter((p) => p.state === "cambios_pendientes").length,
    activeBanners: banners.filter((b) => b.state === "activo").length,
    expiringBanners: banners.filter((b) => {
      if (b.state !== "activo" || !b.endsAt) return false;
      const days = (new Date(b.endsAt) - TODAY) / 86400000;
      return days >= 0 && days <= 7;
    }).length,
    emptyCollections: listCollections().filter((c) => c.productCount === 0).length,
    totalCollections: _collections.length,
  };
};

export const ATTENTION_KINDS = [
  { value: "contenido", label: "Contenido" },
  { value: "banner", label: "Banners" },
  { value: "coleccion", label: "Colecciones" },
  { value: "seo", label: "SEO" },
  { value: "sitio", label: "Sitio" },
];

/**
 * Panel "Necesita atención" — todo lo que está al aire y no debería, o lo que
 * falta para que algo se vea bien. Es la pantalla que evita descubrir por un
 * cliente que un banner venció hace dos semanas.
 */
export const getAttentionItems = ({ kind } = {}) => {
  const out = [];
  const add = (item) => out.push(item);

  _pages.forEach((p) => {
    validateTree(activeTree(p).sections, { checkBlock }).forEach((issue) => {
      add({ level: issue.level, kind: "contenido", pageId: p.id, pageTitle: p.title, message: issue.message });
    });

    if (p.type !== "sistema" && !p.seo?.description) {
      add({ level: "warning", kind: "seo", pageId: p.id, pageTitle: p.title, message: "Sin descripción para buscadores." });
    }
    if (p.type !== "sistema" && !p.seo?.ogMediaId) {
      add({ level: "warning", kind: "seo", pageId: p.id, pageTitle: p.title, message: "Sin imagen para compartir." });
    }
    if (p.type === "post" && !p.post?.authorId) {
      add({ level: "warning", kind: "contenido", pageId: p.id, pageTitle: p.title, message: "Nota sin autor." });
    }
    if (pageState(p) === "cambios_pendientes") {
      add({ level: "info", kind: "contenido", pageId: p.id, pageTitle: p.title, message: "Tiene cambios sin publicar." });
    }
    if (p.status === "programada" && p.publishAt) {
      add({
        level: "info", kind: "contenido", pageId: p.id, pageTitle: p.title,
        message: `Se publica sola el ${new Date(p.publishAt).toLocaleDateString("es-AR")}.`,
      });
    }
  });

  _banners.forEach((b) => {
    const state = bannerState(b);
    const usedIn = enrichBanner(b).usedInPages;

    if (state === "vencido" && usedIn.length) {
      add({
        level: "error", kind: "banner", pageId: usedIn[0].id, pageTitle: usedIn[0].title,
        message: `El banner «${b.name}» venció y sigue referenciado.`,
      });
    }
    if (state === "activo" && b.endsAt) {
      const days = Math.ceil((new Date(b.endsAt) - TODAY) / 86400000);
      if (days >= 0 && days <= 7) {
        add({ level: "warning", kind: "banner", pageId: null, pageTitle: null, message: `El banner «${b.name}» vence en ${days} día(s).` });
      }
    }
    if (state !== "borrador" && !b.mediaId) {
      add({ level: "warning", kind: "banner", pageId: null, pageTitle: null, message: `El banner «${b.name}» está al aire sin imagen.` });
    }
  });

  listCollections().forEach((c) => {
    if (c.productCount === 0 && c.status === "activa") {
      add({
        level: c.usedInPages.length ? "error" : "warning", kind: "coleccion",
        pageId: c.usedInPages[0]?.id || null, pageTitle: c.usedInPages[0]?.title || null,
        message: c.usedInPages.length
          ? `La colección «${c.name}» está vacía y la usa una página.`
          : `La colección «${c.name}» está activa pero vacía.`,
      });
    }
  });

  const a = _theme.announcement;
  if (a?.enabled && a.endsAt && new Date(a.endsAt) < TODAY) {
    add({ level: "error", kind: "sitio", pageId: null, pageTitle: null, message: "El anuncio superior está activo pero su vigencia venció." });
  }

  const order = { error: 0, warning: 1, info: 2 };
  return out
    .filter((i) => !kind || i.kind === kind)
    .sort((x, y) => order[x.level] - order[y.level]);
};

export const getRecentlyPublished = (limit = 5) =>
  _pages
    .filter((p) => p.publishedAt)
    .map(enrichPage)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, limit);

/* ------------------------------------------------------- render de página */

/**
 * Árbol filtrado por visibilidad, listo para dibujar.
 * @param {"draft"|"published"} source
 */
export const getRenderTree = (pageId, { source = "draft", viewAs = defaultViewAs() } = {}) => {
  const page = _pages.find((p) => p.id === pageId);
  if (!page) return { sections: [], page: null };
  const tree = source === "published" ? page.published : page.draft;
  if (!tree) return { sections: [], page: enrichPage(page) };

  const sections = tree.sections
    .map((s) => ({ ...s, _vis: evaluateVisibility(s.visibility, viewAs) }))
    .filter((s) => s._vis.visible)
    .map((s) => ({
      ...s,
      blocks: s.blocks.filter((b) => evaluateVisibility(b.visibility, viewAs).visible),
    }));

  return { sections, page: enrichPage(page) };
};
