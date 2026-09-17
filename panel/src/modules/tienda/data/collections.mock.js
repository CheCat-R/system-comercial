/**
 * Colecciones — la pieza que hace ecommerce al CMS.
 *
 * Una colección responde "qué productos van acá" y es el punto de acople entre
 * contenido y catálogo. Las de sistema (`system: true`) no se borran: existen para
 * que los bloques tengan siempre una fuente válida y para que "Productos
 * destacados" sea una cosa única en todo el panel.
 *
 * Ver docs/MODULO-TIENDA-CMS.md §4.
 */
import { atDaysAgo } from "../lib/time";

export const collections = [
  {
    id: "CO-DESTACADOS", name: "Productos destacados", slug: "destacados", system: true,
    description: "La curaduría de la home. Se ordena a mano.",
    mode: "manual", productIds: [1, 8, 5, 6, 12, 7, 10, 14], rules: null,
    sort: "manual", limit: 12, heroBannerId: null, status: "activa", createdAt: atDaysAgo(200),
  },
  {
    id: "CO-NOVEDADES", name: "Novedades", slug: "novedades", system: true,
    description: "Lo que entró en los últimos 30 días.",
    mode: "rules", productIds: [],
    rules: { categoryIds: [], brandIds: [], tagIds: [], newerThanDays: 30, inStock: true },
    sort: "newest", limit: 12, heroBannerId: "BN-2", status: "activa", createdAt: atDaysAgo(200),
  },
  {
    id: "CO-OFERTAS", name: "Ofertas", slug: "ofertas", system: true,
    description: "Todo lo que tiene precio tachado o promoción activa.",
    mode: "rules", productIds: [],
    rules: { categoryIds: [], brandIds: [], tagIds: [], onSale: true, inStock: true },
    sort: "discount", limit: 24, heroBannerId: null, status: "activa", createdAt: atDaysAgo(200),
  },
  {
    id: "CO-MAS-VENDIDOS", name: "Más vendidos", slug: "mas-vendidos", system: true,
    description: "Ranking por unidades vendidas.",
    mode: "rules", productIds: [],
    rules: { categoryIds: [], brandIds: [], tagIds: [], inStock: true },
    sort: "bestsellers", limit: 12, heroBannerId: null, status: "activa", createdAt: atDaysAgo(200),
  },
  {
    id: "CO-CALZADO", name: "Calzado", slug: "calzado", system: false,
    description: "Toda la categoría, ordenada por lo más vendido.",
    mode: "rules", productIds: [],
    rules: { categoryIds: ["CAT-1"], brandIds: [], tagIds: [], inStock: false },
    sort: "bestsellers", limit: 24, heroBannerId: null, status: "activa", createdAt: atDaysAgo(150),
  },
  {
    id: "CO-INDUMENTARIA", name: "Indumentaria", slug: "indumentaria", system: false,
    description: "Remeras, shorts, calzas y abrigo.",
    mode: "rules", productIds: [],
    rules: { categoryIds: ["CAT-2"], brandIds: [], tagIds: [], inStock: false },
    sort: "bestsellers", limit: 24, heroBannerId: null, status: "activa", createdAt: atDaysAgo(150),
  },
  {
    id: "CO-ACCESORIOS", name: "Accesorios", slug: "accesorios", system: false,
    description: "Mochilas, gorras, botellas y medias.",
    mode: "rules", productIds: [],
    rules: { categoryIds: ["CAT-3"], brandIds: [], tagIds: [], inStock: false },
    sort: "bestsellers", limit: 24, heroBannerId: null, status: "activa", createdAt: atDaysAgo(150),
  },
  {
    id: "CO-TRAIL", name: "Equipo de trail", slug: "equipo-de-trail", system: false,
    description: "Selección para montaña. Curada a mano por el equipo.",
    mode: "manual", productIds: [8, 6, 5, 13], rules: null,
    sort: "manual", limit: 12, heroBannerId: "BN-2", status: "activa", createdAt: atDaysAgo(45),
  },
  {
    id: "CO-REGALOS", name: "Ideas para regalar", slug: "ideas-para-regalar", system: false,
    description: "Pensada para el Día del Padre. Todavía sin cargar.",
    mode: "manual", productIds: [], rules: null,
    sort: "manual", limit: 12, heroBannerId: null, status: "borrador", createdAt: atDaysAgo(3),
  },
];
