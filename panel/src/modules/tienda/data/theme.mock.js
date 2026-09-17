/**
 * Apariencia del sitio — config única.
 *
 * Header, footer y anuncio superior **no son bloques** (§3.8): son del sitio, no
 * de una página. Viven acá y el preview los dibuja alrededor del contenido.
 */
import { atDaysAgo } from "../lib/time";

export const theme = {
  palette: { preset: "indigo" },
  typography: { preset: "moderna" },
  shape: { radius: "md", density: "comoda" },

  header: {
    layout: "left",
    sticky: true,
    showSearch: true,
    showCart: true,
    menuId: "MN-HEADER",
    brand: "CheCAT",
  },

  footer: {
    menuIds: ["MN-FOOTER"],
    showSocial: true,
    showPayments: true,
    note: "CheCAT S.R.L. · CUIT 30-71234567-8 · Av. Santa Fe 3450, CABA",
  },

  announcement: {
    enabled: true,
    text: "Envío gratis en compras desde $80.000 · 12 cuotas sin interés",
    href: "/coleccion/ofertas",
    tone: "accent",
    startsAt: atDaysAgo(20),
    endsAt: atDaysAgo(-25),
  },
};
