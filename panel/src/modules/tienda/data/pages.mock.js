/**
 * Páginas.
 *
 * Home, landings, institucionales y (en F2) las notas del blog son **la misma
 * entidad** con distinto `type`. Cada una guarda dos árboles: `draft` (lo que se
 * edita) y `published` (lo que ve el cliente).
 *
 * Ver docs/MODULO-TIENDA-CMS.md §2.1 y §8.
 */
import { atDaysAgo } from "../lib/time";

const section = (id, name, layout, blocks, visibility) => ({
  id, name,
  layout: { width: "wide", background: "surface", spacing: "lg", columns: 1, columnRatio: "equal", mobileStack: true, ...layout },
  visibility: visibility || { mode: "always" },
  blocks,
});

const block = (id, type, props, visibility) => ({
  id, type, props, visibility: visibility || { mode: "always" }, column: 0,
});

/* ------------------------------------------------------------------- HOME */

const homeSections = () => [
  section("SC-H1", "Portada", { width: "full", spacing: "none" }, [
    block("BL-H1", "hero", {
      bannerIds: ["BN-1", "BN-2"], height: "lg", autoplayMs: 6000, showDots: true, overlay: 30,
    }),
  ]),

  section("SC-H2", "Beneficios", { background: "sunken", spacing: "sm" }, [
    block("BL-H2", "usp-bar", {
      layout: "inline",
      items: [
        { _id: "IT-1", icon: "truck", title: "Envío gratis", subtitle: "En compras desde $80.000" },
        { _id: "IT-2", icon: "card", title: "Hasta 12 cuotas", subtitle: "Con todas las tarjetas" },
        { _id: "IT-3", icon: "refresh", title: "Cambios en 30 días", subtitle: "Sin costo, en todo el país" },
        { _id: "IT-4", icon: "shield", title: "Compra protegida", subtitle: "Devolución garantizada" },
      ],
    }),
  ]),

  section("SC-H3", "Categorías", {}, [
    block("BL-H3", "collection-grid", {
      heading: "Comprá por categoría", columns: 3, aspect: "wide",
      items: [
        { _id: "IT-5", collectionId: "CO-CALZADO", label: "", mediaId: "MD-6" },
        { _id: "IT-6", collectionId: "CO-INDUMENTARIA", label: "", mediaId: "MD-7" },
        { _id: "IT-7", collectionId: "CO-ACCESORIOS", label: "", mediaId: "MD-8" },
      ],
    }),
  ]),

  section("SC-H4", "Destacados", {}, [
    block("BL-H4", "product-grid", {
      heading: "Destacados de la temporada", collectionId: "CO-DESTACADOS",
      columns: 4, limit: 8, cardStyle: "default",
      showPrice: true, showBadge: true, showRating: false, hideOutOfStock: true,
      ctaLabel: "Ver todo", ctaHref: "/coleccion/destacados",
    }),
  ]),

  section("SC-H5", "Envío gratis", { spacing: "md" }, [
    block("BL-H5", "promo-banner", {
      bannerId: "BN-3", promotionId: "PRM-01", showCouponCode: false, size: "inset",
    }),
  ]),

  section("SC-H6", "Quiénes somos", {}, [
    block("BL-H6", "image-text", {
      mediaId: "MD-9", imageSide: "left",
      heading: "Diez años probando cada cosa que vendemos",
      body: "Empezamos con una mesa de trabajo y tres modelos de zapatillas. Hoy seguimos con la misma regla: **si no lo usamos nosotros, no entra al catálogo**.\n\nCada producto pasa por al menos 200 km de prueba antes de publicarse.",
      ctaLabel: "Conocer la marca", ctaHref: "/nosotros",
    }),
  ]),

  section("SC-H7", "Novedades", { background: "sunken" }, [
    block("BL-H7", "product-carousel", {
      heading: "Recién llegado", collectionId: "CO-NOVEDADES",
      limit: 10, cardStyle: "minimal", showPrice: true, showBadge: true, hideOutOfStock: true,
    }),
  ]),

  section("SC-H8", "Beneficio mayorista", { background: "accent-subtle", spacing: "md" }, [
    block("BL-H8", "promo-banner", {
      bannerId: "BN-4", promotionId: "PRM-04", showCouponCode: false, size: "inset",
    }),
  ], { mode: "audience", audienceId: "AUD-01" }),
];

/* --------------------------------------------------------------- LANDINGS */

