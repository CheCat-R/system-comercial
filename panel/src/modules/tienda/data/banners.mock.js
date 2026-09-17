/**
 * Banners — creatividades reutilizables con ciclo de vida propio.
 *
 * Un banner no es un bloque: vive en la biblioteca, tiene vigencia, audiencia y
 * promoción vinculada, y varios bloques (`hero`, `promo-banner`) lo referencian.
 * Ver docs/MODULO-TIENDA-CMS.md §2.2.
 */
import { atDaysAgo } from "../lib/time";

export const banners = [
  {
    id: "BN-1", name: "Temporada nueva",
    mediaId: "MD-1", mediaMobileId: "MD-3",
    headline: "La temporada empieza acá", subheadline: "Hasta 30 % en running y trail",
    cta: { label: "Ver la colección", href: "/coleccion/novedades" },
    position: "center-left", theme: "light",
    startsAt: atDaysAgo(30), endsAt: null,
    audienceId: null, promotionId: null, weight: 2, status: "activo",
    stats: { impressions: 18420, clicks: 1236 },
    createdAt: atDaysAgo(35),
  },
  {
    id: "BN-2", name: "Trail Ridge",
    mediaId: "MD-2", mediaMobileId: null,
    headline: "Terreno técnico, cero excusas", subheadline: "Nueva Trail Ridge · Suela de 5 mm",
    cta: { label: "Conocerla", href: "/coleccion/novedades" },
    position: "bottom-left", theme: "light",
    startsAt: atDaysAgo(12), endsAt: null,
    audienceId: null, promotionId: null, weight: 1, status: "activo",
    stats: { impressions: 9310, clicks: 742 },
    createdAt: atDaysAgo(14),
  },
  {
    id: "BN-3", name: "Envío gratis",
    mediaId: "MD-4", mediaMobileId: null,
    headline: "Envío gratis desde $80.000", subheadline: "A todo el país, sin mínimo de unidades",
    cta: { label: "Empezar a comprar", href: "/coleccion/mas-vendidos" },
    position: "center", theme: "light",
    startsAt: atDaysAgo(25), endsAt: null,
    audienceId: null, promotionId: "PRM-01", weight: 1, status: "activo",
    stats: { impressions: 22105, clicks: 890 },
    createdAt: atDaysAgo(28),
  },
  {
    id: "BN-4", name: "Beneficio mayorista",
    mediaId: "MD-5", mediaMobileId: null,
    headline: "Tu precio mayorista", subheadline: "5 % extra en compras desde $250.000",
    cta: { label: "Ver mis beneficios", href: "/coleccion/mas-vendidos" },
    position: "center", theme: "dark",
    startsAt: atDaysAgo(2), endsAt: atDaysAgo(-6),
    audienceId: "AUD-01", promotionId: "PRM-04", weight: 1, status: "activo",
    stats: { impressions: 1480, clicks: 214 },
    createdAt: atDaysAgo(9),
  },
  {
    id: "BN-5", name: "Hot Sale (programado)",
    mediaId: "MD-10", mediaMobileId: null,
    headline: "Hot Sale", subheadline: "Tres días de descuentos reales",
    cta: { label: "Ver ofertas", href: "/coleccion/ofertas" },
    position: "center", theme: "dark",
    // `atDaysAgo` con negativo va al futuro: -11 es antes que -14.
    startsAt: atDaysAgo(-11), endsAt: atDaysAgo(-14),
    audienceId: null, promotionId: null, weight: 3, status: "activo",
    stats: { impressions: 0, clicks: 0 },
    createdAt: atDaysAgo(4),
  },
  {
    id: "BN-6", name: "Vuelta al invierno",
    mediaId: "MD-7", mediaMobileId: null,
    headline: "Vuelta al invierno", subheadline: "Térmicas y camperas con 20 %",
    cta: { label: "Ver abrigo", href: "/coleccion/ofertas" },
    position: "center-left", theme: "light",
    startsAt: atDaysAgo(120), endsAt: atDaysAgo(60),
    audienceId: null, promotionId: null, weight: 1, status: "activo",
    stats: { impressions: 31200, clicks: 2480 },
    createdAt: atDaysAgo(130),
  },
  {
    id: "BN-7", name: "Sin título (borrador)",
    mediaId: null, mediaMobileId: null,
    headline: "", subheadline: "",
    cta: { label: "", href: "" },
    position: "center", theme: "light",
    startsAt: null, endsAt: null,
    audienceId: null, promotionId: null, weight: 1, status: "borrador",
    stats: { impressions: 0, clicks: 0 },
    createdAt: atDaysAgo(1),
  },
];
