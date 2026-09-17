/**
 * Catálogo canónico del panel.
 *
 * Los 5 primeros productos son los mismos que ya usan Inventario
 * (`inventario/data/skus.mock.js`), Logística, Facturación, Finanzas y Marketing:
 * mismos `id`, `name`, `sku` y `price`. Los 9 restantes amplían el surtido para que
 * la Tienda pueda armar colecciones y grillas creíbles.
 *
 * Sin URLs de imagen: cada producto trae `mediaColor` y el renderer dibuja un
 * placeholder. Ver docs/MODULO-TIENDA-CMS.md §6.
 */

const pad = (n) => String(n).padStart(2, "0");
const TODAY = new Date(2026, 8, 3); // 2026-09-03, igual que el resto de los módulos

/** "YYYY-MM-DD" hace `n` días. */
const dayAgo = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const categories = [
  { id: "CAT-1", name: "Calzado", slug: "calzado", description: "Running, trail y urbano." },
  { id: "CAT-2", name: "Indumentaria", slug: "indumentaria", description: "Remeras, shorts, camperas y calzas." },
  { id: "CAT-3", name: "Accesorios", slug: "accesorios", description: "Mochilas, gorras, botellas y más." },
];

export const brands = [
  { id: "BR-1", name: "Aureo", slug: "aureo" },
  { id: "BR-2", name: "Nord", slug: "nord" },
  { id: "BR-3", name: "Vertex", slug: "vertex" },
  { id: "BR-4", name: "Kaia", slug: "kaia" },
];

export const tags = [
  { id: "TG-1", name: "Oferta", color: "#ef4444" },
  { id: "TG-2", name: "Nuevo", color: "#10b981" },
  { id: "TG-3", name: "Más vendido", color: "#f59e0b" },
  { id: "TG-4", name: "Envío gratis", color: "#3b82f6" },
];

/**
 * `stock` es el valor de referencia del catálogo. Para los SKU que existen en
 * Inventario (SKU-1..5), `catalogApi` lo pisa con el stock real.
 */