const trailSections = () => [
  section("SC-T1", "Portada", { width: "full", spacing: "none" }, [
    block("BL-T1", "hero", { bannerIds: ["BN-2"], height: "md", autoplayMs: 0, showDots: false, overlay: 35 }),
  ]),
  section("SC-T2", "Intro", { width: "narrow", spacing: "lg" }, [
    block("BL-T2", "rich-text", {
      heading: "Equipo de trail, elegido por gente que corre trail",
      body: "No es una categoría del catálogo: es una selección corta de lo que realmente usamos en montaña. Cuatro productos, cero relleno.",
      align: "center", maxWidth: "prose",
    }),
  ]),
  section("SC-T3", "Selección", {}, [
    block("BL-T3", "product-grid", {
      heading: "", collectionId: "CO-TRAIL", columns: 4, limit: 8, cardStyle: "default",
      showPrice: true, showBadge: true, showRating: true, hideOutOfStock: false,
      ctaLabel: "", ctaHref: "",
    }),
  ]),
  section("SC-T4", "Cierre", { background: "sunken" }, [
    block("BL-T4", "cta", {
      heading: "¿Dudas con el talle o el terreno?",
      body: "Escribinos y te ayudamos a elegir. Respondemos en el día.",
      buttonLabel: "Hablar con el equipo", buttonHref: "/contacto", tone: "accent",
    }),
  ]),
];

/* ------------------------------------------------------------------ PAGES */

