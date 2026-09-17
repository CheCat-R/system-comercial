/**
 * Biblioteca de medios — simulada.
 *
 * Sin URLs reales: cada asset trae `color` y `label` y el renderer dibuja un
 * placeholder con degradado. Cuando exista un storage real, se agrega `url` y el
 * renderer lo prefiere. Ver docs/MODULO-TIENDA-CMS.md §1.3.
 */
import { atDaysAgo } from "../lib/time";

export const mediaAssets = [
  { id: "MD-1", name: "Portada temporada.jpg", kind: "image", url: null, color: "#4f46e5", label: "Temporada", alt: "Corredora al amanecer", width: 2400, height: 1200, sizeKb: 480, folder: "Home", tags: ["hero"], createdAt: atDaysAgo(40) },
  { id: "MD-2", name: "Portada trail.jpg", kind: "image", url: null, color: "#166534", label: "Trail", alt: "Sendero de montaña", width: 2400, height: 1200, sizeKb: 512, folder: "Home", tags: ["hero"], createdAt: atDaysAgo(35) },
  { id: "MD-3", name: "Portada mobile temporada.jpg", kind: "image", url: null, color: "#4338ca", label: "Temporada mobile", alt: "Corredora al amanecer", width: 800, height: 1000, sizeKb: 190, folder: "Home", tags: ["hero", "mobile"], createdAt: atDaysAgo(40) },
  { id: "MD-4", name: "Banner envío gratis.jpg", kind: "image", url: null, color: "#0891b2", label: "Envío gratis", alt: "Caja de envío", width: 1600, height: 600, sizeKb: 220, folder: "Promociones", tags: ["promo"], createdAt: atDaysAgo(28) },
  { id: "MD-5", name: "Banner mayorista.jpg", kind: "image", url: null, color: "#b45309", label: "Mayorista", alt: "Pallet de cajas en depósito", width: 1600, height: 600, sizeKb: 205, folder: "Promociones", tags: ["promo", "mayorista"], createdAt: atDaysAgo(10) },
  { id: "MD-6", name: "Categoría calzado.jpg", kind: "image", url: null, color: "#1d4ed8", label: "Calzado", alt: "Zapatillas sobre fondo claro", width: 1200, height: 900, sizeKb: 160, folder: "Categorías", tags: ["categoria"], createdAt: atDaysAgo(60) },
  { id: "MD-7", name: "Categoría indumentaria.jpg", kind: "image", url: null, color: "#0f766e", label: "Indumentaria", alt: "Prendas dobladas", width: 1200, height: 900, sizeKb: 155, folder: "Categorías", tags: ["categoria"], createdAt: atDaysAgo(60) },
  { id: "MD-8", name: "Categoría accesorios.jpg", kind: "image", url: null, color: "#7e22ce", label: "Accesorios", alt: "Mochila y botella", width: 1200, height: 900, sizeKb: 148, folder: "Categorías", tags: ["categoria"], createdAt: atDaysAgo(60) },
  { id: "MD-9", name: "Nuestro taller.jpg", kind: "image", url: null, color: "#334155", label: "Taller", alt: "Mesa de trabajo del taller", width: 1600, height: 1200, sizeKb: 340, folder: "Institucional", tags: ["about"], createdAt: atDaysAgo(90) },
  { id: "MD-10", name: "Banner Hot Sale.jpg", kind: "image", url: null, color: "#be123c", label: "Hot Sale", alt: "Fondo rojo con descuentos", width: 1600, height: 600, sizeKb: 198, folder: "Promociones", tags: ["promo", "hotsale"], createdAt: atDaysAgo(5) },
  { id: "MD-11", name: "Logo redes.png", kind: "image", url: null, color: "#0f172a", label: "Logo", alt: "Logo CheCAT", width: 1200, height: 630, sizeKb: 45, folder: "Marca", tags: ["og"], createdAt: atDaysAgo(120) },
  { id: "MD-12", name: "Nota primera zapatilla.jpg", kind: "image", url: null, color: "#0369a1", label: "Primera zapatilla", alt: "Zapatillas nuevas sobre una caja", width: 1600, height: 900, sizeKb: 240, folder: "Blog", tags: ["post"], createdAt: atDaysAgo(6) },
  { id: "MD-13", name: "Nota plan 10K.jpg", kind: "image", url: null, color: "#15803d", label: "Plan 10K", alt: "Pista de atletismo al amanecer", width: 1600, height: 900, sizeKb: 232, folder: "Blog", tags: ["post"], createdAt: atDaysAgo(13) },
  { id: "MD-14", name: "Nota material de montaña.jpg", kind: "image", url: null, color: "#7c2d12", label: "Material de montaña", alt: "Mochila y manta térmica sobre una roca", width: 1600, height: 900, sizeKb: 258, folder: "Blog", tags: ["post"], createdAt: atDaysAgo(40) },
  { id: "MD-15", name: "Galería taller 1.jpg", kind: "image", url: null, color: "#3f3f46", label: "Taller 1", alt: "Herramientas sobre la mesa", width: 1200, height: 1200, sizeKb: 180, folder: "Institucional", tags: ["galeria"], createdAt: atDaysAgo(90) },
  { id: "MD-16", name: "Galería taller 2.jpg", kind: "image", url: null, color: "#525252", label: "Taller 2", alt: "Prueba de suela", width: 1200, height: 1200, sizeKb: 176, folder: "Institucional", tags: ["galeria"], createdAt: atDaysAgo(90) },
  { id: "MD-17", name: "Galería taller 3.jpg", kind: "image", url: null, color: "#57534e", label: "Taller 3", alt: "Cajas listas para despacho", width: 1200, height: 1200, sizeKb: 169, folder: "Institucional", tags: ["galeria"], createdAt: atDaysAgo(90) },
];