export const products = [
  {
    id: 1, name: "Zapatillas Running X", slug: "zapatillas-running-x", sku: "SKU-1",
    categoryId: "CAT-1", brandId: "BR-1", price: 45000, cost: 28000, compareAtPrice: 52000, stock: 124,
    status: "Activo", tagIds: ["TG-3", "TG-4"], mediaColor: "#4f46e5", rating: 4.6, reviewCount: 38,
    createdAt: dayAgo(210), soldUnits: 312,
    description: "Amortiguación reactiva para entrenamientos diarios en asfalto. Upper de malla técnica.",
  },
  {
    id: 2, name: "Remera Básica Blanca", slug: "remera-basica-blanca", sku: "SKU-2",
    categoryId: "CAT-2", brandId: "BR-2", price: 12000, cost: 6000, compareAtPrice: null, stock: 35,
    status: "Activo", tagIds: [], mediaColor: "#64748b", rating: 4.2, reviewCount: 91,
    createdAt: dayAgo(180), soldUnits: 540,
    description: "Algodón peinado 24/1, corte regular. La base de cualquier conjunto.",
  },
  {
    id: 3, name: "Short Deportivo Elite", slug: "short-deportivo-elite", sku: "SKU-3",
    categoryId: "CAT-2", brandId: "BR-1", price: 18500, cost: 9000, compareAtPrice: null, stock: 0,
    status: "Agotado", tagIds: [], mediaColor: "#0f766e", rating: 4.4, reviewCount: 27,
    createdAt: dayAgo(150), soldUnits: 188,
    description: "Tejido liviano con bolsillo interno para llave. Secado rápido.",
  },
  {
    id: 4, name: "Gorra Snapback Urban", slug: "gorra-snapback-urban", sku: "SKU-4",
    categoryId: "CAT-3", brandId: "BR-4", price: 8500, cost: 3500, compareAtPrice: null, stock: 45,
    status: "Borrador", tagIds: [], mediaColor: "#7c3aed", rating: 4.0, reviewCount: 12,
    createdAt: dayAgo(20), soldUnits: 64,
    description: "Visera plana, cierre ajustable. Seis paneles estructurados.",
  },
  {
    id: 5, name: "Mochila Trekking 40L", slug: "mochila-trekking-40l", sku: "SKU-5",
    categoryId: "CAT-3", brandId: "BR-3", price: 65000, cost: 32000, compareAtPrice: 79000, stock: 12,
    status: "Activo", tagIds: ["TG-1", "TG-4"], mediaColor: "#b45309", rating: 4.8, reviewCount: 54,
    createdAt: dayAgo(120), soldUnits: 143,
    description: "Espalda ventilada, cubre-lluvia incluido y acceso frontal al compartimento principal.",
  },
  {
    id: 6, name: "Campera Rompeviento Trail", slug: "campera-rompeviento-trail", sku: "SKU-6",
    categoryId: "CAT-2", brandId: "BR-3", price: 78000, cost: 41000, compareAtPrice: 95000, stock: 28,
    status: "Activo", tagIds: ["TG-1", "TG-4"], mediaColor: "#1d4ed8", rating: 4.7, reviewCount: 41,
    createdAt: dayAgo(95), soldUnits: 97,
    description: "Cortaviento plegable con capucha ajustable. Costuras selladas en hombros.",
  },
  {
    id: 7, name: "Calza Térmica Pro", slug: "calza-termica-pro", sku: "SKU-7",
    categoryId: "CAT-2", brandId: "BR-1", price: 24000, cost: 11000, compareAtPrice: null, stock: 66,
    status: "Activo", tagIds: ["TG-3"], mediaColor: "#334155", rating: 4.5, reviewCount: 63,
    createdAt: dayAgo(75), soldUnits: 274,
    description: "Interior afelpado y compresión graduada. Cintura alta con bolsillo lateral.",
  },
  {
    id: 8, name: "Zapatillas Trail Ridge", slug: "zapatillas-trail-ridge", sku: "SKU-8",
    categoryId: "CAT-1", brandId: "BR-3", price: 92000, cost: 52000, compareAtPrice: null, stock: 19,
    status: "Activo", tagIds: ["TG-2", "TG-4"], mediaColor: "#166534", rating: 4.9, reviewCount: 22,
    createdAt: dayAgo(12), soldUnits: 41,
    description: "Suela con tacos de 5 mm y placa de protección. Para terreno técnico y barro.",
  },
  {
    id: 9, name: "Medias Running Pack x3", slug: "medias-running-pack-x3", sku: "SKU-9",
    categoryId: "CAT-3", brandId: "BR-1", price: 7500, cost: 2800, compareAtPrice: null, stock: 210,
    status: "Activo", tagIds: ["TG-3"], mediaColor: "#0891b2", rating: 4.3, reviewCount: 118,
    createdAt: dayAgo(160), soldUnits: 631,
    description: "Caña corta, zonas de ventilación y refuerzo en talón. Pack de tres pares.",
  },
  {
    id: 10, name: "Botella Térmica 750ml", slug: "botella-termica-750ml", sku: "SKU-10",
    categoryId: "CAT-3", brandId: "BR-4", price: 15000, cost: 6200, compareAtPrice: 19000, stock: 88,
    status: "Activo", tagIds: ["TG-1"], mediaColor: "#be123c", rating: 4.6, reviewCount: 77,
    createdAt: dayAgo(140), soldUnits: 302,
    description: "Acero inoxidable de doble pared. Doce horas de frío, seis de calor.",
  },
  {
    id: 11, name: "Buzo Canguro Essential", slug: "buzo-canguro-essential", sku: "SKU-11",
    categoryId: "CAT-2", brandId: "BR-2", price: 42000, cost: 19000, compareAtPrice: null, stock: 0,
    status: "Agotado", tagIds: [], mediaColor: "#475569", rating: 4.4, reviewCount: 49,
    createdAt: dayAgo(88), soldUnits: 165,
    description: "Frisa perchada, puños acanalados y bolsillo canguro. Corte oversize.",
  },
  {
    id: 12, name: "Zapatillas Urbanas Loft", slug: "zapatillas-urbanas-loft", sku: "SKU-12",
    categoryId: "CAT-1", brandId: "BR-4", price: 58000, cost: 33000, compareAtPrice: null, stock: 37,
    status: "Activo", tagIds: ["TG-2"], mediaColor: "#a16207", rating: 4.1, reviewCount: 16,
    createdAt: dayAgo(8), soldUnits: 23,
    description: "Silueta retro en cuero y gamuza. Plantilla removible acolchada.",
  },
  {
    id: 13, name: "Guantes Running Windstop", slug: "guantes-running-windstop", sku: "SKU-13",
    categoryId: "CAT-3", brandId: "BR-3", price: 11000, cost: 4300, compareAtPrice: null, stock: 52,
    status: "Activo", tagIds: ["TG-2"], mediaColor: "#0f172a", rating: 4.2, reviewCount: 9,
    createdAt: dayAgo(15), soldUnits: 31,
    description: "Cortaviento en dorso, punta compatible con pantalla táctil.",
  },
  {
    id: 14, name: "Bolso Deportivo 30L", slug: "bolso-deportivo-30l", sku: "SKU-14",
    categoryId: "CAT-3", brandId: "BR-2", price: 38000, cost: 18500, compareAtPrice: 45000, stock: 24,
    status: "Activo", tagIds: ["TG-1", "TG-4"], mediaColor: "#7e22ce", rating: 4.5, reviewCount: 33,
    createdAt: dayAgo(110), soldUnits: 119,
    description: "Compartimento ventilado para calzado y bandolera desmontable acolchada.",
  },
];

export const reviews = [
  { id: "RV-1", productId: 1, customer: "Juan Carlos R.", rating: 5, comment: "Livianas y con muy buen agarre. Ya llevo 300 km y siguen impecables.", date: dayAgo(9), status: "Aprobado" },
  { id: "RV-2", productId: 5, customer: "Ana Torres", rating: 5, comment: "La usé en cuatro días de trekking y entró todo. El cubre-lluvia salva.", date: dayAgo(14), status: "Aprobado" },
  { id: "RV-3", productId: 8, customer: "Martín Silva", rating: 5, comment: "En barro no se resbala nada. Es otra categoría respecto de mis anteriores.", date: dayAgo(4), status: "Aprobado" },
  { id: "RV-4", productId: 7, customer: "Sofía Ruiz", rating: 4, comment: "Abriga muchísimo. Le bajo una estrella porque el talle corre chico.", date: dayAgo(21), status: "Aprobado" },
  { id: "RV-5", productId: 10, customer: "Roberto Díaz", rating: 5, comment: "Doce horas y el agua seguía helada. Cumple lo que promete.", date: dayAgo(30), status: "Aprobado" },
  { id: "RV-6", productId: 2, customer: "Lucía Fernández", rating: 4, comment: "Buen algodón, no se deformó después de varios lavados.", date: dayAgo(45), status: "Aprobado" },
  { id: "RV-7", productId: 6, customer: "Diego Paz", rating: 5, comment: "Ocupa nada en la mochila y para el viento de verdad.", date: dayAgo(18), status: "Aprobado" },
  { id: "RV-8", productId: 3, customer: "Valeria Gómez", rating: 2, comment: "El bolsillo interno es muy chico, no entra una llave grande.", date: dayAgo(52), status: "Pendiente" },
];