export const pages = [
  {
    id: "PG-HOME", type: "home", slug: "/", title: "Inicio",
    status: "publicada", publishAt: null,
    seo: {
      title: "CheCAT — Indumentaria y calzado deportivo",
      description: "Running, trail y urbano. Envío gratis desde $80.000 y cambios sin costo en 30 días.",
      ogMediaId: "MD-11", noindex: false,
    },
    // El borrador suma una sección de cierre que todavía no está publicada:
    // así la home arranca en estado "publicada con cambios pendientes".
    draft: {
      sections: [
        ...homeSections(),
        section("SC-H9", "Cierre", { spacing: "lg" }, [
          block("BL-H9", "cta", {
            heading: "Suscribite y enterate antes",
            body: "Lanzamientos, reposiciones y ofertas reales. Un mail por semana, sin vueltas.",
            buttonLabel: "Quiero suscribirme", buttonHref: "/contacto", tone: "accent",
          }),
        ]),
      ],
    },
    published: { sections: homeSections() },
    createdAt: atDaysAgo(220), updatedAt: atDaysAgo(1, "16", "42"), updatedBy: "María López",
    publishedAt: atDaysAgo(6, "11", "05"), publishedBy: "María López",
  },
  {
    id: "PG-TRAIL", type: "landing", slug: "equipo-de-trail", title: "Equipo de trail",
    status: "publicada", publishAt: null,
    seo: {
      title: "Equipo de trail — CheCAT",
      description: "Selección corta de calzado y abrigo para montaña, probada en terreno.",
      ogMediaId: "MD-2", noindex: false,
    },
    draft: { sections: trailSections() },
    published: { sections: trailSections() },
    campaignId: null,
    createdAt: atDaysAgo(45), updatedAt: atDaysAgo(11, "10", "18"), updatedBy: "María López",
    publishedAt: atDaysAgo(11, "10", "20"), publishedBy: "María López",
  },
  {
    id: "PG-HOTSALE", type: "landing", slug: "hot-sale", title: "Hot Sale",
    status: "borrador", publishAt: null,
    seo: { title: "Hot Sale — CheCAT", description: "", ogMediaId: null, noindex: false },
    draft: {
      sections: [
        section("SC-HS1", "Portada", { width: "full", spacing: "none" }, [
          block("BL-HS1", "hero", { bannerIds: ["BN-5"], height: "md", autoplayMs: 0, showDots: false, overlay: 20 }),
        ]),
        section("SC-HS2", "Ofertas", {}, [
          block("BL-HS2", "product-grid", {
            heading: "Todas las ofertas", collectionId: "CO-OFERTAS", columns: 4, limit: 12,
            cardStyle: "default", showPrice: true, showBadge: true, showRating: false, hideOutOfStock: true,
            ctaLabel: "", ctaHref: "",
          }),
        ]),
      ],
    },
    published: null,
    campaignId: null,
    createdAt: atDaysAgo(4), updatedAt: atDaysAgo(0, "09", "30"), updatedBy: "María López",
    publishedAt: null, publishedBy: null,
  },
  {
    id: "PG-NOSOTROS", type: "institucional", slug: "nosotros", title: "Nosotros",
    status: "publicada", publishAt: null,
    seo: { title: "Nosotros — CheCAT", description: "Diez años probando cada producto antes de venderlo.", ogMediaId: "MD-9", noindex: false },
    draft: {
      sections: [
        section("SC-N1", "Historia", { width: "narrow" }, [
          block("BL-N1", "rich-text", {
            heading: "Nuestra historia",
            body: "Arrancamos en 2016 con una mesa de trabajo y tres modelos de zapatillas.\n\nHoy seguimos con la misma regla: si no lo usamos nosotros, no entra al catálogo. Cada producto pasa por al menos 200 km de prueba antes de publicarse.",
            align: "left", maxWidth: "prose",
          }),
        ]),
        section("SC-N2", "Taller", {}, [
          block("BL-N2", "image-text", {
            mediaId: "MD-9", imageSide: "right",
            heading: "El taller",
            body: "Reparamos, probamos y devolvemos al uso todo lo que se puede. La garantía no es un trámite: es parte del producto.",
            ctaLabel: "", ctaHref: "",
          }),
        ]),
      ],
    },
    published: {
      sections: [
        section("SC-N1", "Historia", { width: "narrow" }, [
          block("BL-N1", "rich-text", {
            heading: "Nuestra historia",
            body: "Arrancamos en 2016 con una mesa de trabajo y tres modelos de zapatillas.\n\nHoy seguimos con la misma regla: si no lo usamos nosotros, no entra al catálogo. Cada producto pasa por al menos 200 km de prueba antes de publicarse.",
            align: "left", maxWidth: "prose",
          }),
        ]),
        section("SC-N2", "Taller", {}, [
          block("BL-N2", "image-text", {
            mediaId: "MD-9", imageSide: "right",
            heading: "El taller",
            body: "Reparamos, probamos y devolvemos al uso todo lo que se puede. La garantía no es un trámite: es parte del producto.",
            ctaLabel: "", ctaHref: "",
          }),
        ]),
      ],
    },
    createdAt: atDaysAgo(190), updatedAt: atDaysAgo(60, "15", "00"), updatedBy: "María López",
    publishedAt: atDaysAgo(60, "15", "02"), publishedBy: "María López",
  },
  {
    id: "PG-ENVIOS", type: "institucional", slug: "envios-y-devoluciones", title: "Envíos y devoluciones",
    status: "publicada", publishAt: null,
    seo: { title: "Envíos y devoluciones — CheCAT", description: "Plazos, costos y cómo hacer un cambio.", ogMediaId: null, noindex: false },
    draft: {
      sections: [
        section("SC-E1", "Condiciones", { width: "narrow" }, [
          block("BL-E1", "rich-text", {
            heading: "Envíos y devoluciones",
            body: "**Envío gratis** en compras desde $80.000 a todo el país.\n\nDespachamos dentro de las 48 h hábiles. El plazo de entrega es de 3 a 7 días según la localidad.\n\nTenés **30 días** para cambiar cualquier producto sin usar. El primer cambio no tiene costo.",
            align: "left", maxWidth: "prose",
          }),
        ]),
      ],
    },
    published: {
      sections: [
        section("SC-E1", "Condiciones", { width: "narrow" }, [
          block("BL-E1", "rich-text", {
            heading: "Envíos y devoluciones",
            body: "**Envío gratis** en compras desde $80.000 a todo el país.\n\nDespachamos dentro de las 48 h hábiles. El plazo de entrega es de 3 a 7 días según la localidad.\n\nTenés **30 días** para cambiar cualquier producto sin usar. El primer cambio no tiene costo.",
            align: "left", maxWidth: "prose",
          }),
        ]),
      ],
    },
    createdAt: atDaysAgo(190), updatedAt: atDaysAgo(88, "12", "10"), updatedBy: "María López",
    publishedAt: atDaysAgo(88, "12", "12"), publishedBy: "María López",
  },
  {
    id: "PG-CONTACTO", type: "institucional", slug: "contacto", title: "Contacto",
    status: "publicada", publishAt: null,
    seo: { title: "Contacto — CheCAT", description: "", ogMediaId: null, noindex: false },
    draft: {
      sections: [
        section("SC-C1", "Contacto", { width: "narrow" }, [
          block("BL-C1", "rich-text", {
            heading: "Hablemos",
            body: "Escribinos a hola@checat.com.ar o por WhatsApp al 11 5555-5555. Respondemos de lunes a viernes de 9 a 18.",
            align: "center", maxWidth: "prose",
          }),
        ]),
      ],
    },
    published: {
      sections: [
        section("SC-C1", "Contacto", { width: "narrow" }, [
          block("BL-C1", "rich-text", {
            heading: "Hablemos",
            body: "Escribinos a hola@checat.com.ar o por WhatsApp al 11 5555-5555. Respondemos de lunes a viernes de 9 a 18.",
            align: "center", maxWidth: "prose",
          }),
        ]),
      ],
    },
    createdAt: atDaysAgo(190), updatedAt: atDaysAgo(120, "09", "00"), updatedBy: "María López",
    publishedAt: atDaysAgo(120, "09", "01"), publishedBy: "María López",
  },
  {
    id: "PG-404", type: "sistema", slug: "404", title: "Página no encontrada",
    status: "publicada", publishAt: null,
    seo: { title: "Página no encontrada", description: "", ogMediaId: null, noindex: true },
    draft: {
      sections: [
        section("SC-4041", "Mensaje", { width: "narrow" }, [
          block("BL-4041", "cta", {
            heading: "No encontramos esta página",
            body: "Puede que el link esté viejo o que el producto ya no esté publicado.",
            buttonLabel: "Volver al inicio", buttonHref: "/", tone: "neutral",
          }),
        ]),
      ],
    },
    published: {
      sections: [
        section("SC-4041", "Mensaje", { width: "narrow" }, [
          block("BL-4041", "cta", {
            heading: "No encontramos esta página",
            body: "Puede que el link esté viejo o que el producto ya no esté publicado.",
            buttonLabel: "Volver al inicio", buttonHref: "/", tone: "neutral",
          }),
        ]),
      ],
    },
    createdAt: atDaysAgo(220), updatedAt: atDaysAgo(220, "10", "00"), updatedBy: "Sistema",
    publishedAt: atDaysAgo(220, "10", "00"), publishedBy: "Sistema",
  },
  {
    id: "PG-GRACIAS", type: "sistema", slug: "gracias", title: "Gracias por tu compra",
    status: "publicada", publishAt: null,
    seo: { title: "Gracias por tu compra", description: "", ogMediaId: null, noindex: true },
    draft: {
      sections: [
        section("SC-G1", "Mensaje", { width: "narrow" }, [
          block("BL-G1", "cta", {
            heading: "¡Gracias! Ya estamos preparando tu pedido",
            body: "Te mandamos el comprobante por mail. Cuando despachemos vas a recibir el código de seguimiento.",
            buttonLabel: "Seguir comprando", buttonHref: "/", tone: "accent",
          }),
        ]),
        section("SC-G2", "Sugeridos", { background: "sunken" }, [
          block("BL-G2", "product-carousel", {
            heading: "Sumá a tu próximo pedido", collectionId: "CO-MAS-VENDIDOS",
            limit: 8, cardStyle: "minimal", showPrice: true, showBadge: false, hideOutOfStock: true,
          }),
        ]),
      ],
    },
    published: {
      sections: [
        section("SC-G1", "Mensaje", { width: "narrow" }, [
          block("BL-G1", "cta", {
            heading: "¡Gracias! Ya estamos preparando tu pedido",
            body: "Te mandamos el comprobante por mail. Cuando despachemos vas a recibir el código de seguimiento.",
            buttonLabel: "Seguir comprando", buttonHref: "/", tone: "accent",
          }),
        ]),
        section("SC-G2", "Sugeridos", { background: "sunken" }, [
          block("BL-G2", "product-carousel", {
            heading: "Sumá a tu próximo pedido", collectionId: "CO-MAS-VENDIDOS",
            limit: 8, cardStyle: "minimal", showPrice: true, showBadge: false, hideOutOfStock: true,
          }),
        ]),
      ],
    },
    createdAt: atDaysAgo(220), updatedAt: atDaysAgo(30, "14", "00"), updatedBy: "María López",
    publishedAt: atDaysAgo(30, "14", "01"), publishedBy: "María López",
  },
];

/** Historial sembrado, para que la pantalla de versiones no arranque vacía. */
export const pageVersions = [
  { id: "PV-1", pageId: "PG-HOME", label: "Portada de temporada", note: "Se cambió el hero por la campaña nueva.", publishedAt: atDaysAgo(6, "11", "05"), publishedBy: "María López", tree: null },
  { id: "PV-2", pageId: "PG-HOME", label: "Sumamos beneficio mayorista", note: "", publishedAt: atDaysAgo(20, "17", "30"), publishedBy: "María López", tree: null },
  { id: "PV-3", pageId: "PG-TRAIL", label: "Publicación inicial", note: "", publishedAt: atDaysAgo(11, "10", "20"), publishedBy: "María López", tree: null },
];
